import { describe, expect, it } from "vitest";

import { stripImageMetadata } from "./media";

const text = (value: string) => new TextEncoder().encode(value);
const GPS = "GPS 48.8566 2.3522";

function bytesOf(...parts: (number[] | Uint8Array)[]): Uint8Array {
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

function contains(haystack: Uint8Array, needle: string): boolean {
  return Buffer.from(haystack).includes(Buffer.from(needle));
}

function jpegSegment(marker: number, payload: Uint8Array) {
  const length = payload.length + 2;
  return bytesOf([0xff, marker, length >> 8, length & 0xff], payload);
}

function pngChunk(type: string, payload: Uint8Array) {
  const length = payload.length;
  return bytesOf(
    [length >>> 24, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff],
    text(type),
    payload,
    [0, 0, 0, 0],
  );
}

function riffChunk(id: string, payload: Uint8Array) {
  const size = payload.length;
  return bytesOf(
    text(id),
    [size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, size >>> 24],
    payload,
    size % 2 ? [0] : [],
  );
}

describe("photos sans métadonnées", () => {
  it("JPEG : EXIF, XMP, IPTC et commentaires retirés, image intacte", () => {
    const scan = bytesOf([0xff, 0xda, 0, 2, 1, 2, 3], [0xff, 0xd9]);
    const jpeg = bytesOf(
      [0xff, 0xd8],
      jpegSegment(0xe0, text("JFIF\0")),
      jpegSegment(0xe1, text(`Exif\0\0${GPS}`)),
      jpegSegment(0xed, text(`Photoshop ${GPS}`)),
      jpegSegment(0xfe, text(GPS)),
      jpegSegment(0xdb, Uint8Array.from([0, 1, 2])),
      scan,
    );
    const clean = stripImageMetadata(jpeg, "image/jpeg");
    expect(clean && contains(clean, "GPS")).toBe(false);
    expect(clean && contains(clean, "JFIF")).toBe(true);
    expect(clean && Buffer.from(clean).subarray(-scan.length)).toEqual(
      Buffer.from(scan),
    );
  });

  it("PNG : eXIf et textes retirés, IHDR, IDAT et IEND gardés", () => {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const kept = [
      pngChunk("IHDR", new Uint8Array(13)),
      pngChunk("IDAT", Uint8Array.from([1, 2, 3])),
      pngChunk("IEND", new Uint8Array()),
    ];
    const png = bytesOf(
      signature,
      kept[0] ?? [],
      pngChunk("eXIf", text(GPS)),
      pngChunk("tEXt", text(`Comment\0${GPS}`)),
      kept[1] ?? [],
      kept[2] ?? [],
    );
    expect(stripImageMetadata(png, "image/png")).toEqual(
      bytesOf(signature, ...kept),
    );
  });

  it("WebP : blocs EXIF et XMP retirés, indicateurs VP8X effacés, taille RIFF juste", () => {
    const body = bytesOf(
      text("WEBP"),
      riffChunk(
        "VP8X",
        Uint8Array.from([0x0c | 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      ),
      riffChunk("VP8L", Uint8Array.from([1, 2, 3])),
      riffChunk("EXIF", text(GPS)),
      riffChunk("XMP ", text(GPS)),
    );
    const webp = bytesOf(text("RIFF"), [body.length, 0, 0, 0], body);
    const clean = stripImageMetadata(webp, "image/webp");
    expect(clean && contains(clean, "GPS")).toBe(false);
    expect(clean?.[20]).toBe(0x10);
    const view = clean && new DataView(clean.buffer);
    expect(view?.getUint32(4, true)).toBe((clean?.length ?? 0) - 8);
  });

  it("refuse une structure illisible plutôt que de garder des métadonnées", () => {
    expect(
      stripImageMetadata(
        Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]),
        "image/jpeg",
      ),
    ).toBeNull();
    expect(
      stripImageMetadata(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
        "image/png",
      ),
    ).toBeNull();
  });
});

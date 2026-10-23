import { createHash } from "node:crypto";

import { concatBytes } from "@/domains/commun/utilitaires";

/**
 * Fichiers acceptés (architecture §7, ADR 0019) : le type est lu dans les premiers octets
 * du fichier, jamais repris du nom ou de ce que déclare l'expéditeur. Pas de SVG ni de PDF
 * ici : une image ou un son seulement, qui ne peut pas exécuter de script une fois servi.
 */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_VOICE_BYTES = 16 * 1024 * 1024;
export const MAX_CAPTURE_BYTES = 5 * 1024 * 1024;

export type ImageType = "image/jpeg" | "image/png" | "image/webp";
export type AudioType = "audio/ogg" | "audio/wav" | "audio/mpeg";

function startsWith(bytes: Uint8Array, signature: readonly number[], at = 0) {
  return signature.every((value, index) => bytes[at + index] === value);
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "image/png";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8))
    return "image/webp";
  return null;
}

export function sniffAudio(bytes: Uint8Array): AudioType | null {
  if (startsWith(bytes, ascii("OggS"))) return "audio/ogg";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WAVE"), 8))
    return "audio/wav";
  if (
    startsWith(bytes, ascii("ID3")) ||
    (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
  )
    return "audio/mpeg";
  return null;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Blocs d'un fichier RIFF (WAV, WebP) : identifiant, début et taille des données. */
export function riffChunks(
  bytes: Uint8Array,
): { id: string; start: number; size: number }[] {
  const chunks: { id: string; start: number; size: number }[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length && chunks.length < 64) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size > bytes.length) break;
    chunks.push({ id, start, size });
    offset = start + size + (size % 2);
  }
  return chunks;
}

/** Durée d'un WAV PCM (millisecondes), ou null si elle ne peut pas être lue. */
export function wavDurationMs(bytes: Uint8Array): number | null {
  if (sniffAudio(bytes) !== "audio/wav") return null;
  const chunks = riffChunks(bytes);
  const format = chunks.find((chunk) => chunk.id === "fmt ");
  const data = chunks.find((chunk) => chunk.id === "data");
  if (!format || !data || format.size < 16) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const byteRate = view.getUint32(format.start + 8, true);
  if (byteRate === 0) return null;
  const ms = Math.round((data.size / byteRate) * 1000);
  return ms >= 1 && ms <= 3_600_000 ? ms : null;
}

/** « 0:07 », « 1:32 » : durée lisible d'un message vocal. */
export function durationLabel(ms: number | null): string {
  if (ms === null) return "durée inconnue";
  const seconds = Math.max(1, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Photo sans ses métadonnées (EXIF, XMP, IPTC, commentaires) : la position GPS et l'appareil
 * du propriétaire ne sont ni conservés, ni servis, ni transmis à l'IA. L'image elle-même
 * n'est pas modifiée. Renvoie null si la structure du fichier ne peut pas être lue.
 */
export function stripImageMetadata(
  bytes: Uint8Array,
  type: ImageType,
): Uint8Array | null {
  if (type === "image/jpeg") return stripJpeg(bytes);
  if (type === "image/png") return stripPng(bytes);
  return stripWebp(bytes);
}

/** APP1 (EXIF, XMP), APP13 (IPTC) et commentaires retirés ; le reste est recopié. */
function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Début de l'image compressée : tout le reste est recopié tel quel.
    if (marker === 0xda) {
      parts.push(bytes.subarray(offset));
      return concatBytes(parts);
    }
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) return null;
    if (marker !== 0xe1 && marker !== 0xed && marker !== 0xfe)
      parts.push(bytes.subarray(offset, end));
    offset = end;
  }
  return null;
}

const PNG_DROPPED = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > bytes.length) return null;
    if (!PNG_DROPPED.has(type)) parts.push(bytes.subarray(offset, end));
    offset = end;
    if (type === "IEND") return concatBytes(parts);
  }
  return null;
}

/** Blocs EXIF et XMP retirés, et leurs indicateurs effacés dans l'en-tête VP8X. */
function stripWebp(bytes: Uint8Array): Uint8Array | null {
  const chunks = riffChunks(bytes);
  const last = chunks.at(-1);
  if (!last || last.start + last.size + (last.size % 2) !== bytes.length)
    return null;
  const parts: Uint8Array[] = [];
  for (const chunk of chunks) {
    if (chunk.id === "EXIF" || chunk.id === "XMP ") continue;
    const whole = bytes.slice(
      chunk.start - 8,
      chunk.start + chunk.size + (chunk.size % 2),
    );
    if (chunk.id === "VP8X" && whole.length > 8)
      whole[8] = (whole[8] ?? 0) & ~0x0c;
    parts.push(whole);
  }
  const body = concatBytes(parts);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concatBytes([header, body]);
}

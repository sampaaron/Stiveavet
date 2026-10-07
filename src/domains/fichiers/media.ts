import { createHash } from "node:crypto";

/**
 * Fichiers acceptés (architecture §7, ADR 0019) : le type est lu dans les premiers octets
 * du fichier, jamais repris du nom ou de ce que déclare l'expéditeur. Pas de SVG ni de PDF
 * ici : une image ou un son seulement, qui ne peut pas exécuter de script une fois servi.
 */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_VOICE_BYTES = 16 * 1024 * 1024;
export const MAX_CAPTURE_BYTES = 5 * 1024 * 1024;

export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AUDIO_TYPES = ["audio/ogg", "audio/wav", "audio/mpeg"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export type AudioType = (typeof AUDIO_TYPES)[number];

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

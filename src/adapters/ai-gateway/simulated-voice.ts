import { riffChunks } from "@/domains/fichiers/media";

/**
 * Messages vocaux simulés (phase 2, ADR 0019) : un vrai fichier WAV (une note douce), qui
 * porte dans son bloc de commentaire le texte « prononcé ». La transcription simulée lit ce
 * texte ; une vraie transcription écoutera le son. Rien d'autre n'est caché dans le fichier.
 */
const SAMPLE_RATE = 8000;
const MAX_TEXT_BYTES = 4000;

function chunk(id: string, data: Uint8Array): Uint8Array {
  const padded = data.length + (data.length % 2);
  const out = new Uint8Array(8 + padded);
  out.set([...id].map((char) => char.charCodeAt(0)));
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** WAV 8 kHz, 8 bits, mono ; environ une seconde pour quinze caractères (1 à 20 s). */
export function buildSimulatedVoiceNote(spokenText: string): Uint8Array {
  const text = new TextEncoder().encode(spokenText.trim());
  if (text.length === 0 || text.length > MAX_TEXT_BYTES)
    throw new Error("Texte du vocal simulé invalide");
  const seconds = Math.min(20, Math.max(1, Math.ceil(spokenText.length / 15)));
  const samples = new Uint8Array(SAMPLE_RATE * seconds);
  for (let index = 0; index < samples.length; index += 1)
    samples[index] =
      128 +
      Math.round(12 * Math.sin((2 * Math.PI * 220 * index) / SAMPLE_RATE));

  const format = new Uint8Array(16);
  const view = new DataView(format.buffer);
  view.setUint16(0, 1, true); // PCM
  view.setUint16(2, 1, true); // mono
  view.setUint32(4, SAMPLE_RATE, true);
  view.setUint32(8, SAMPLE_RATE, true); // octets par seconde
  view.setUint16(12, 1, true);
  view.setUint16(14, 8, true);

  const info = concat([
    new TextEncoder().encode("INFO"),
    chunk("ICMT", concat([text, new Uint8Array([0])])),
  ]);
  const body = concat([
    new TextEncoder().encode("WAVE"),
    chunk("fmt ", format),
    chunk("LIST", info),
    chunk("data", samples),
  ]);
  return concat([chunk("RIFF", body)]);
}

/** Texte « prononcé » d'un vocal simulé, ou null pour tout autre fichier. */
export function readSimulatedVoiceText(bytes: Uint8Array): string | null {
  const list = riffChunks(bytes).find(
    (candidate) =>
      candidate.id === "LIST" &&
      String.fromCharCode(
        ...bytes.subarray(candidate.start, candidate.start + 4),
      ) === "INFO",
  );
  if (!list) return null;
  let offset = list.start + 4;
  const end = list.start + list.size;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 8 <= end) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (offset + 8 + size > end) return null;
    if (id === "ICMT") {
      const text = new TextDecoder("utf-8", { fatal: false })
        .decode(bytes.subarray(offset + 8, offset + 8 + size))
        .replace(/\0+$/, "")
        .trim();
      return text.length ? text : null;
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

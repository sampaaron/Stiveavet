/**
 * Lecture d'un corps de requête ou de réponse avec une taille maximale. La lecture s'arrête
 * dès que la limite est dépassée : un envoi « chunked » sans Content-Length ne peut pas
 * remplir la mémoire. Renvoie `null` si le corps est trop gros.
 */
export async function readCappedBody(
  message: { body: ReadableStream<Uint8Array> | null; headers: Headers },
  maxBytes: number,
): Promise<Uint8Array | null> {
  const declared = Number(message.headers.get("content-length") ?? "0");
  if (!(declared <= maxBytes)) {
    await message.body?.cancel();
    return null;
  }
  if (!message.body) return new Uint8Array();
  const reader = message.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

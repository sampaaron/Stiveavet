import { describe, expect, it } from "vitest";

import { readCappedBody } from "./capped-body";

function streamed(chunks: number[], headers: HeadersInit = {}) {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const size = chunks[pulled];
      pulled += 1;
      if (size === undefined) controller.close();
      else controller.enqueue(new Uint8Array(size));
    },
  });
  return {
    message: { body, headers: new Headers(headers) },
    pulled: () => pulled,
  };
}

describe("lecture d'un corps limité", () => {
  it("rend le corps entier sous la limite", async () => {
    const { message } = streamed([3, 4]);
    expect((await readCappedBody(message, 10))?.byteLength).toBe(7);
  });

  it("s'arrête dès la limite dépassée, sans Content-Length", async () => {
    const { message, pulled } = streamed([6, 6, 6, 6, 6, 6]);
    expect(await readCappedBody(message, 10)).toBeNull();
    expect(pulled()).toBeLessThanOrEqual(3);
  });

  it("refuse une taille annoncée trop grande ou illisible sans rien lire", async () => {
    for (const length of ["11", "abc"]) {
      const { message, pulled } = streamed([1], { "content-length": length });
      expect(await readCappedBody(message, 10)).toBeNull();
      expect(pulled()).toBe(0);
    }
  });
});

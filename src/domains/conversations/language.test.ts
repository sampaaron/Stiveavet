import { describe, expect, it } from "vitest";

import { detectLanguage } from "./language";

describe("langue d'un message du propriétaire", () => {
  it("reconnaît un message clairement écrit en anglais ou en français", () => {
    expect(
      detectLanguage("She is eating well today and she seems fine, thank you"),
    ).toBe("en");
    expect(
      detectLanguage("Elle mange bien depuis ce matin et elle dort beaucoup"),
    ).toBe("fr");
  });

  it("ne tranche pas sur un mot-clé, un message court ou un mélange", () => {
    for (const text of [
      "OUI",
      "STOP",
      "YES",
      "Merci !",
      "ok",
      "2",
      "Filou",
      "Elle dort bien",
      "She is fine",
    ])
      expect(detectLanguage(text), text).toBeNull();
    expect(detectLanguage("Thanks, elle mange bien and she eats")).toBeNull();
  });
});

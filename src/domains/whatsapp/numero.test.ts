import { describe, expect, it } from "vitest";

import { alertPhoneInput, maskPhone, toE164 } from "./numero";

describe("numéro d'alerte", () => {
  it("met un numéro saisi au format international", () => {
    expect(toE164("06 12 34 56 78")).toBe("+33612345678");
    expect(toE164("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(toE164("0033612345678")).toBe("+33612345678");
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
  });

  it("refuse un numéro incomplet ou sans indicatif ; vide retire le numéro", () => {
    expect(toE164("612345678")).toBeNull();
    expect(toE164("+33")).toBeNull();
    expect(alertPhoneInput.safeParse("abc").success).toBe(false);
    expect(alertPhoneInput.parse("  ")).toBeNull();
  });

  it("ne laisse lire que les deux derniers chiffres", () => {
    expect(maskPhone("+33639980101")).toBe("•• •• •• •• 01");
  });
});

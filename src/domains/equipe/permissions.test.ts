import { describe, expect, it } from "vitest";

import { PERMISSION_KEYS, isPermissionKey } from "./permissions";

describe("clés de permission", () => {
  it("ne reconnaît que les clés du catalogue, jamais une propriété héritée", () => {
    for (const key of PERMISSION_KEYS) expect(isPermissionKey(key)).toBe(true);
    for (const value of ["", "billing", "toString", "__proto__", "constructor"])
      expect(isPermissionKey(value)).toBe(false);
  });
});

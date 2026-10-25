import { describe, expect, it } from "vitest";

import { deviceLabel } from "./device";

describe("deviceLabel", () => {
  it("reconnaît le navigateur et le système", () => {
    expect(
      deviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 Edg/140.0",
      ),
    ).toBe("Edge · Windows");
    expect(
      deviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari · iOS");
  });

  it("ne renvoie rien sans User-Agent exploitable", () => {
    expect(deviceLabel(null)).toBeNull();
    expect(deviceLabel("curl/8.0")).toBeNull();
  });
});

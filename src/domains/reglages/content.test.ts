import { describe, expect, it } from "vitest";

import {
  appointmentDurationsInput,
  messageWindowsInput,
  windowInput,
} from "./content";

describe("réglages", () => {
  it("refuse deux plages le même jour", () => {
    const result = messageWindowsInput.safeParse([
      { weekday: 1, startsAt: "08:00", endsAt: "12:00" },
      { weekday: 1, startsAt: "14:00", endsAt: "18:00" },
    ]);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("one_window_per_day");
  });

  it("renvoie des codes de validation, traduits par les actions", () => {
    const message = (input: unknown) =>
      windowInput.safeParse(input).error?.issues[0]?.message;
    expect(message({ weekday: 1, startsAt: "8h", endsAt: "12:00" })).toBe(
      "time_format",
    );
    expect(message({ weekday: 1, startsAt: "12:00", endsAt: "08:00" })).toBe(
      "end_before_start",
    );
    expect(
      appointmentDurationsInput.safeParse({
        post_op_control: 7,
        emergency: 15,
        treatment_followup: 15,
        other: 15,
      }).error?.issues[0]?.message,
    ).toBe("duration_step");
  });
});

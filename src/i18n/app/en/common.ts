import type { AppDictionary } from "../types";

export const common: AppDictionary["common"] = {
  invalidRequest: "Invalid request. Please reload the page.",
  save: "Save",
  cancel: "Cancel",
  confirm: "Confirm",
  close: "Close",
  edit: "Edit",
  remove: "Remove",
  back: "Back",
  loading: "Loading…",
  saved: "Saved.",
  yes: "Yes",
  no: "No",
  none: "None",
  optional: "optional",
  simulated: "simulated",
  numaAi: "AI assistant",
  stiveAi: "AI assistant",
  and: "and",
  list: (items) =>
    items.length <= 1
      ? (items[0] ?? "")
      : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`,
  language: {
    label: "Interface language:",
    switchTo: "Français",
  },
};

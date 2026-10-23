import type { AppDictionary } from "../types";

import { shared } from "./shared";

export const ui: AppDictionary["ui"] = {
  ...shared,
  capacity: {
    label: "Active follow-ups",
    valueText: (used, included) =>
      `${used} active follow-ups out of ${included} included`,
    remaining: (count) =>
      count === 1 ? "1 included place left" : `${count} included places left`,
    full: (price) =>
      `Included places used: each new follow-up is billed ${price} excl. VAT`,
  },
  agendaEvent: {
    kinds: {
      consultation: "Consultation",
      chirurgie: "Surgery",
      controle: "Check-up",
      urgence: "Emergency",
    },
    pending: "To confirm",
  },
  fileDrop: {
    prompt: "Drop the image here",
    browse: "or click to choose a file",
    replace: "Click to choose another image",
  },
};

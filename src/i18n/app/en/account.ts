import type { AppDictionary } from "../types";

export const account: AppDictionary["account"] = {
  title: "My account",
  description: "Your personal information in Stivea Vet. Only you can see it.",
  open: "Open my account",
  identity: {
    title: "Identity",
    name: "Display name",
    email: "Sign-in email address",
    role: "Role at the practice",
    organization: "Practice",
    joinedAt: "Practice member since",
    language: "Interface language",
  },
  alerts: {
    title: "Urgent alerts",
    description:
      "Business WhatsApp number where Stivea Vet warns you of an emergency, without any medical detail.",
    phone: "Alert number",
    none: "No number saved",
    manage: "Change in Alerts",
  },
  rights: {
    title: "Your permissions",
    description:
      "What your role and your plan allow you to do. Only a practice administrator can change them.",
  },
  security: {
    title: "Security",
    description:
      "Your latest sign-ins. If one of them was not you, change your password and tell the practice administrator.",
    empty: "No sign-in recorded yet.",
    unknownDevice: "Unrecognised device",
    changePassword: "Change my password",
  },
};

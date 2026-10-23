import type { AppDictionary } from "../types";

export const account: AppDictionary["account"] = {
  title: "Account security",
  description:
    "Your password, open sessions and trusted devices. These settings only concern you.",
  password: {
    title: "Password",
    description:
      "Changing your password signs out all your other sessions; you receive a confirmation e-mail.",
    current: "Current password",
    submit: "Change password",
    changed:
      "Password changed. Your other sessions are signed out and a confirmation e-mail has been sent to you.",
  },
  sessions: {
    title: "Open sessions",
    description:
      "The browsers where you are signed in. A session closes on its own after 12 hours.",
    thisDevice: "This device",
    unknownDevice: "Unidentified device",
    opened: (date: string) => `Opened on ${date}`,
    lastActive: (date: string) => `last active on ${date}`,
    revokeOthers: "Sign out other devices",
    noOthers: "No other open session.",
    revoked: (count: number) =>
      count > 1
        ? `${count} other sessions have been signed out.`
        : count === 1
          ? "The other session has been signed out."
          : "No other session was open.",
  },
  devices: {
    title: "Trusted devices",
    description:
      "On these devices, no security code is requested at sign-in for 90 days. Remove the ones you no longer use.",
    none: "No trusted device. Vets are asked for the security code on every new device.",
    added: (date: string) => `Recognised on ${date}`,
    until: (date: string) => `until ${date}`,
    revoke: "Remove",
    revokeLabel: (device: string) => `Remove trusted device ${device}`,
    revoked:
      "Device removed: the security code will be requested at the next sign-in.",
    notFound: "This device is no longer in the list. Please reload the page.",
  },
};

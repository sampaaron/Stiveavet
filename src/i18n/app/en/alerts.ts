import type { AppDictionary } from "../types";

export const alerts: AppDictionary["alerts"] = {
  title: "Alerts",
  description:
    "Owner messages classed as urgent or to watch by the triage rules. Numa makes no diagnosis: every alert awaits a decision from the team, and an emergency always a vet's.",
  done: {
    recue: "Acknowledged: the escalation is cancelled.",
    close: "Alert closed.",
    confiee: "Alert reassigned: the chosen vet has been notified.",
    transmise: "Alert passed on: the vet will find it under “To do”.",
  },
  views: {
    label: "Show",
    open: "Open",
    history: "History",
  },
  history: {
    section: "Closed alerts",
    description:
      "The latest 100 closed alerts from the files you can read, with who closed them.",
    emptyTitle: "No closed alerts",
    emptyDescription: "Closed alerts will appear here.",
  },
  empty: {
    section: "No open alerts",
    title: "Nothing to handle",
    description:
      "Emergencies and signs to watch reported by owners will appear here.",
  },
  groups: { urgent: "Emergencies", watch: "To watch" },
  notice: {
    pending: (urgent: number, watch: number) => {
      const parts = [
        urgent
          ? `${urgent} ${urgent === 1 ? "emergency" : "emergencies"}`
          : null,
        watch ? `${watch} ${watch === 1 ? "alert" : "alerts"} to watch` : null,
      ].filter((part): part is string => part !== null);
      return `${parts.join(" and ")} not yet acknowledged.`;
    },
    view: "View alerts",
  },
  card: {
    urgentPending: (time: string) =>
      `Emergency reported at ${time}, not yet acknowledged`,
    urgent: (time: string) => `Emergency reported at ${time}`,
    watch: (time: string) => `To watch since ${time}`,
    openFile: (animalName: string) => `Open ${animalName}'s file`,
  },
  status: {
    openEscalating: (target: string, time: string) =>
      `Notified: ${target}. If not acknowledged, the whole veterinary team will be alerted at ${time}.`,
    open: (target: string) => `Notified: ${target}.`,
    escalated: (time: string | null) =>
      `Not acknowledged: the whole veterinary team has been alerted${time ? ` at ${time}` : ""}.`,
    acknowledgedWatch: (by: string | null, time: string | null) =>
      `Handled by ${by ?? "the team"}${time ? ` since ${time}` : ""}.`,
    withTeam: (target: string) =>
      `Handled by the team first; ${target} sees it in the noon and 6 pm recap.`,
    forwarded: (by: string | null, target: string, time: string) =>
      `Passed on to ${target} by ${by ?? "the team"} at ${time}.`,
    acknowledged: (by: string | null, time: string | null) =>
      `Acknowledged by ${by ?? "a vet"}${time ? ` at ${time}` : ""}. The escalation is cancelled.`,
    resolved: (by: string | null, date: string | null) =>
      `Closed by ${by ?? "a vet"}${date ? ` on ${date}` : ""}.`,
  },
  buttons: {
    acknowledge: "Acknowledge",
    resolve: "Close the alert",
    takeCharge: "I'll handle it",
    forward: "Pass on to the vet",
  },
  reassign: {
    label: "Assign to",
    submit: "Assign",
    current: (name: string) => `${name} (current)`,
  },
  phone: {
    title: "My number for urgent alerts",
    description:
      "Business WhatsApp number where Stivea Vet tells you about an emergency, with no medical details. It is used for these alerts only.",
    current: (masked: string) => `Saved number: ${masked}.`,
    none: "No number: emergencies only appear in Stivea Vet.",
    label: "WhatsApp number",
    hint: "For example +44 7700 900123. Leave empty to remove it.",
    submit: "Save the number",
    saved: "Alert number saved.",
    invalid: "Invalid number: enter a full mobile number.",
  },
};

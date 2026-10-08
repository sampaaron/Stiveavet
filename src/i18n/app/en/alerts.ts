import type { AppDictionary } from "../types";

export const alerts: AppDictionary["alerts"] = {
  title: "Alerts",
  description:
    "Owner messages classed as urgent or to watch by the triage rules. Numa makes no diagnosis: every alert awaits a vet's decision.",
  done: {
    recue: "Acknowledged: the escalation is cancelled.",
    close: "Alert closed.",
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
    acknowledged: (by: string | null, time: string | null) =>
      `Acknowledged by ${by ?? "a vet"}${time ? ` at ${time}` : ""}. The escalation is cancelled.`,
    resolved: "Alert closed.",
  },
  buttons: {
    acknowledge: "Acknowledge",
    resolve: "Close the alert",
  },
};

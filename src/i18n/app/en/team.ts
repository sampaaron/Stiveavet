import type { AppDictionary } from "../types";

export const team: AppDictionary["team"] = {
  title: "Team and permissions",
  description: (vets: number, limit: number) =>
    `${vets} of ${limit} vet seats used on your plan, pending invitations included. Veterinary assistants are unlimited.`,
  invite: {
    title: "Invite a member",
    description:
      "They receive a link by e-mail, valid for 7 days and usable only once.",
    name: "Name",
    email: "E-mail address",
    role: "Role",
    submit: "Send the invitation",
  },
  pending: {
    title: "Pending invitations",
    until: (date: string) => `until ${date}`,
    cancel: "Cancel",
    cancelLabel: (email: string) => `Cancel the invitation to ${email}`,
  },
  members: {
    title: "Members",
    you: "you",
    activeFollowups: (count: number) =>
      count === 1 ? "1 active follow-up" : `${count} active follow-ups`,
    accessRemoved: "Access removed",
    adminHasAll:
      "An admin vet has every permission. Change their role to restrict them.",
  },
  permissions: {
    legend: (name: string) => `${name}'s permissions`,
    optional: "optional",
    submit: "Save permissions",
  },
  role: {
    label: (name: string) => `${name}'s role`,
    submit: "Change role",
  },
  deactivate: {
    reassignLabel: (count: number) =>
      count > 1
        ? `Their ${count} active follow-ups go to`
        : "Their active follow-up goes to",
    chooseVet: "Choose a vet…",
    submit: "Remove access",
    submitLabel: (name: string) => `Remove ${name}'s access`,
  },
  reactivate: {
    submit: "Restore access",
    submitLabel: (name: string) => `Restore ${name}'s access`,
  },
  notices: {
    invited: "Invitation sent. The link is valid for 7 days.",
    invitationRevoked: "Invitation cancelled.",
    permissionsSaved: "Permissions saved.",
    roleChanged: "Role changed. Permissions are back to the role's defaults.",
    deactivated: "Access removed. Their sessions have been closed.",
    reactivated: "Access restored.",
  },
  validation: {
    email_too_long: "Address too long.",
    email_invalid: "Invalid e-mail address.",
    name_missing: "Enter the person's name.",
    name_too_long: "Name too long.",
    fallback: "Check the name, e-mail address and role.",
  },
};

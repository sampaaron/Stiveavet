import type { AppDictionary } from "../types";

export const followups: AppDictionary["followups"] = {
  title: "Follow-ups",
  list: {
    descriptionClinical: "The follow-ups you can view.",
    descriptionSummary:
      "Organisational view: animal, owner, status and responsible vet. Clinical data is restricted to vets.",
    launch: "Start a follow-up",
    emptyTitle: "No follow-ups to show",
    emptyDescription:
      "Follow-ups you are responsible for or that are shared with you will appear here.",
    private: "Private",
    controlOn: (date: string) => `Check-up on ${date}`,
    controlNone: "No check-up scheduled",
  },
  testMark: "Test follow-up",
  create: {
    title: "Start a follow-up",
    back: "Follow-ups",
    description:
      "Search for the animal in dr.veto. Stivea Vet imports the relevant summary read-only, then suggests a launch sheet for you to review.",
    searchLabel: "Animal, owner or dr.veto ID",
    searchPlaceholder: "E.g. Plume, Girard, DV-20481",
    search: "Search",
    simulatedNote:
      "Simulated dr.veto: fictitious animals and owners, no calls to the real software.",
    notConnectedTitle: "dr.veto is not connected yet",
    openSettings: "Open settings",
    notConnectedBody: "Connect the practice software to find your patients.",
    found: (count: number) => `${count} animal${count > 1 ? "s" : ""} found`,
    noResults: "No results",
    noMatchTitle: "No matching animal",
    noMatchDescription: "Check the spelling or search by the owner's name.",
    openFollowupLabel: (name: string) => `Open ${name}'s follow-up`,
    alreadyOpen: "Follow-up already open",
    prepareLabel: (name: string) => `Prepare the sheet for ${name}`,
    prepare: "Prepare the sheet",
  },
  sheet: {
    title: "Launch sheet",
    back: (name: string) => `${name}'s file`,
    draftHeading: (name: string) => `Launch sheet for ${name}`,
    editHeading: (name: string) => `Edit ${name}'s follow-up`,
    responsible: "Responsible vet:",
    saved: "Sheet saved.",
    protocolApplied:
      "Protocol applied: steps and warning signs taken from its version.",
    endedTitle: "Follow-up ended",
    endedBody: "Reactivate it from the file to edit its steps.",
    noProtocolTitle: "Choose a protocol",
    noProtocolBody:
      "No approved protocol matches the imported procedure. Choose one to build the sheet.",
    restrictedTitle: "Editing restricted",
    restrictedBody: "A launched follow-up can only be edited by a vet.",
    protocolTitle: "Protocol",
    protocolVersion: (name: string, version: number) =>
      `${name}, version ${version}`,
    protocolFrozen:
      "Version frozen at launch. Changes apply to this follow-up only.",
  },
  imported: {
    title: "Summary imported from dr.veto",
    importedOn: (date: string) => `Read-only · imported on ${date} (simulated)`,
    notImported: "Follow-up created in Stivea Vet, not imported.",
    animal: "Animal",
    procedure: "Procedure",
    procedureOn: (procedure: string, date: string) =>
      `${procedure}, on ${date}`,
    owners: "Owners",
    whatsapp: (phone: string) => `· WhatsApp ${phone}`,
    ownerLanguage: (language: string) => ` · ${language}`,
    secondInactive: " · second contact, inactive",
    allergies: "Allergies",
    noAllergies: "None reported",
    antecedents: "Medical history",
    noAntecedents: "None reported",
    externalRef: "dr.veto ID",
    control: "Scheduled check-up",
    controlNone: "Not scheduled",
  },
  protocolForm: {
    label: "Protocol",
    placeholder: "Choose an approved protocol",
    option: (name: string, version: number) => `${name} (version ${version})`,
    help: "Only protocols approved by a vet and suited to the species are offered. Changing protocol replaces the steps and warning signs on the sheet.",
    change: "Change protocol",
    apply: "Apply this protocol",
  },
  form: {
    firstMessageTitle: "Numa's first message",
    firstMessageDescription:
      "Numa introduces herself as the practice's AI assistant and asks for the owner's consent before any clinical follow-up.",
    hoursLabel: "Hours after the procedure",
    firstContactAt: (date: string) =>
      `Usual suggestion: 3 to 4 hours. Here: ${date}.`,
    firstContactAtLaunch: (date: string) =>
      `Usual suggestion: 3 to 4 hours. Here: ${date}, so as soon as it is launched.`,
    firstContactDefault:
      "Usual suggestion: 3 to 4 hours, adjust as you see fit.",
    responsibleLabel: "Responsible vet",
    responsibleHint:
      "Numa writes on their behalf; they are the one who launches the follow-up.",
    includeSecond: (name: string) => `Include ${name}, second owner`,
    secondHint:
      "Numa also asks for their consent. Once both have accepted, a WhatsApp group brings the owners and Numa together; anyone can leave it by sending STOP.",
    stepsTitle: "Numa's steps and questions",
    stepsDraft:
      "Taken from the protocol. Adjust them for this animal: the practice's protocol stays unchanged.",
    stepsLive:
      "Past steps stay as they are; upcoming steps replace the previous ones.",
    alertsTitle: "Warning signs",
    alertsDescription:
      "Approved by the vet. Numa never makes a diagnosis: she flags and, when in doubt, escalates.",
    treatmentsTitle: "Treatments",
    treatmentsDescription:
      "A treatment imported from dr.veto is only included in reminders to the owner once a vet has approved it. Numa never changes a dosage.",
    noTreatments: "No current treatment.",
    removedSuffix: " (removed on save)",
    validatedBy: (name: string) => `Approved by ${name}`,
    toValidate: "Imported from dr.veto, awaiting approval",
    validateTreatment: (name: string) => `I approve this treatment: ${name}`,
    keep: "Keep",
    remove: "Remove",
    keepTreatmentLabel: (name: string) => `Keep the treatment ${name}`,
    removeTreatmentLabel: (name: string) => `Remove the treatment ${name}`,
    newTreatment: (number: number) => `New treatment ${number}`,
    newInstructions: (number: number) => `Dosage for treatment ${number}`,
    newValidated: "Approved by you on save.",
    removeNewLabel: (number: number) => `Remove new treatment ${number}`,
    addTreatment: "Add a treatment",
    controlTitle: "Check-up appointment",
    controlLabel: "Check-up date and time",
    controlHint:
      "The automated follow-up will stop on this date; the conversation will stay open. Leave blank if no check-up is planned.",
    pendingTreatments: (count: number) =>
      count === 1
        ? "1 imported treatment has not been approved yet: it will not be included in reminders."
        : `${count} imported treatments have not been approved yet: they will not be included in reminders.`,
    launch: "Launch the follow-up",
    saveDraft: "Save draft",
    saveChanges: "Save changes",
    launchedBy: (name: string) =>
      `The follow-up will be launched by ${name}, responsible vet.`,
  },
  validation: {
    invalidControl: "Invalid check-up date.",
    invalidSheet:
      "Check the sheet: responsible vet, check-up date after the procedure, and treatments.",
    chooseProtocol: "Choose a protocol.",
    firstContactInteger: "First message: a whole number of hours.",
    firstContactNegative: "First message: the delay cannot be negative.",
    firstContactMax: (max: number) =>
      `First message: ${max} hours at most after the procedure.`,
    tooManySteps: (max: number) => `${max} steps at most.`,
    stepInteger: "Delay in whole hours.",
    stepNegative: "The delay cannot be negative.",
    stepMax: "Delay of 90 days at most.",
    stepShort: (min: number) => `Step: at least ${min} characters.`,
    stepLong: (max: number) => `Step: ${max} characters at most.`,
    keepOneAlert: "Keep at least one warning sign.",
    tooManyAlerts: (max: number) => `${max} warning signs at most.`,
    alertShort: (min: number) => `Warning sign: at least ${min} characters.`,
    alertLong: (max: number) => `Warning sign: ${max} characters at most.`,
    tooManyTreatments: (max: number) => `${max} treatments at most.`,
    treatmentShort: (min: number) => `Treatment: at least ${min} character(s).`,
    treatmentLong: (max: number) => `Treatment: ${max} characters at most.`,
    instructionsShort: (min: number) => `Dosage: at least ${min} character(s).`,
    instructionsLong: (max: number) => `Dosage: ${max} characters at most.`,
  },
};

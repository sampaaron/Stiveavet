import type { SiteDictionary } from "./types";

/** Public site copy in English. Same rules and structure as the French reference (fr.ts). */
export const en: SiteDictionary = {
  meta: {
    home: {
      title: "Post-consultation follow-up for veterinary practices",
      description:
        "Stivea Vet follows up with your patients after a procedure on WhatsApp with Numa, an AI assistant, and prepares useful summaries for your consultations.",
    },
    how: {
      title: "How it works",
      description:
        "From launching a follow-up to the pre-consultation summary: how Stivea Vet fits into the practice's day.",
    },
    numa: {
      title: "Numa, the AI assistant for owners",
      description:
        "Numa talks with owners on WhatsApp on behalf of the practice. She introduces herself as an AI and never makes a medical decision.",
    },
    stive: {
      title: "Stive, the team's AI assistant",
      description:
        "Stive helps vets and the team inside Stivea Vet: daily briefing, file summaries, drafts. Every real action is confirmed by a vet.",
    },
    integrations: {
      title: "Integrations",
      description:
        "dr.veto at launch, Vétocom and Vetup coming soon, the practice's WhatsApp Business.",
    },
    pricing: {
      title: "Pricing",
      description:
        "Pilot trial at €86 excl. VAT per month for 2 months, then Solo, Solo Pro, Clinic or Clinic Pro. Prices excl. VAT, per practice.",
    },
    security: {
      title: "Security and data",
      description:
        "Practice isolation, personal accounts and permissions, activity log, hosting in Europe, kept for one year at most.",
    },
    help: {
      title: "Help centre",
      description: "Stivea Vet guides and support.",
    },
    status: {
      title: "Stivea Vet status",
      description: "Stivea Vet outages and maintenance.",
    },
    trial: {
      title: "Start the trial",
      description:
        "2-month pilot trial at €86 excl. VAT per month, in real use and without commitment.",
    },
    demo: {
      title: "Request the demo",
      description: "Discover Stivea Vet on a fictional practice, read-only.",
    },
    demoSpace: {
      title: "Demo",
      description: "Stivea Vet demo on fictional data.",
    },
    terms: {
      title: "Terms of use",
      description: "Stivea Vet terms of use (draft).",
    },
    privacy: {
      title: "Privacy",
      description: "Stivea Vet privacy policy (draft).",
    },
    unsubscribe: {
      title: "Unsubscribe",
      description: "Stop receiving Stivea Vet e-mails.",
    },
  },

  common: {
    brandVet: "vet",
    skipToContent: "Skip to content",
    ctaTrial: "Start the trial at {price} excl. VAT",
    ctaDemo: "See the demo",
    login: "Log in",
    numaAi: "AI assistant",
    stiveAi: "AI assistant",
    exclVat: "excl. VAT",
    perMonth: "per month",
    soon: "Coming soon",
    atLaunch: "At launch",
    fictionalData: "Fictional data",
    appInFrench:
      "During the pilot, the Stivea Vet workspace is available in French; the English interface is on its way.",
  },

  nav: {
    label: "Main navigation",
    menu: "Menu",
    links: {
      how: "How it works",
      numa: "Numa",
      stive: "Stive",
      integrations: "Integrations",
      pricing: "Pricing",
      security: "Security",
    },
    switchLanguage: "Français",
    switchLanguageLabel: "Lire cette page en français",
  },

  footer: {
    tagline:
      "Post-consultation follow-up for veterinary practices, with Numa and Stive, two AI assistants working for your team.",
    product: "Product",
    resources: "Resources",
    legal: "Information",
    links: {
      demo: "Demo",
      trial: "Pilot trial",
      help: "Help centre",
      status: "Service status",
      login: "Log in",
      terms: "Terms of use",
      privacy: "Privacy",
    },
    fictional: "Demonstration version: all data shown is fictional.",
    rights: "© 2026 Stivea Vet",
  },

  home: {
    hero: {
      eyebrow: "Post-consultation follow-up · dogs and cats",
      title: "Your patients followed up after the procedure,",
      titleAccent: "without adding to your day.",
      lead: "Numa, an AI assistant, talks with owners on the practice's professional WhatsApp. She follows your protocol, spots warning signs and prepares a summary for you. The medical decision always stays with you.",
      points: [
        "2-month trial in real use",
        "No commitment during the trial",
        "Guided setup",
      ],
    },
    phone: {
      label: "Example WhatsApp conversation with Numa (fictional)",
      cabinet: "Tilleuls Veterinary Clinic",
      channel: "WhatsApp Business",
      simulated: "Fictional conversation",
      messages: [
        {
          from: "numa",
          text: "Hello Julien, I'm Numa, the AI assistant of the Tilleuls Veterinary Clinic. How is Caramel this morning?",
          time: "9:00",
        },
        {
          from: "owner",
          text: "Good night, she ate half of her food.",
          time: "9:14",
        },
        {
          from: "numa",
          text: "Thank you, I've passed it on to the team. Could you send me a photo of the scar?",
          time: "9:15",
        },
        {
          from: "owner",
          text: "📷 Photo · The wound is a little red.",
          time: "9:31",
        },
      ],
    },
    alert: {
      level: "To watch",
      title: "Caramel · Day 1 · spay",
      body: "Redness reported on the scar, photo received.",
      footer: "Dr Fontaine notified on the practice computer",
    },
    beforeAfter: {
      title: "What changes for the practice",
      lead: "Follow-up calls and scattered messages give way to a structured follow-up the whole team can see.",
      beforeTitle: "Today",
      afterTitle: "With Stivea Vet",
      before: [
        "Follow-up calls that take time and don't always get through",
        "Photos received on a personal phone",
        "A complication discovered at the check-up, sometimes late",
        "A file to piece together before the consultation",
      ],
      after: [
        "Numa asks your protocol's questions at the right time",
        "Messages, photos and voice notes filed in the follow-up record",
        "Warning signs come first on the dashboard",
        "A summary ready when you open the file",
      ],
    },
    assistants: {
      title: "Two AI assistants, one framework: yours",
      lead: "Numa talks to owners, Stive helps the team. Neither of them diagnoses or makes a medical decision.",
      numa: {
        role: "Talks with owners on WhatsApp",
        points: [
          "Introduces herself as an AI from the very first message",
          "Asks for the owner's consent before any follow-up",
          "Follows the protocol approved by the vet",
          "Immediately passes on the practice's emergency instructions",
        ],
        link: "Discover Numa",
      },
      stive: {
        role: "Helps vets and the team inside Stivea Vet",
        points: [
          "Prepares the daily briefing and file summaries",
          "Suggests draft messages and appointments",
          "Only sees what each person is allowed to see",
          "Every real action is confirmed by a vet",
        ],
        link: "Discover Stive",
      },
    },
    steps: {
      title: "A follow-up launched in a few clicks",
      items: [
        {
          title: "Choose the animal",
          body: "The animal, its owners and the procedure come from dr.veto, read-only.",
        },
        {
          title: "Approve the protocol",
          body: "Questions, reminders, warning signs and check-up: you adjust everything, then click “Launch follow-up”.",
        },
        {
          title: "Numa follows up",
          body: "She talks with the owner, sorts every message as normal, to watch or urgent, and alerts you when needed.",
        },
        {
          title: "You decide",
          body: "You take over the conversation whenever you want. The summary is waiting for you before the check-up.",
        },
      ],
      link: "See how it works in detail",
    },
    principles: {
      title: "Our commitments",
      items: [
        {
          title: "The vet decides",
          body: "Numa and Stive do not diagnose, never touch a dosage and never reassure outside the framework you approved.",
        },
        {
          title: "Transparency for owners",
          body: "Numa introduces herself as an AI and asks for consent before any follow-up. Owners can write STOP at any time.",
        },
        {
          title: "Nothing on your personal phone",
          body: "Everything stays in Stivea Vet. Only urgent alerts go to the professional number you chose.",
        },
        {
          title: "An owner is never left alone",
          body: "An unpaid invoice or a cancellation never interrupts an ongoing follow-up.",
        },
      ],
    },
    securityTeaser: {
      title: "Animal health data handled with the utmost care",
      points: [
        "Each practice is strictly isolated from the others",
        "Personal accounts, fine-grained permissions and private files",
        "Activity log for the administrator",
        "Hosting in Europe, kept for one year at most",
        "Never used to train an AI model",
      ],
      link: "Read the security page",
    },
    faq: {
      title: "Frequently asked questions",
      items: [
        {
          q: "Can Numa give medical advice?",
          a: "No. Numa asks your protocol's questions, collects answers, photos and voice notes, and alerts you. She does not diagnose and never changes a treatment. In an emergency, she passes on your practice's emergency instructions and contacts.",
        },
        {
          q: "Do owners know they are talking to an AI?",
          a: "Yes, from the very first message. Numa also asks for their consent before starting the follow-up, and they can stop it at any time by writing STOP.",
        },
        {
          q: "Do I need to change my practice software?",
          a: "No. Stivea Vet connects to dr.veto at launch, read-only, and never writes to it. Vétocom and Vetup will follow.",
        },
        {
          q: "How much does the trial cost?",
          a: "{price} excl. VAT per month for 2 months, in real use, cancellable at any time. No annual commitment is ever created automatically.",
        },
        {
          q: "What happens at night and at weekends?",
          a: "Numa answers owners at any time. Scheduled messages follow your opening hours. In an emergency, she immediately passes on your night, weekend or public holiday instructions.",
        },
      ],
    },
    finalCta: {
      title: "Try Stivea Vet on your real follow-ups",
      body: "2 months at {price} excl. VAT per month, without commitment. You can also explore the demo first, on a fictional practice.",
    },
  },

  how: {
    title: "How Stivea Vet works",
    lead: "Stivea Vet runs on the practice computer. You stay in control at every step; Numa and Stive take care of the repetitive work.",
    journeyTitle: "The journey of a follow-up",
    journey: [
      {
        title: "Open Stivea Vet and choose the animal",
        body: "The search covers your dr.veto animals. Useful information is imported read-only: animal, owners, procedure, check-up appointment, allergies and active treatments.",
      },
      {
        title: "Check the launch sheet",
        body: "Stivea Vet suggests a protocol, a first message, questions, reminders and alerts. You change whatever you want and click “Launch follow-up” yourself.",
      },
      {
        title: "The owner's consent",
        body: "Numa writes from the practice's WhatsApp Business, on behalf of the practice and the responsible vet. The clinical follow-up only starts after the owner agrees.",
      },
      {
        title: "Day-to-day follow-up",
        body: "The owner replies by text, photo or voice note. Everything is filed in the record. Scheduled messages follow your hours; Numa answers incoming messages at any time.",
      },
      {
        title: "The summary before the check-up",
        body: "When you open the file, you find the progress, positive and negative signals, alerts and open questions. Nothing is written automatically into dr.veto.",
      },
    ],
    triageTitle: "Three levels, no needless alarm",
    triage: [
      {
        level: "normal",
        name: "Normal",
        where: "Visible in the file and the follow-up list",
        notify: "No interruption",
      },
      {
        level: "watch",
        name: "To watch",
        where: "Prioritised on the dashboard",
        notify: "Small notification on the computer",
      },
      {
        level: "urgent",
        name: "Urgent",
        where: "Highly visible in Stivea Vet",
        notify: "Immediate WhatsApp alert to the responsible or on-call vet",
      },
    ],
    triageHeaders: {
      level: "Level",
      where: "In Stivea Vet",
      notify: "Notification",
    },
    triageNote:
      "You approve the warning signs of each protocol. When in doubt, Numa escalates. Without an acknowledgement, the other vets are alerted after the delay you choose, between 3 and 5 hours; the emergency instructions to the owner are sent immediately.",
    controlTitle: "You stay in control",
    control: [
      "You write in the conversation whenever you want: your message goes out from the practice's WhatsApp.",
      "As soon as you take over the conversation, Numa pauses until you click “Resume Numa”.",
      "A follow-up can be paused, stopped or resumed at any time.",
      "Two owners can follow the same animal, each with their own consent.",
    ],
  },

  numa: {
    title: "Numa, the AI assistant who supports your owners",
    lead: "Numa talks with owners on the practice's professional WhatsApp, on behalf of the practice. She is warm, transparent and always within the framework you approved.",
    doesTitle: "What Numa does",
    does: [
      "Introduces herself as an AI from the very first message and asks for the owner's consent",
      "Asks your protocol's questions and sends reminders at the right time",
      "Receives text, photos and voice notes; voice notes are transcribed and filed in the record",
      "Sorts every message as normal, to watch or urgent, and escalates when in doubt",
      "Immediately passes on the practice's emergency instructions and contacts, including out of hours",
      "Suggests a slot within the times you approved, first with the animal's own vet",
      "Writes in French or English depending on the owner; you can correct the language",
    ],
    neverTitle: "What Numa will never do",
    never: [
      "Make a diagnosis",
      "Create or change a dosage or a treatment",
      "Reassure medically outside the framework you approved",
      "Pretend to be a human",
      "Carry on a conversation you took over, without your go-ahead",
    ],
    consentTitle: "Owners stay in control",
    consent:
      "Owners can write STOP at any time to suspend reminders; RESUME lets them give consent again. When two owners follow the same animal, each gives consent, and the consequence of a shared WhatsApp group is explained to them beforehand.",
    photoTitle: "Photos: observation, never diagnosis",
    photo:
      "Assisted photo analysis is off by default. If you turn it on, Numa only provides observations and risk signals.",
  },

  stive: {
    title: "Stive, your team's AI assistant",
    lead: "Stive works inside Stivea Vet, alongside you. He knows the follow-ups, agenda and alerts you have access to, and helps you prepare the day.",
    canTitle: "What Stive prepares for you",
    can: [
      "The daily briefing: priority follow-ups, pending alerts, planned check-ups",
      "A file summary before a consultation",
      "A suggested appointment or a draft message",
      "A follow-up change for you to approve",
    ],
    ruleTitle: "One simple rule",
    rule: "Every action with a real effect is explicitly confirmed by an authorised vet. Stive prepares, you decide.",
    accessTitle: "He only sees what you see",
    access:
      "Stive respects each person's permissions: an assistant cannot access clinical data that has not been opened to them, and a private file stays private.",
    limitTitle: "Usage suited to each plan",
    limit:
      "Each plan includes Stive usage suited to the size of the practice. If you reach that limit, Stivea Vet suggests the next plan up.",
  },

  integrations: {
    title: "Integrations",
    lead: "Stivea Vet builds on the tools the practice already uses. Imported data is read, never changed.",
    items: [
      {
        name: "dr.veto",
        status: "launch",
        body: "Direct connection at launch: animal, owners, procedure, treatments and agenda, read-only. Numa can suggest a slot; no summary is ever written into dr.veto.",
      },
      {
        name: "WhatsApp Business",
        status: "launch",
        body: "Numa writes from the practice's professional WhatsApp Business number. Your personal WhatsApp is never used.",
      },
      {
        name: "Vétocom",
        status: "soon",
        body: "Integration in preparation.",
      },
      {
        name: "Vetup",
        status: "soon",
        body: "Integration in preparation.",
      },
    ],
    screenshotTitle: "Until your software is supported: an agenda screenshot",
    screenshot:
      "Without an agenda integration, the practice can send a screenshot of its free slots. Stivea Vet extracts the slots, then deletes the screenshot; Numa suggests a slot and the practice confirms it. Remember to hide any unnecessary information.",
  },

  pricing: {
    title: "Simple pricing, per practice",
    lead: "All prices exclude VAT, are billed per practice and collected monthly. Invoices are sent by e-mail.",
    trial: {
      badge: "To get started",
      name: "Pilot trial",
      price: "{price} excl. VAT per month for {months} months",
      points: [
        "Real use, on your real follow-ups",
        "No commitment, cancellable at any time",
        "Then the plan chosen at sign-up",
      ],
    },
    plansTitle: "After the trial",
    annual: "with annual commitment",
    monthly: "no commitment",
    perMonthExclVat: "excl. VAT / month",
    plans: {
      solo: { name: "Solo", vets: "1 vet", stive: "Limited Stive" },
      solo_pro: { name: "Solo Pro", vets: "1 vet", stive: "Fuller Stive" },
      clinic: {
        name: "Clinic",
        vets: "Up to 3 vets",
        stive: "One Stive per vet, with a lower limit",
      },
      clinic_pro: {
        name: "Clinic Pro",
        vets: "Up to 3 vets",
        stive: "A fuller personal Stive for each vet",
      },
    },
    larger: {
      name: "More than 3 vets",
      body: "A package tailored to the practice, on request.",
    },
    usageTitle: "Numa follow-ups",
    usage: [
      "{included} simultaneous active follow-ups are included in every plan.",
      "Beyond that, each new follow-up launched costs {launch} excl. VAT.",
      "Reactivating a past follow-up while {included} follow-ups are active costs {reactivation} excl. VAT.",
      "The extra is collected with the next subscription payment. When a follow-up ends, a place is freed.",
    ],
    rulesTitle: "Subscription rules",
    rules: [
      "The first six months never create an automatic annual commitment.",
      "From month 3, you can ask for the annual commitment. Before month 7, you choose: annual commitment or monthly plan.",
      "After a failed payment, you have 30 days to settle before new follow-ups are blocked.",
      "After a cancellation or an unpaid invoice, ongoing follow-ups always continue, then you keep read-only access for 3 months.",
    ],
    noFree:
      "There is no free access to the real features. The demo, however, is free, on a fictional practice.",
  },

  security: {
    title: "Security and data",
    lead: "Stivea Vet handles information about animals and their owners. Every technical choice starts from that fact.",
    sections: [
      {
        title: "Practice isolation",
        body: "Each practice is isolated from the others down to the database: a query can only read its own practice's data.",
      },
      {
        title: "Accounts and permissions",
        body: "Everyone has their own account. Vets log in with a password and a security code; assistants have limited permissions that the administrator can extend. A vet can mark a file as private.",
      },
      {
        title: "Automatic lock",
        body: "Stivea Vet locks after 40 minutes of inactivity; the password is required to continue.",
      },
      {
        title: "Activity log",
        body: "Views, changes and messages are recorded. The practice administrator reviews this log; nobody can change it.",
      },
      {
        title: "Hosting and retention",
        body: "Data is hosted in Europe and encrypted in transit and at rest. Identifiable history is kept for one year at most; after that, only anonymised statistics remain.",
      },
      {
        title: "Your data does not train AI",
        body: "Conversations, photos, voice notes and follow-up data are never used to train an external AI model.",
      },
      {
        title: "Backups",
        body: "Encrypted backups are made daily in Europe and kept for 90 days. Deleted data is removed from production immediately, then from backups at the latest at the end of that cycle.",
      },
      {
        title: "Owners' rights",
        body: "At an owner's request, Stivea Vet deletes their follow-up data. The source medical record remains the practice's responsibility in its own software.",
      },
    ],
    incidentsTitle: "If an incident happens",
    incidents:
      "The administrator vet is notified by e-mail immediately in case of a security incident. Outages and maintenance are published on the Stivea Vet status page.",
  },

  help: {
    title: "Help centre",
    lead: "Guides and videos arrive with the opening of the pilot trial. They will also be available inside the software.",
    topics: [
      "Setting up Stivea Vet step by step",
      "Launching and running a first follow-up",
      "Setting hours, on-call and emergency instructions",
      "Managing the team and permissions",
      "Billing and subscription",
    ],
    soon: "In preparation",
    supportTitle: "Support",
    support:
      "Support answers through the built-in messaging and by e-mail, on working days, within 24 to 48 working hours.",
  },

  status: {
    title: "Stivea Vet status",
    lead: "This page will publish outages and planned maintenance as soon as the service opens.",
    components: [
      "Stivea Vet application",
      "WhatsApp conversations",
      "dr.veto connection",
      "E-mails",
    ],
    notOpen: "Service not open yet",
    history: "No incident published.",
  },

  trial: {
    title: "Start the pilot trial",
    lead: "{months} months at {price} excl. VAT per month, on your real follow-ups, without commitment.",
    stepsTitle: "How it works",
    steps: [
      "You create the practice and your administrator vet account, and choose the plan that will follow the trial.",
      "You accept the terms of use and confirm you are authorised to subscribe on behalf of the practice.",
      "You land straight in the guided setup: WhatsApp, dr.veto, hours, team, protocols, direct debit mandate and a first test follow-up.",
    ],
    reassuranceTitle: "Good to know",
    reassurance: [
      "The trial can be cancelled at any time.",
      "No annual commitment is created automatically during the first six months.",
      "An ongoing follow-up is never interrupted, even after a cancellation.",
    ],
    cta: "Create my practice",
    demoInstead: "Would you rather see the demo first?",
  },

  demo: {
    title: "Discover Stivea Vet on a fictional practice",
    lead: "The demo shows the dashboard, follow-ups and a conversation with Numa, read-only. No real WhatsApp, no dr.veto connection, no real data.",
    form: {
      email: "Professional e-mail address",
      cabinet: "Practice name",
      vets: "Number of vets",
      vetOptions: { "1": "1", "2": "2", "3": "3", "4": "More than 3" },
      submit: "Open the demo",
      pending: "Opening…",
      notice:
        "We will then send you five e-mails over two weeks to introduce Stivea Vet. Unsubscribe in one click at any time. Your details are deleted after one year.",
      privacyLink: "Privacy",
    },
    errors: {
      email: "Enter a valid e-mail address.",
      too_long: "Address too long.",
      cabinet_short: "Enter the practice name.",
      cabinet_long: "Practice name too long.",
      vets: "Choose the number of vets.",
      rate_limited:
        "Too many requests from this connection. Try again in an hour.",
      expired:
        "Your demo access has expired or is no longer valid. Request it again below.",
    },
    space: {
      banner:
        "Read-only demo: the practice, animals, owners and conversations are fictional.",
      welcome: "Welcome, {cabinet}",
      intro:
        "Here is a typical day at the Tilleuls Veterinary Clinic, a fictional practice with three vets.",
      prioritiesTitle: "Priority follow-ups",
      prioritiesHint: "Open a follow-up to read the conversation with Numa.",
      agendaTitle: "Today's agenda",
      agendaHint:
        "Appointments from dr.veto; those suggested through Stivea Vet are marked.",
      conversationTitle: "Conversation with Numa",
      synthesisTitle: "Summary for the vet",
      positives: "Positive signals",
      negatives: "Points of attention",
      alerts: "Alerts",
      questions: "Open questions",
      back: "Back to follow-ups",
      languageNote:
        "The fictional practice is French: its content is shown in French, as in the Stivea Vet workspace during the pilot.",
      ctaTitle: "Ready to try it on your real follow-ups?",
    },
  },

  legal: {
    draft:
      "Draft document, to be reviewed by a specialised lawyer before any commercial launch. It is not yet a contractual commitment.",
    updated: "Working version of 7 October 2026",
  },

  terms: {
    title: "Terms of use",
    sections: [
      {
        title: "Purpose",
        body: "Stivea Vet provides veterinary practices with post-consultation follow-up software, with Numa, an AI assistant who talks with owners, and Stive, the team's AI assistant.",
      },
      {
        title: "Subscription",
        body: "The person subscribing confirms they are authorised to commit the practice. The practice is responsible for its users, who each have a personal account.",
      },
      {
        title: "Medical responsibility",
        body: "The vet always keeps the medical decision. The practice is responsible for its protocols, warning signs and emergency instructions. Numa and Stive make no diagnosis and change no treatment.",
      },
      {
        title: "Trial, plans and payment",
        body: "The pilot trial lasts 2 months and can be cancelled at any time. Prices exclude VAT, are per practice and collected monthly. No annual commitment is created automatically during the first six months.",
      },
      {
        title: "Unpaid invoices and cancellation",
        body: "Ongoing follow-ups always continue. After a failed payment, the practice has 30 days to settle before new follow-ups are blocked. After the last follow-up, read-only access stays open for 3 months.",
      },
    ],
  },

  privacy: {
    title: "Privacy",
    sections: [
      {
        title: "Practice and owner data",
        body: "The practice remains responsible for the data of its patients and their owners; Stivea Vet processes it on the practice's behalf, under a data processing agreement.",
      },
      {
        title: "Retention",
        body: "The identifiable history of a follow-up is kept for one year at most. After that, only anonymised statistics remain.",
      },
      {
        title: "No AI training",
        body: "Conversations, photos, voice notes and follow-up data are never used to train an external AI model.",
      },
      {
        title: "Demo requests",
        body: "For the demo, we keep your e-mail address, practice name, number of vets and language, for one year at most. They are used to open the demo and to send five e-mails over two weeks, which you can unsubscribe from at any time. The series stops as soon as a trial starts.",
      },
      {
        title: "Your rights",
        body: "You can ask for access to, correction or deletion of your data. Contact details will be given before the service opens.",
      },
    ],
  },

  unsubscribe: {
    title: "Stop receiving our e-mails",
    body: "Confirm to stop the series of e-mails that follows your demo request. You will no longer receive Stivea Vet introduction e-mails at this address.",
    submit: "Unsubscribe me",
    done: "Done: you will no longer receive our introduction e-mails.",
    invalid:
      "This unsubscribe link is not valid. Use the link in the latest e-mail you received.",
  },
};

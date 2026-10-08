import type { AppDictionary } from "../types";

export const auth: AppDictionary["auth"] = {
  localNotice:
    "Local environment: fictitious data only. E-mails are captured by Mailpit and never leave the machine.",
  pending: "Please wait…",
  passwordHint:
    "At least 12 characters. A phrase that is easy to remember works very well.",
  fields: {
    email: "E-mail address",
    workEmail: "Work e-mail address",
    password: "Password",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    organizationName: "Practice name",
    displayName: "Your name",
    displayNameHint:
      "As your team will see it, for example “Dr Claire Fontaine”.",
    code: "Security code",
    codeHint: "6 digits, valid for 10 minutes.",
    invitationEmailHint: "The address the invitation was sent to.",
  },
  login: {
    title: "Sign in",
    heading: "Sign in to your practice",
    intro: "Vets receive a code by e-mail when signing in from a new device.",
    submit: "Sign in",
    forgotPassword: "Forgotten your password?",
    newPractice: "New practice?",
    createAccount: "Create an account",
    reasons: {
      signedOut: "You have been signed out.",
      session: "Your session was closed. Please sign in again.",
      invitation:
        "Your account has been created. Sign in to join your practice.",
      passwordChanged:
        "Password changed. All your sessions have been closed: sign in with the new one.",
    },
  },
  code: {
    title: "Security code",
    heading: "Let's check it's really you",
    introSignup:
      "To confirm your address, enter the 6-digit code we have just sent you by e-mail.",
    introDevice:
      "This device is not recognised yet. Enter the 6-digit code sent to your e-mail address.",
    submit: "Confirm code",
    resend: "Get a new code",
  },
  lock: {
    title: "Session locked",
    intro: (name) =>
      `${name}, Stivea Vet locked itself after 40 minutes of inactivity. Enter your password to continue.`,
    submit: "Unlock",
    notMe: "Not me: sign out",
  },
  forgot: {
    title: "Forgotten password",
    intro:
      "Enter your address: you will receive a link valid for 30 minutes, which can be used only once.",
    submit: "Get a link",
    backToLogin: "Back to sign-in",
  },
  reset: {
    title: "New password",
    heading: "Choose a new password",
    intro: "All your open sessions will be closed.",
    submit: "Save password",
    invalidTitle: "This link is no longer valid.",
    invalidBody: "It has expired or has already been used.",
    requestNew: "Request a new link",
  },
  signup: {
    title: "Create a practice",
    heading: "Create your practice",
    intro:
      "You will be the admin vet. You will invite your team afterwards, from the guided setup.",
    submit: "Create the practice",
    haveAccount: "Already have an account?",
    signIn: "Sign in",
    plan: {
      legend: "Plan after the trial",
      help: (price, months) =>
        `Pilot trial at ${price} excl. VAT per month for ${months} months, with no commitment. After that, the chosen plan, billed monthly: an annual commitment is never automatic.`,
      option: (name, price) => `${name} · ${price} excl. VAT per month`,
      details: (maxVets, annualPrice) =>
        `${maxVets === 1 ? "1 vet" : `Up to ${maxVets} vets`}. With an annual commitment: ${annualPrice} excl. VAT per month.`,
    },
    consents: {
      termsBefore: "I accept the ",
      termsLink: "terms of use",
      termsMiddle: " and I have read the ",
      privacyLink: "privacy policy",
      termsAfter: ".",
      authorized:
        "I confirm that I am authorised to subscribe on behalf of this practice.",
    },
  },
  invitation: {
    title: "Join a practice",
    heading: (organizationName) => `Join ${organizationName}`,
    intro: (role) =>
      `You have been invited with the ${role} role. Choose your password to create your account.`,
    invalidTitle: "This invitation is no longer valid.",
    invalidBody:
      "It has expired, been cancelled or already been used. Ask the practice for a new invitation.",
    registeredTitle: "This address already has a Stivea Vet account.",
    registeredBody:
      "For now, an account can belong to only one practice. Ask the practice to invite you with a different address.",
    submit: "Create my account",
  },
  errors: {
    genericLogin: "Incorrect e-mail address or password.",
    rateLimited:
      "Too many attempts. Please wait a few minutes before trying again.",
    codeInvalid:
      "Incorrect or expired code. Check the latest e-mail you received, or sign in again to get a new code.",
    passwordIncorrect: "Incorrect password.",
    resetSent:
      "If an account exists for this address, a reset link has just been sent. It is valid for 30 minutes.",
    resetExpired:
      "This link is no longer valid. Request a new one from “Forgotten password”.",
    invitationExpired:
      "This invitation is no longer valid. Ask the practice for a new invitation.",
    emailRegistered:
      "This address already has a Stivea Vet account. Ask the practice to invite you with a different address.",
    vetLimit:
      "The practice has reached the number of vets included in its plan. Contact the person who invited you.",
  },
  validation: {
    email_too_long: "Address too long.",
    email_invalid: "Invalid e-mail address.",
    password_required: "Enter your password.",
    password_too_long: "Password too long.",
    code_format: "The code has 6 digits.",
    passwords_mismatch: "The two passwords do not match.",
    organization_name_short: "Practice name too short.",
    organization_name_long: "Practice name too long.",
    display_name_required: "Enter your name.",
    display_name_long: "Name too long.",
    plan_required: "Choose the plan that will follow the trial.",
    terms_required: "Accept the terms of use to continue.",
    authority_required:
      "Confirm that you are authorised to subscribe on behalf of the practice.",
  },
  invalidField: "Invalid value. Please check this field.",
  passwordProblems: {
    too_short: (min) => `At least ${min} characters.`,
    too_long: (max) => `At most ${max} characters.`,
    repetitive: "Too many repeated characters.",
    common: "This password is among the most commonly used.",
    personal: "It must not contain your name or e-mail address.",
  },
};

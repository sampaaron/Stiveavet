/** Textes de cette partie de l'espace cabinet (voir ADR 0022). */
export const auth = {
  /** Mention sous la carte, uniquement en environnement local. */
  localNotice:
    "Environnement local : données fictives uniquement. Les e-mails sont capturés par Mailpit et ne quittent pas la machine.",
  pending: "Patientez…",
  passwordHint:
    "12 caractères minimum. Une phrase facile à retenir fonctionne très bien.",
  fields: {
    email: "Adresse e-mail",
    workEmail: "Adresse e-mail professionnelle",
    password: "Mot de passe",
    newPassword: "Nouveau mot de passe",
    confirmPassword: "Confirmer le mot de passe",
    organizationName: "Nom du cabinet",
    displayName: "Votre nom",
    displayNameHint:
      "Tel qu'il apparaîtra à votre équipe, par exemple « Dr Claire Fontaine ».",
    code: "Code de sécurité",
    codeHint: "6 chiffres, valable 10 minutes.",
    invitationEmailHint: "L'adresse à laquelle l'invitation a été envoyée.",
  },
  login: {
    title: "Connexion",
    heading: "Connexion à votre cabinet",
    intro:
      "Les vétérinaires reçoivent un code par e-mail lors d'une connexion depuis un nouvel appareil.",
    submit: "Se connecter",
    forgotPassword: "Mot de passe oublié ?",
    newPractice: "Nouveau cabinet ?",
    createAccount: "Créer un compte",
    /** Message affiché selon le paramètre `raison` de l'adresse. */
    reasons: {
      signedOut: "Vous êtes déconnecté.",
      session: "Votre session a été fermée. Reconnectez-vous.",
      invitation:
        "Votre compte est créé. Connectez-vous pour rejoindre votre cabinet.",
      passwordChanged:
        "Mot de passe modifié. Toutes vos sessions ont été fermées : connectez-vous avec le nouveau.",
    },
  },
  code: {
    title: "Code de sécurité",
    heading: "Vérifions qu'il s'agit bien de vous",
    introSignup:
      "Pour confirmer votre adresse, saisissez le code à 6 chiffres que nous venons de vous envoyer par e-mail.",
    introDevice:
      "Cet appareil n'est pas encore reconnu. Saisissez le code à 6 chiffres envoyé à votre adresse e-mail.",
    submit: "Valider le code",
    resend: "Recevoir un nouveau code",
  },
  lock: {
    title: "Session verrouillée",
    intro: (name: string) =>
      `${name}, Stivea Vet s'est verrouillé après 40 minutes sans activité. Saisissez votre mot de passe pour reprendre.`,
    submit: "Déverrouiller",
    notMe: "Ce n'est pas moi : se déconnecter",
  },
  forgot: {
    title: "Mot de passe oublié",
    intro:
      "Indiquez votre adresse : vous recevrez un lien valable 30 minutes, utilisable une seule fois.",
    submit: "Recevoir un lien",
    backToLogin: "Retour à la connexion",
  },
  reset: {
    title: "Nouveau mot de passe",
    heading: "Choisir un nouveau mot de passe",
    intro: "Toutes vos sessions ouvertes seront fermées.",
    submit: "Enregistrer le mot de passe",
    invalidTitle: "Ce lien n'est plus valable.",
    invalidBody: "Il a expiré ou a déjà servi.",
    requestNew: "Demander un nouveau lien",
  },
  signup: {
    title: "Créer un cabinet",
    heading: "Créer votre cabinet",
    intro:
      "Vous serez le vétérinaire administrateur. Vous inviterez votre équipe ensuite, depuis l'installation guidée.",
    submit: "Créer le cabinet",
    haveAccount: "Déjà un compte ?",
    signIn: "Se connecter",
    plan: {
      legend: "Formule après l'essai",
      help: (price: string, months: number) =>
        `Essai pilote à ${price} HT par mois pendant ${months} mois, sans engagement. Ensuite, la formule choisie, au mois : l'engagement annuel n'est jamais automatique.`,
      option: (name: string, price: string) => `${name} · ${price} HT par mois`,
      details: (maxVets: number, annualPrice: string) =>
        `${maxVets === 1 ? "1 vétérinaire" : `Jusqu'à ${maxVets} vétérinaires`}. Avec engagement annuel : ${annualPrice} HT par mois.`,
    },
    /** Phrase des conditions découpée autour de ses deux liens. */
    consents: {
      termsBefore: "J'accepte les ",
      termsLink: "conditions d'utilisation",
      termsMiddle: " et j'ai lu la ",
      privacyLink: "politique de confidentialité",
      termsAfter: ".",
      authorized: "Je confirme être autorisé à souscrire au nom de ce cabinet.",
    },
  },
  invitation: {
    title: "Rejoindre un cabinet",
    heading: (organizationName: string) => `Rejoindre ${organizationName}`,
    /** Le rôle arrive en minuscules : « vétérinaire administrateur ». */
    intro: (role: string) =>
      `Vous êtes invité comme ${role}. Choisissez votre mot de passe pour créer votre compte.`,
    invalidTitle: "Cette invitation n'est plus valable.",
    invalidBody:
      "Elle a expiré, a été annulée ou a déjà servi. Demandez une nouvelle invitation au cabinet.",
    registeredTitle: "Cette adresse a déjà un compte Stivea Vet.",
    registeredBody:
      "Un compte ne peut appartenir qu'à un seul cabinet pour l'instant. Demandez au cabinet de vous inviter avec une autre adresse.",
    submit: "Créer mon compte",
  },
  /** Refus renvoyés par les actions ; jamais de détail révélant l'existence d'un compte. */
  errors: {
    genericLogin: "Adresse e-mail ou mot de passe incorrect.",
    rateLimited:
      "Trop de tentatives. Patientez quelques minutes avant de réessayer.",
    codeInvalid:
      "Code incorrect ou expiré. Vérifiez le dernier e-mail reçu, ou reconnectez-vous pour recevoir un nouveau code.",
    passwordIncorrect: "Mot de passe incorrect.",
    resetSent:
      "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé. Il est valable 30 minutes.",
    resetExpired:
      "Ce lien n'est plus valable. Demandez-en un nouveau depuis « Mot de passe oublié ».",
    invitationExpired:
      "Cette invitation n'est plus valable. Demandez une nouvelle invitation au cabinet.",
    emailRegistered:
      "Cette adresse a déjà un compte Stivea Vet. Demandez au cabinet de vous inviter avec une autre adresse.",
    vetLimit:
      "Le cabinet a atteint le nombre de vétérinaires de sa formule. Contactez la personne qui vous a invité.",
  },
  /** Codes des schémas de `src/domains/auth/validators.ts`. */
  validation: {
    email_too_long: "Adresse trop longue.",
    email_invalid: "Adresse e-mail invalide.",
    password_required: "Saisissez votre mot de passe.",
    password_too_long: "Mot de passe trop long.",
    code_format: "Le code compte 6 chiffres.",
    passwords_mismatch: "Les deux mots de passe ne correspondent pas.",
    organization_name_short: "Nom du cabinet trop court.",
    organization_name_long: "Nom du cabinet trop long.",
    display_name_required: "Indiquez votre nom.",
    display_name_long: "Nom trop long.",
    plan_required: "Choisissez la formule qui suivra l'essai.",
    terms_required: "Acceptez les conditions d'utilisation pour continuer.",
    authority_required:
      "Confirmez que vous êtes autorisé à souscrire au nom du cabinet.",
  },
  /** Message d'un code de validation inconnu (message par défaut de Zod). */
  invalidField: "Valeur invalide. Vérifiez ce champ.",
  /** Codes de `passwordProblems` (src/domains/auth/password.ts). */
  passwordProblems: {
    too_short: (min: number) => `Au moins ${min} caractères.`,
    too_long: (max: number) => `Au plus ${max} caractères.`,
    repetitive: "Trop de caractères répétés.",
    common: "Ce mot de passe figure parmi les plus utilisés.",
    personal: "Il ne doit pas contenir votre nom ou votre e-mail.",
  },
};

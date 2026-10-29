// French messages for the error codes returned by the SQL API and server actions.
export const ERROR_MESSAGES = {
  not_authenticated: "Ta session a expiré. Recharge la page.",
  rate_limited: "Trop de tentatives. Attends une minute et réessaie.",
  invalid_choice: "Choix invalide.",
  no_question: "Pas de question aujourd'hui.",
  no_pseudo: "Choisis d'abord ton pseudo.",
  already_voted: "Tu as déjà parié aujourd'hui. Ton pari est définitif.",
  pseudo_length: "Ton pseudo doit faire entre 3 et 20 caractères.",
  pseudo_chars: "Lettres, chiffres, espaces et . _ - ' seulement, en commençant par une lettre ou un chiffre.",
  pseudo_offensive: "Ce pseudo n'est pas accepté. Choisis-en un autre.",
  pseudo_taken: "Ce pseudo est déjà pris.",
  captcha_failed: "La vérification anti-robot a échoué. Recharge la page et réessaie.",
  signin_rate_limited: "Trop de connexions depuis ton réseau. Réessaie dans quelques minutes.",
  email_invalid: "Cette adresse e-mail n'est pas valide.",
  email_taken: "Cette adresse est déjà liée à un autre compte. Utilise « J'ai déjà un compte ».",
  email_unknown: "Aucun compte n'est lié à cette adresse. Sauvegarde d'abord ta progression depuis ton appareil habituel.",
  email_rate_limited: "Trop d'e-mails envoyés. Réessaie dans une heure.",
  identity_taken: "Ce compte Google est déjà lié à un autre joueur. Utilise « J'ai déjà un compte ».",
  provider_disabled: "Cette méthode de connexion n'est pas encore activée.",
  network: "Ton pari n'a pas été enregistré (connexion). Réessaie.",
  unexpected: "Une erreur inattendue est survenue. Réessaie dans un instant.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export function isErrorCode(x: unknown): x is ErrorCode {
  return typeof x === "string" && x in ERROR_MESSAGES;
}

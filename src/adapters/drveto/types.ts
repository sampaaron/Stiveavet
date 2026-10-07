/** Connexion au logiciel vétérinaire dr.veto (lecture seule, ADR 0004). */
export type DrVetoConnector = {
  readonly simulated: boolean;
  connectPractice(practiceCode: string): Promise<{ displayLabel: string }>;
};

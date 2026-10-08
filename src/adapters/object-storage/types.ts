/**
 * Stockage objet privé (architecture §7, ADR 0019) : même contrat qu'un bucket S3
 * (Scaleway Object Storage, région Paris, en phase 3). La base ne garde que la clé ; aucun
 * objet n'a d'URL publique. La lecture par un navigateur passe toujours par un lien signé
 * de l'application, vérifié à chaque ouverture (`domains/fichiers/liens.ts`).
 * Ni le contenu ni la clé d'un objet n'apparaissent dans un journal.
 */
export type StoredObject = { bytes: Uint8Array; contentType: string };

export type ObjectStorage = {
  readonly simulated: boolean;
  /** Dépose un objet ; une clé déjà prise est refusée (jamais d'écrasement silencieux). */
  putObject(key: string, object: StoredObject): Promise<void>;
  /** L'objet, ou null s'il n'existe pas (ou plus). */
  getObject(key: string): Promise<StoredObject | null>;
  /** Supprime l'objet ; sans effet s'il n'existe déjà plus (rejouable). */
  deleteObject(key: string): Promise<void>;
  hasObject(key: string): Promise<boolean>;
};

/** Clé d'objet : même contrainte qu'en base (`attachments.storage_key`), sans « .. ». */
const STORAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9/_.-]{7,254}$/;

export function assertStorageKey(key: string): void {
  if (
    !STORAGE_KEY_PATTERN.test(key) ||
    key.split("/").some((part) => part === "" || part === "." || part === "..")
  )
    throw new Error("Clé d'objet invalide");
}

variable "environment" {
  description = "Nom de l'environnement, repris dans le nom de chaque ressource."
  type        = string
  default     = "staging"
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "staging ou production."
  }
}

variable "app_image" {
  description = "Image de l'application (rg.fr-par.scw.cloud/...:<commit>), construite par la CI."
  type        = string
}

variable "worker_image" {
  description = "Image du worker (cible « worker » du Dockerfile), même commit que l'application."
  type        = string
}

variable "app_domain" {
  description = "Domaine public de l'application, par exemple staging.stivea.fr."
  type        = string
}

variable "email_domain" {
  description = "Domaine d'envoi des e-mails, vérifié chez Scaleway (SPF, DKIM, DMARC)."
  type        = string
}

variable "accept_email_terms" {
  description = "Acceptation des conditions de Scaleway Transactional Email : décision d'Aaron."
  type        = bool
  default     = false
}

# Secrets : fournis au moment de l'application (variables TF_VAR_… ou gestionnaire de
# secrets), jamais écrits dans un fichier versionné. Terraform les garde dans son état :
# l'état vit dans un bucket privé et chiffré, jamais dans le dépôt.
variable "secrets" {
  description = "Secrets de l'application : clés WhatsApp, IA, Stripe, chiffrement, liens signés."
  type        = map(string)
  sensitive   = true
  # Ces secrets sont injectés dans l'application et le worker : jamais le rôle migrateur,
  # propriétaire des tables, qui pourrait lever la RLS (ADR 0041).
  validation {
    condition     = !contains(keys(var.secrets), "MIGRATOR_DATABASE_URL")
    error_message = "MIGRATOR_DATABASE_URL ne va jamais dans les conteneurs : voir la procédure de migration du README."
  }
  # Clé HMAC des empreintes d'IP et d'e-mail : l'application refuse de démarrer sans elle.
  validation {
    condition     = length(lookup(var.secrets, "FINGERPRINT_SECRET", "")) >= 32
    error_message = "FINGERPRINT_SECRET (32 caractères au moins) est obligatoire : voir le README."
  }
}

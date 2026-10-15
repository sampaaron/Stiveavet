# Staging de Stivea Vet chez Scaleway, région Paris (ADR 0028).
# Rien n'est créé tant qu'Aaron n'a pas donné son feu vert (plan de la phase 3, partie B).
terraform {
  required_version = ">= 1.6"
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "~> 2.50"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# Identifiants lus dans l'environnement (SCW_ACCESS_KEY, SCW_SECRET_KEY,
# SCW_DEFAULT_PROJECT_ID), jamais dans un fichier du dépôt.
provider "scaleway" {
  region = "fr-par"
  zone   = "fr-par-1"
}

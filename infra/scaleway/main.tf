locals {
  name = "stivea-${var.environment}"
  tags = ["stivea", var.environment]
}

# Réseau privé : la base n'a aucune adresse publique, seuls les conteneurs l'atteignent.
resource "scaleway_vpc_private_network" "main" {
  name = local.name
  tags = local.tags
}

# PostgreSQL 16 managé, chiffré au repos, sauvegardé chaque jour (14 jours).
resource "random_password" "db_admin" {
  length  = 40
  special = false
}

resource "scaleway_rdb_instance" "main" {
  name                      = local.name
  engine                    = "PostgreSQL-16"
  node_type                 = var.environment == "production" ? "DB-PRO2-XXS" : "DB-DEV-S"
  is_ha_cluster             = var.environment == "production"
  encryption_at_rest        = true
  disable_backup            = false
  backup_schedule_frequency = 24
  backup_schedule_retention = 14
  user_name                 = "stivea_admin"
  password                  = random_password.db_admin.result
  tags                      = local.tags

  private_network {
    pn_id       = scaleway_vpc_private_network.main.id
    enable_ipam = true
  }
}

resource "scaleway_rdb_database" "main" {
  instance_id = scaleway_rdb_instance.main.id
  name        = "stivea"
}

# Photos, vocaux et captures : bucket privé, versionné, à Paris (ADR 0019).
resource "scaleway_object_bucket" "objects" {
  name = "${local.name}-objets"
  tags = { project = "stivea", environment = var.environment }
  versioning {
    enabled = true
  }
}

resource "scaleway_object_bucket_acl" "objects" {
  bucket = scaleway_object_bucket.objects.id
  acl    = "private"
}

# Réveil du worker (ADR 0028) : la file ne porte qu'un signal, jamais de donnée.
resource "scaleway_mnq_sqs" "main" {}

resource "scaleway_mnq_sqs_credentials" "app" {
  name = "${local.name}-reveil"
  permissions {
    can_publish = true
    can_receive = true
    can_manage  = false
  }
  depends_on = [scaleway_mnq_sqs.main]
}

resource "scaleway_mnq_sqs_queue" "wake" {
  name                       = "${local.name}-reveil"
  sqs_endpoint               = scaleway_mnq_sqs.main.endpoint
  access_key                 = scaleway_mnq_sqs_credentials.app.access_key
  secret_key                 = scaleway_mnq_sqs_credentials.app.secret_key
  message_max_age            = 3600
  visibility_timeout_seconds = 60
}

# E-mails de service et commerciaux (ADR 0028).
resource "scaleway_tem_domain" "mail" {
  name       = var.email_domain
  accept_tos = var.accept_email_terms
}

# Images construites par la CI, jamais à la main.
resource "scaleway_registry_namespace" "main" {
  name      = local.name
  is_public = false
}

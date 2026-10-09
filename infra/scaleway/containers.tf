locals {
  # Configuration commune, sans secret : les secrets passent par secret_environment_variables.
  environment = {
    APP_ENV           = var.environment
    APP_URL           = "https://${var.app_domain}"
    TRUST_PROXY       = "true"
    EMAIL_PROVIDER    = "scaleway"
    EMAIL_DOMAIN      = var.email_domain
    STORAGE_PROVIDER  = "scaleway"
    SCW_BUCKET        = scaleway_object_bucket.objects.name
    QUEUE_PROVIDER    = "scaleway"
    SCW_QUEUE_URL     = scaleway_mnq_sqs_queue.wake.url
    WHATSAPP_PROVIDER = "cloud_api"
    AI_PROVIDER       = "scaleway"
    BILLING_PROVIDER  = "stripe"
  }
  secrets = merge(var.secrets, {
    SCW_QUEUE_ACCESS_KEY = scaleway_mnq_sqs_credentials.app.access_key
    SCW_QUEUE_SECRET_KEY = scaleway_mnq_sqs_credentials.app.secret_key
  })
}

resource "scaleway_container_namespace" "main" {
  name = local.name
}

# Application Next.js : seule porte d'entrée publique, en HTTPS uniquement.
resource "scaleway_container" "app" {
  name                         = "${local.name}-app"
  namespace_id                 = scaleway_container_namespace.main.id
  registry_image               = var.app_image
  port                         = 3000
  cpu_limit                    = 1000
  memory_limit                 = 2048
  min_scale                    = 1
  max_scale                    = 4
  privacy                      = "public"
  http_option                  = "redirected"
  deploy                       = true
  private_network_id           = scaleway_vpc_private_network.main.id
  environment_variables        = local.environment
  secret_environment_variables = local.secrets

  health_check {
    http {
      path = "/api/health"
    }
    failure_threshold = 3
    interval          = "10s"
  }
}

resource "scaleway_container_domain" "app" {
  container_id = scaleway_container.app.id
  hostname     = var.app_domain
}

# Worker de la file de tâches : privé, une seule instance toujours active.
resource "scaleway_container" "worker" {
  name                         = "${local.name}-worker"
  namespace_id                 = scaleway_container_namespace.main.id
  registry_image               = var.worker_image
  cpu_limit                    = 500
  memory_limit                 = 1024
  min_scale                    = 1
  max_scale                    = 1
  privacy                      = "private"
  deploy                       = true
  private_network_id           = scaleway_vpc_private_network.main.id
  environment_variables        = local.environment
  secret_environment_variables = local.secrets
}

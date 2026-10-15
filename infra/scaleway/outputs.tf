output "database_private_host" {
  description = "Adresse privée de PostgreSQL, joignable depuis le réseau privé seulement."
  value       = scaleway_rdb_instance.main.private_network[0].ip
}

output "app_url" {
  value = "https://${var.app_domain}"
}

output "registry_endpoint" {
  value = scaleway_registry_namespace.main.endpoint
}

output "email_dns_records" {
  description = "Enregistrements SPF, DKIM et DMARC à poser chez le gestionnaire du domaine."
  value = {
    spf  = scaleway_tem_domain.mail.spf_config
    dkim = scaleway_tem_domain.mail.dkim_config
  }
}

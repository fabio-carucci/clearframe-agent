variable "github_sub_prefix" {
  description = "OIDC subject prefix of the only repository whose workflows may assume the CI roles. It carries the owner and repository ids, so a re-created repo with the same name does not match. Read it with: gh api repos/OWNER/REPO/actions/oidc/customization/sub"
  type        = string
  default     = "repo:fabio-carucci@148774237/clearframe-agent@1423156499"
}

variable "workload_prefix" {
  description = "Name prefix of the resources the deploy role may manage. The CI roles sit outside it."
  type        = string
  default     = "clearframe-dev"
}

variable "state_bucket" {
  type    = string
  default = "clearframe-tfstate-6iit7"
}

variable "data_bucket" {
  type    = string
  default = "clearframe-dev-data-6iit7"
}

variable "ssm_prefix" {
  description = "SSM path that holds the dev secrets."
  type        = string
  default     = "/clearframe/dev/"
}

variable "embedding_model_id" {
  type    = string
  default = "amazon.titan-embed-text-v2:0"
}

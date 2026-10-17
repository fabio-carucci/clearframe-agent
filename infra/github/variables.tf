variable "github_repo" {
  description = "owner/name of the only repository whose workflows may assume the CI roles."
  type        = string
  default     = "fabio-carucci/clearframe-agent"
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

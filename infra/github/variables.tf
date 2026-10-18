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

variable "web_bucket" {
  type    = string
  default = "clearframe-dev-web-6iit7"
}

variable "ssm_prefix" {
  description = "SSM path that holds the dev secrets."
  type        = string
  default     = "/clearframe/dev/"
}

variable "eval_key_param" {
  description = "SecureString with the Anthropic key the eval workflow uses. It belongs to a workspace with a low spend limit: any pull request can read it, so it must never be the key the Lambda uses."
  type        = string
  default     = "/clearframe/ci/anthropic-api-key"
}

# Ids AWS generated for this stack's resources; see the ManageCdn statement in main.tf. A new
# account starts with its first infra/env/dev apply done by an administrator, then sets these.

variable "cloudfront_distribution_id" {
  type    = string
  default = "E2EJIBOAR3IF7I"
}

variable "cloudfront_origin_access_control_ids" {
  type    = list(string)
  default = ["E1BIO8IRE7OA9Y", "E21POSOOUP77GQ"]
}

variable "cloudfront_response_headers_policy_id" {
  type    = string
  default = "6c7cafaa-8c5d-41c4-a40d-a21c4ddc638d"
}

variable "certificate_id" {
  description = "The site's ACM certificate in us-east-1."
  type        = string
  default     = "a1c39d93-285d-4e2e-a9ba-13e6313ccf90"
}

variable "user_pool_id" {
  type    = string
  default = "eu-west-1_MWcI3MXEd"
}

variable "embedding_model_id" {
  type    = string
  default = "amazon.titan-embed-text-v2:0"
}

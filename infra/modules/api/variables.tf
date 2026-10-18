variable "name_prefix" {
  description = "Prefix for every resource name, e.g. clearframe-dev."
  type        = string
}

variable "data_bucket_name" {
  description = "Globally unique bucket for the catalog (data/) and run manifests (manifests/)."
  type        = string
}

variable "data_dir" {
  description = "Local directory holding catalog.json and embeddings.json."
  type        = string
}

variable "lambda_dist_dir" {
  description = "Local directory with the esbuild output (index.mjs). Run `pnpm build:lambda` first."
  type        = string
}

variable "anthropic_key_param" {
  description = "Name of the SecureString SSM parameter with the Anthropic API key. Created outside Terraform so the secret never enters the state."
  type        = string
}

variable "auth_config_param" {
  description = "Name of the String SSM parameter holding the Cognito user pool and client ids the Lambda verifies tokens against. Read at runtime to avoid a dependency cycle between the API, the CDN and Cognito."
  type        = string
}

variable "permissions_boundary_arn" {
  description = "Boundary attached to the agent role. The CI deploy role can only create roles that carry it."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:policy/.+$", var.permissions_boundary_arn))
    error_message = "permissions_boundary_arn must be an IAM policy ARN; the agent role is never created without a boundary."
  }
}

variable "embedding_model_id" {
  type    = string
  default = "amazon.titan-embed-text-v2:0"
}

variable "run_retention_days" {
  description = "How long run records (DynamoDB TTL) and manifests (S3 lifecycle) are kept."
  type        = number
  default     = 90
}

variable "log_retention_days" {
  type    = number
  default = 14
}

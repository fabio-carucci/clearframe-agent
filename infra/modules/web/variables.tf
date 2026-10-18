variable "name_prefix" {
  type = string
}

variable "bucket_name" {
  description = "Globally unique bucket for the static site. CloudFront is its only reader."
  type        = string
}

variable "site_dir" {
  description = "Local directory with the Next.js static export. Run `pnpm web:build` first."
  type        = string
}

variable "api_function_name" {
  type = string
}

variable "api_function_url_domain" {
  description = "Host of the private Lambda function URL that /api forwards to."
  type        = string
}

variable "auth_domain" {
  description = "Cognito managed login host, allowed in the page's Content Security Policy."
  type        = string
}

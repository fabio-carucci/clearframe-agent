data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

locals {
  name_prefix        = "clearframe-dev"
  auth_domain_prefix = "clearframe-dev-6iit7"
  auth_domain        = "${local.auth_domain_prefix}.auth.${data.aws_region.current.region}.amazoncognito.com"
  auth_config_param  = "/clearframe/dev/auth-config"
  domain_name        = "clearframe.fabio-carucci.com"
  # Deployed by an administrator from infra/github. The deploy role may not even read it, so it is
  # named here; without it the agent issues nothing (every run ends unsigned and is withheld).
  notary_function = "arn:aws:lambda:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:function:clearframe-notary"
}

# Looked up by ARN, which needs only iam:GetPolicy and fails the plan if the boundary is missing.
# A lookup by name needs iam:ListPolicies on every policy in the account, which the CI deploy
# role deliberately lacks.
data "aws_iam_policy" "workload_boundary" {
  arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/clearframe-dev-boundary"
}

module "api" {
  source = "../../modules/api"

  permissions_boundary_arn = data.aws_iam_policy.workload_boundary.arn

  name_prefix         = local.name_prefix
  data_bucket_name    = "clearframe-dev-data-6iit7"
  data_dir            = "${path.root}/../../../data"
  lambda_dist_dir     = "${path.root}/../../../apps/api/dist"
  anthropic_key_param = "/clearframe/dev/anthropic-api-key"
  auth_config_param   = local.auth_config_param
  notary_function_arn = local.notary_function
}

module "web" {
  source = "../../modules/web"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix             = local.name_prefix
  bucket_name             = "clearframe-dev-web-6iit7"
  site_dir                = "${path.root}/../../../apps/web/out"
  api_function_name       = module.api.function_name
  api_function_url_domain = module.api.function_url_domain
  domain_name             = local.domain_name
  auth_domain             = local.auth_domain
}

module "auth" {
  source = "../../modules/auth"

  name_prefix   = local.name_prefix
  domain_prefix = local.auth_domain_prefix
  # The cloudfront.net name keeps working alongside the custom domain.
  callback_urls = ["${module.web.url}/", "${module.web.cloudfront_url}/"]
  logout_urls   = ["${module.web.url}/", "${module.web.cloudfront_url}/"]
}

# Cognito needs the CloudFront domain, CloudFront needs the Lambda, so the Lambda cannot take the
# Cognito ids as environment variables without a cycle. Both the Lambda and the page read them
# at runtime instead. None of these values are secrets.
resource "aws_ssm_parameter" "auth_config" {
  name = local.auth_config_param
  type = "String"
  value = jsonencode({
    userPoolId = module.auth.user_pool_id
    clientId   = module.auth.client_id
  })
}

resource "aws_s3_object" "web_config" {
  bucket        = module.web.bucket
  key           = "config.json"
  content_type  = "application/json"
  cache_control = "no-cache"
  content = jsonencode({
    region     = data.aws_region.current.region
    issuer     = module.auth.issuer
    clientId   = module.auth.client_id
    authDomain = module.auth.domain
  })
}

output "web_url" {
  value = module.web.url
}

output "cloudfront_domain" {
  description = "Point the custom domain's CNAME here."
  value       = module.web.domain
}

output "certificate_validation_record" {
  value = module.web.certificate_validation_record
}

output "function_name" {
  value = module.api.function_name
}

output "data_bucket" {
  value = module.api.data_bucket
}

output "runs_table" {
  value = module.api.runs_table
}

output "user_pool_id" {
  value = module.auth.user_pool_id
}

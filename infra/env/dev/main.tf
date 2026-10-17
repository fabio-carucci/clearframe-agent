data "aws_caller_identity" "current" {}

module "api" {
  source = "../../modules/api"

  # Built from the account id: looking the policy up by name needs iam:ListPolicies on every
  # policy in the account, which the CI deploy role deliberately lacks.
  permissions_boundary_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/clearframe-dev-boundary"

  name_prefix         = "clearframe-dev"
  data_bucket_name    = "clearframe-dev-data-6iit7"
  data_dir            = "${path.root}/../../../data"
  lambda_dist_dir     = "${path.root}/../../../dist/lambda"
  anthropic_key_param = "/clearframe/dev/anthropic-api-key"
  api_token_param     = "/clearframe/dev/api-token"
}

output "function_url" {
  value = module.api.function_url
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

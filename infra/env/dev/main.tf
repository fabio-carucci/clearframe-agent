data "aws_caller_identity" "current" {}

# Looked up by ARN, which needs only iam:GetPolicy and fails the plan if the boundary is missing.
# A lookup by name needs iam:ListPolicies on every policy in the account, which the CI deploy
# role deliberately lacks.
data "aws_iam_policy" "workload_boundary" {
  arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/clearframe-dev-boundary"
}

module "api" {
  source = "../../modules/api"

  permissions_boundary_arn = data.aws_iam_policy.workload_boundary.arn

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

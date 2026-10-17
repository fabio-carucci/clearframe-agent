data "aws_caller_identity" "current" {}

output "deployer_arn" {
  value = data.aws_caller_identity.current.arn
}

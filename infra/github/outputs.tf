output "eval_role_arn" {
  value = aws_iam_role.ci_eval.arn
}

output "deploy_role_arn" {
  value = aws_iam_role.ci_deploy.arn
}

output "workload_boundary_arn" {
  value = aws_iam_policy.workload_boundary.arn
}

output "manifest_signing_key_arn" {
  value = aws_kms_key.manifest_signing.arn
}

output "manifest_signing_public_key" {
  description = "Base64 DER SubjectPublicKeyInfo of the signing key, as config.json publishes it."
  value       = data.aws_kms_public_key.manifest_signing.public_key
}

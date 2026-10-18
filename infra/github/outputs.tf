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
  description = "Base64 DER SubjectPublicKeyInfo of the signing key, as packages/contracts/src/signing-keys.json lists it."
  value       = data.aws_kms_public_key.manifest_signing.public_key
}

output "manifest_signing_key_id" {
  value = aws_kms_key.manifest_signing.key_id
}

output "notary_function_name" {
  value = aws_lambda_function.notary.function_name
}

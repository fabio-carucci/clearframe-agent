output "eval_role_arn" {
  value = aws_iam_role.ci_eval.arn
}

output "deploy_role_arn" {
  value = aws_iam_role.ci_deploy.arn
}

output "workload_boundary_arn" {
  value = aws_iam_policy.workload_boundary.arn
}

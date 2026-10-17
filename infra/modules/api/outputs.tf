output "function_url" {
  value = aws_lambda_function_url.agent.function_url
}

output "function_name" {
  value = aws_lambda_function.agent.function_name
}

output "data_bucket" {
  value = aws_s3_bucket.data.id
}

output "runs_table" {
  value = aws_dynamodb_table.runs.name
}

locals {
  function_name = "${var.name_prefix}-agent"
}

data "archive_file" "agent" {
  type        = "zip"
  source_dir  = var.lambda_dist_dir
  output_path = "${path.root}/.build/agent.zip"
}

resource "aws_cloudwatch_log_group" "agent" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "agent" {
  function_name    = local.function_name
  role             = aws_iam_role.agent.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.agent.output_path
  source_code_hash = data.archive_file.agent.output_base64sha256
  memory_size      = 1024
  timeout          = 60

  # A ceiling as well as a reservation: a flood, even of forged tokens that pass the edge gate,
  # cannot take more than this from the account's other functions.
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      DATA_BUCKET         = aws_s3_bucket.data.id
      RUNS_TABLE          = aws_dynamodb_table.runs.name
      QUOTAS_TABLE        = aws_dynamodb_table.quotas.name
      DAILY_RUN_LIMIT     = tostring(var.daily_run_limit)
      ANTHROPIC_KEY_PARAM = var.anthropic_key_param
      AUTH_CONFIG_PARAM   = var.auth_config_param
      NOTARY_FUNCTION     = var.notary_function_arn
      NODE_OPTIONS        = "--enable-source-maps"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.agent.name
  }

  # The handler writes manifests with Object Lock retention, which fails on a bucket without it.
  depends_on = [aws_iam_role_policy.agent, aws_s3_bucket_object_lock_configuration.data]
}

# Private: only principals granted lambda:InvokeFunctionUrl can call it. The web module grants
# that to this stack's CloudFront distribution and to nobody else.
resource "aws_lambda_function_url" "agent" {
  function_name      = aws_lambda_function.agent.function_name
  authorization_type = "AWS_IAM"
  # The handler is wrapped in awslambda.streamifyResponse; in BUFFERED mode a streaming
  # handler's events would only reach the client once the whole run had finished.
  invoke_mode = "RESPONSE_STREAM"
}

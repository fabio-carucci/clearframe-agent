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
  timeout          = 90

  environment {
    variables = {
      DATA_BUCKET         = aws_s3_bucket.data.id
      RUNS_TABLE          = aws_dynamodb_table.runs.name
      ANTHROPIC_KEY_PARAM = var.anthropic_key_param
      API_TOKEN_PARAM     = var.api_token_param
      NODE_OPTIONS        = "--enable-source-maps"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.agent.name
  }

  depends_on = [aws_iam_role_policy.agent]
}

resource "aws_lambda_function_url" "agent" {
  function_name      = aws_lambda_function.agent.function_name
  authorization_type = "NONE"

  cors {
    allow_origins  = var.cors_allow_origins
    allow_methods  = ["POST"]
    allow_headers  = ["authorization", "content-type"]
    expose_headers = []
    max_age        = 3600
  }
}

# A NONE-auth URL needs both statements; the bearer token check happens in the handler.
resource "aws_lambda_permission" "url_invoke" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.agent.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "url_invoke_function" {
  statement_id             = "AllowInvokeOnlyThroughFunctionUrl"
  action                   = "lambda:InvokeFunction"
  function_name            = aws_lambda_function.agent.function_name
  principal                = "*"
  invoked_via_function_url = true
}

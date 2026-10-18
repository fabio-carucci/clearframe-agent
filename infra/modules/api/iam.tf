data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

locals {
  ssm_parameter_arns = [
    for name in [var.anthropic_key_param, var.auth_config_param] :
    "arn:aws:ssm:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:parameter${name}"
  ]
  embedding_model_arn = "arn:aws:bedrock:${data.aws_region.current.region}::foundation-model/${var.embedding_model_id}"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "agent" {
  name                 = "${var.name_prefix}-agent"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume.json
  permissions_boundary = var.permissions_boundary_arn
}

data "aws_iam_policy_document" "agent" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.agent.arn}:*"]
  }

  statement {
    sid       = "ReadCatalog"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.data.arn}/data/*"]
  }

  statement {
    sid       = "WriteManifests"
    actions   = ["s3:PutObject", "s3:PutObjectRetention"]
    resources = ["${aws_s3_bucket.data.arn}/manifests/*"]
  }

  statement {
    sid       = "WriteRunRecords"
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.runs.arn]
  }

  statement {
    sid       = "CountDailyRuns"
    actions   = ["dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.quotas.arn]
  }

  statement {
    sid       = "ReadSecrets"
    actions   = ["ssm:GetParameters"]
    resources = local.ssm_parameter_arns
  }

  statement {
    sid       = "EmbedQueries"
    actions   = ["bedrock:InvokeModel"]
    resources = [local.embedding_model_arn]
  }
}

resource "aws_iam_role_policy" "agent" {
  name   = "agent"
  role   = aws_iam_role.agent.id
  policy = data.aws_iam_policy_document.agent.json
}

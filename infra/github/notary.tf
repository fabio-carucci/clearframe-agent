# The only principal that may sign manifests. Before it calls kms:Sign it checks the manifest
# against the catalog bundled into it, the rights rule and its own clock (packages/core/src/
# notary), so code that can invoke it still cannot get a manifest signed that the rule would not
# issue. An administrator builds it (pnpm build:notary) and applies this stack; the deploy role
# is denied every action on it.

locals {
  published_signing_keys = [
    for key in jsondecode(file("${path.module}/../../packages/contracts/src/signing-keys.json")) :
    "${key.keyId}:${key.spki}"
  ]
}

data "archive_file" "notary" {
  type        = "zip"
  source_dir  = "${path.module}/../../apps/notary/dist"
  output_path = "${path.module}/.build/notary.zip"
}

data "aws_iam_policy_document" "notary_assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "notary" {
  name               = var.notary_name
  assume_role_policy = data.aws_iam_policy_document.notary_assume.json
}

data "aws_iam_policy_document" "notary" {
  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.notary.arn}:*"]
  }

  statement {
    sid       = "SignDigests"
    actions   = ["kms:Sign"]
    resources = [aws_kms_key.manifest_signing.arn]

    condition {
      test     = "StringEquals"
      variable = "kms:SigningAlgorithm"
      values   = ["ECDSA_SHA_256"]
    }

    condition {
      test     = "StringEquals"
      variable = "kms:MessageType"
      values   = ["DIGEST"]
    }
  }
}

resource "aws_iam_role_policy" "notary" {
  name   = "notary"
  role   = aws_iam_role.notary.id
  policy = data.aws_iam_policy_document.notary.json
}

# One line per certificate signed or refused: the record of what the key vouched for, kept as
# long as the manifests.
resource "aws_cloudwatch_log_group" "notary" {
  name              = "/aws/lambda/${var.notary_name}"
  retention_in_days = 90
}

resource "aws_lambda_function" "notary" {
  function_name    = var.notary_name
  role             = aws_iam_role.notary.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.notary.output_path
  source_code_hash = data.archive_file.notary.output_base64sha256
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      SIGNING_KEY_ARN = aws_kms_key.manifest_signing.arn
      NODE_OPTIONS    = "--enable-source-maps"
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.notary.name
  }

  lifecycle {
    precondition {
      condition = contains(
        local.published_signing_keys,
        "${aws_kms_key.manifest_signing.key_id}:${data.aws_kms_public_key.manifest_signing.public_key}",
      )
      error_message = "The signing key is not in packages/contracts/src/signing-keys.json, so nobody could verify what the notary signs. Commit it there first: terraform output manifest_signing_key_id and manifest_signing_public_key."
    }
  }

  depends_on = [aws_iam_role_policy.notary]
}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

locals {
  region     = data.aws_region.current.region
  account_id = data.aws_caller_identity.current.account_id

  github_oidc_host    = "token.actions.githubusercontent.com"
  workload_roles      = "arn:aws:iam::${local.account_id}:role/${var.workload_prefix}-*"
  embedding_model_arn = "arn:aws:bedrock:${local.region}::foundation-model/${var.embedding_model_id}"
  ssm_parameters      = "arn:aws:ssm:${local.region}:${local.account_id}:parameter${var.ssm_prefix}*"
  anthropic_key_param = "arn:aws:ssm:${local.region}:${local.account_id}:parameter${var.ssm_prefix}anthropic-api-key"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.github_oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

# ---------------------------------------------------------------------------------------------
# Permissions boundary: the most any workload role may ever do. The deploy role can create
# roles only with this boundary attached, so it cannot mint a role more powerful than this.
# ---------------------------------------------------------------------------------------------

data "aws_iam_policy_document" "workload_boundary" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.workload_prefix}-*:*"]
  }

  statement {
    sid       = "DataBucketObjects"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["arn:aws:s3:::${var.data_bucket}/*"]
  }

  statement {
    sid       = "RunsTable"
    actions   = ["dynamodb:PutItem"]
    resources = ["arn:aws:dynamodb:${local.region}:${local.account_id}:table/${var.workload_prefix}-*"]
  }

  statement {
    sid       = "Secrets"
    actions   = ["ssm:GetParameters"]
    resources = [local.ssm_parameters]
  }

  statement {
    sid       = "Embeddings"
    actions   = ["bedrock:InvokeModel"]
    resources = [local.embedding_model_arn]
  }
}

resource "aws_iam_policy" "workload_boundary" {
  name   = "${var.workload_prefix}-boundary"
  policy = data.aws_iam_policy_document.workload_boundary.json
}

# ---------------------------------------------------------------------------------------------
# ci-eval: pull requests of this repository run the eval suite.
# ---------------------------------------------------------------------------------------------

data "aws_iam_policy_document" "eval_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:sub"
      values   = ["${var.github_sub_prefix}:pull_request"]
    }
  }
}

resource "aws_iam_role" "ci_eval" {
  name                 = "clearframe-ci-eval"
  assume_role_policy   = data.aws_iam_policy_document.eval_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "ci_eval" {
  statement {
    sid       = "EmbedQueries"
    actions   = ["bedrock:InvokeModel"]
    resources = [local.embedding_model_arn]
  }

  statement {
    sid       = "ReadAnthropicKey"
    actions   = ["ssm:GetParameter"]
    resources = [local.anthropic_key_param]
  }
}

resource "aws_iam_role_policy" "ci_eval" {
  name   = "eval"
  role   = aws_iam_role.ci_eval.id
  policy = data.aws_iam_policy_document.ci_eval.json
}

# ---------------------------------------------------------------------------------------------
# ci-deploy: only pushes to main run terraform apply for env/dev.
# ---------------------------------------------------------------------------------------------

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.github_oidc_host}:sub"
      values   = ["${var.github_sub_prefix}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "ci_deploy" {
  name                 = "clearframe-ci-deploy"
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "ci_deploy" {
  statement {
    sid       = "ListOwnState"
    actions   = ["s3:ListBucket"]
    resources = ["arn:aws:s3:::${var.state_bucket}"]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["env/dev/*"]
    }
  }

  statement {
    sid       = "ReadWriteOwnStateAndLock"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["arn:aws:s3:::${var.state_bucket}/env/dev/*"]
  }

  statement {
    sid       = "ManageDataBucket"
    actions   = ["s3:*"]
    resources = ["arn:aws:s3:::${var.data_bucket}", "arn:aws:s3:::${var.data_bucket}/*"]
  }

  statement {
    sid     = "ManageRunsTable"
    actions = ["dynamodb:*"]
    resources = [
      "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${var.workload_prefix}-*",
      "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${var.workload_prefix}-*/index/*",
    ]
  }

  statement {
    sid       = "ManageFunctions"
    actions   = ["lambda:*"]
    resources = ["arn:aws:lambda:${local.region}:${local.account_id}:function:${var.workload_prefix}-*"]
  }

  statement {
    sid     = "ManageLogGroups"
    actions = ["logs:*"]
    resources = [
      "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.workload_prefix}-*",
      "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.workload_prefix}-*:*",
    ]
  }

  statement {
    sid       = "DescribeLogGroups"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["arn:aws:logs:${local.region}:${local.account_id}:log-group:*"]
  }

  statement {
    sid = "ReadWorkloadRolesAndBoundary"
    actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
    ]
    resources = [local.workload_roles, aws_iam_policy.workload_boundary.arn]
  }

  statement {
    sid = "ChangeWorkloadRolesOnlyWithBoundary"
    actions = [
      "iam:CreateRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePermissionsBoundary",
    ]
    resources = [local.workload_roles]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.workload_boundary.arn]
    }
  }

  statement {
    sid = "MaintainWorkloadRoles"
    actions = [
      "iam:DeleteRole",
      "iam:UpdateAssumeRolePolicy",
      "iam:UpdateRole",
      "iam:TagRole",
      "iam:UntagRole",
    ]
    resources = [local.workload_roles]
  }

  statement {
    sid       = "PassWorkloadRolesToLambdaOnly"
    actions   = ["iam:PassRole"]
    resources = [local.workload_roles]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  statement {
    sid       = "NeverDropTheBoundary"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ci_deploy" {
  name   = "deploy"
  role   = aws_iam_role.ci_deploy.id
  policy = data.aws_iam_policy_document.ci_deploy.json
}

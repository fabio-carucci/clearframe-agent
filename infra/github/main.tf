data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

locals {
  region     = data.aws_region.current.region
  account_id = data.aws_caller_identity.current.account_id

  github_oidc_host    = "token.actions.githubusercontent.com"
  agent_role          = "arn:aws:iam::${local.account_id}:role/${var.workload_prefix}-agent"
  embedding_model_arn = "arn:aws:bedrock:${local.region}::foundation-model/${var.embedding_model_id}"
  ssm_parameters      = "arn:aws:ssm:${local.region}:${local.account_id}:parameter${var.ssm_prefix}*"
  eval_key_param      = "arn:aws:ssm:${local.region}:${local.account_id}:parameter${var.eval_key_param}"
  auth_config_param   = "arn:aws:ssm:${local.region}:${local.account_id}:parameter${var.ssm_prefix}auth-config"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.github_oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

# The most any workload role may ever do. The deploy role can create roles only with this
# boundary attached, so it cannot mint a role more powerful than this.

data "aws_iam_policy_document" "workload_boundary" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.workload_prefix}-*:*"]
  }

  statement {
    sid       = "DataBucketObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:PutObjectRetention"]
    resources = ["arn:aws:s3:::${var.data_bucket}/*"]
  }

  statement {
    sid       = "Tables"
    actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
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
    sid       = "ReadEvalAnthropicKey"
    actions   = ["ssm:GetParameter"]
    resources = [local.eval_key_param]
  }
}

resource "aws_iam_role_policy" "ci_eval" {
  name   = "eval"
  role   = aws_iam_role.ci_eval.id
  policy = data.aws_iam_policy_document.ci_eval.json
}

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
    sid = "ReadAgentRoleAndBoundary"
    actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
    ]
    resources = [local.agent_role, aws_iam_policy.workload_boundary.arn]
  }

  statement {
    sid = "ChangeAgentRoleOnlyWithBoundary"
    actions = [
      "iam:CreateRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePermissionsBoundary",
    ]
    resources = [local.agent_role]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.workload_boundary.arn]
    }
  }

  statement {
    sid       = "MaintainAgentRole"
    actions   = ["iam:UpdateRole", "iam:TagRole", "iam:UntagRole"]
    resources = [local.agent_role]
  }

  statement {
    sid       = "PassAgentRoleToLambdaOnly"
    actions   = ["iam:PassRole"]
    resources = [local.agent_role]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  statement {
    sid       = "ManageWebBucket"
    actions   = ["s3:*"]
    resources = ["arn:aws:s3:::${var.web_bucket}", "arn:aws:s3:::${var.web_bucket}/*"]
  }

  statement {
    sid     = "ManageCdn"
    actions = ["cloudfront:*"]
    resources = [
      "arn:aws:cloudfront::${local.account_id}:distribution/*",
      "arn:aws:cloudfront::${local.account_id}:origin-access-control/*",
      "arn:aws:cloudfront::${local.account_id}:response-headers-policy/*",
      "arn:aws:cloudfront::${local.account_id}:function/${var.workload_prefix}-*",
    ]
  }

  statement {
    sid       = "ManageUserPools"
    actions   = ["cognito-idp:*"]
    resources = ["arn:aws:cognito-idp:${local.region}:${local.account_id}:userpool/*"]
  }

  statement {
    sid       = "CreateUserPoolsAndReadDomains"
    actions   = ["cognito-idp:CreateUserPool", "cognito-idp:DescribeUserPoolDomain"]
    resources = ["*"]
  }

  statement {
    sid = "ManageAuthConfigParameter"
    actions = [
      "ssm:PutParameter",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:DeleteParameter",
      "ssm:AddTagsToResource",
      "ssm:RemoveTagsFromResource",
      "ssm:ListTagsForResource",
    ]
    resources = [local.auth_config_param]
  }

  statement {
    sid       = "DescribeParameters"
    actions   = ["ssm:DescribeParameters"]
    resources = ["*"]
  }

  # Manifests are locked in governance mode; without this, s3:* would let CI delete them or
  # shorten their retention.
  statement {
    sid       = "NeverBypassManifestRetention"
    effect    = "Deny"
    actions   = ["s3:BypassGovernanceRetention"]
    resources = ["arn:aws:s3:::${var.data_bucket}/*"]
  }

  statement {
    sid       = "NeverDropTheBoundary"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary"]
    resources = ["*"]
  }

  # The boundary limits what the agent role can do, not who can assume it. Without these, code
  # merged to main could make the role assumable from another account and keep that access
  # outside the pipeline. Trust changes are applied by an admin, never by CI.
  statement {
    sid       = "NeverChangeWhoAssumesRoles"
    effect    = "Deny"
    actions   = ["iam:UpdateAssumeRolePolicy", "iam:DeleteRole"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "ci_deploy" {
  name   = "deploy"
  role   = aws_iam_role.ci_deploy.id
  policy = data.aws_iam_policy_document.ci_deploy.json
}

# Reports any role trust, bucket or key policy in the account that grants access to a principal
# outside it, including changes made outside Terraform.
resource "aws_accessanalyzer_analyzer" "account" {
  analyzer_name = "clearframe-account"
  type          = "ACCOUNT"
}

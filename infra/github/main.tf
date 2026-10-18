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

  # Written out rather than read from the resources: a policy document that references a resource
  # with pending changes is only read at apply time, so every plan would show the deploy role's
  # policy as changing.
  workload_boundary = "arn:aws:iam::${local.account_id}:policy/${var.workload_prefix}-boundary"
  notary_function   = "arn:aws:lambda:${local.region}:${local.account_id}:function:${var.notary_name}"
  notary_role       = "arn:aws:iam::${local.account_id}:role/${var.notary_name}"
  notary_log_group  = "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.notary_name}"
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.github_oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

# Signs the clearance certificate of every manifest the API issues. An asymmetric KMS key never
# leaves KMS, so whoever may call kms:Sign on it is what a certificate vouches for: only the
# notary (notary.tf), which checks each manifest against the rule first. CI deploys the agent and
# so controls whatever the agent role may do; neither may sign.
resource "aws_kms_key" "manifest_signing" {
  description              = "Signs Clearframe clearance certificates"
  customer_master_key_spec = "ECC_NIST_P256"
  key_usage                = "SIGN_VERIFY"
  deletion_window_in_days  = 30

  # Every certificate it signed would become unverifiable unless its public key is kept elsewhere.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_kms_alias" "manifest_signing" {
  name          = "alias/${var.workload_prefix}-manifest-signing"
  target_key_id = aws_kms_key.manifest_signing.key_id
}

data "aws_kms_public_key" "manifest_signing" {
  key_id = aws_kms_key.manifest_signing.arn
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
    actions   = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:PutObjectRetention"]
    resources = ["arn:aws:s3:::${var.data_bucket}/*"]
  }

  statement {
    sid     = "Tables"
    actions = ["dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:GetItem", "dynamodb:Query"]
    resources = [
      "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${var.workload_prefix}-*",
      "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${var.workload_prefix}-*/index/*",
    ]
  }

  statement {
    sid       = "Secrets"
    actions   = ["ssm:GetParameters"]
    resources = [local.ssm_parameters]
  }

  # Never kms:Sign: the agent role runs code CI deploys. It may only ask the notary.
  statement {
    sid       = "AskTheNotary"
    actions   = ["lambda:InvokeFunction"]
    resources = [local.notary_function]
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
    resources = [local.agent_role, local.workload_boundary]
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
      values   = [local.workload_boundary]
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

  # The account hosts other projects, so the CDN, sign-in and certificate permissions name this
  # stack's resources by id instead of matching every one of their kind. AWS generates those ids:
  # creating or replacing one of these resources is an administrator's job, who then updates the
  # id in variables.tf.
  statement {
    sid     = "ManageCdn"
    actions = ["cloudfront:*"]
    resources = concat(
      ["arn:aws:cloudfront::${local.account_id}:distribution/${var.cloudfront_distribution_id}"],
      [
        for id in var.cloudfront_origin_access_control_ids :
        "arn:aws:cloudfront::${local.account_id}:origin-access-control/${id}"
      ],
      [
        "arn:aws:cloudfront::${local.account_id}:response-headers-policy/${var.cloudfront_response_headers_policy_id}",
        "arn:aws:cloudfront::${local.account_id}:function/${var.workload_prefix}-*",
      ],
    )
  }

  statement {
    sid = "ManageCertificate"
    actions = [
      "acm:DescribeCertificate",
      "acm:ListTagsForCertificate",
      "acm:AddTagsToCertificate",
      "acm:RemoveTagsFromCertificate",
    ]
    resources = ["arn:aws:acm:us-east-1:${local.account_id}:certificate/${var.certificate_id}"]
  }

  statement {
    sid       = "ManageUserPool"
    actions   = ["cognito-idp:*"]
    resources = ["arn:aws:cognito-idp:${local.region}:${local.account_id}:userpool/${var.user_pool_id}"]
  }

  statement {
    sid       = "ReadUserPoolDomains"
    actions   = ["cognito-idp:DescribeUserPoolDomain"]
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

  # CI can deploy code that asks the notary for a certificate, through the agent role, and the
  # notary signs only what the rule would issue. CI must not sign itself, change the key's
  # policy or grants, or change the notary, its role or its log of what it signed.
  statement {
    sid    = "NeverSignOrChangeWhoSigns"
    effect = "Deny"
    actions = [
      "kms:Sign",
      "kms:CreateGrant",
      "kms:PutKeyPolicy",
      "kms:ScheduleKeyDeletion",
      "kms:DisableKey",
    ]
    resources = ["*"]
  }

  statement {
    sid     = "NeverTouchTheNotary"
    effect  = "Deny"
    actions = ["lambda:*", "iam:*", "logs:*"]
    resources = [
      local.notary_function,
      "${local.notary_function}:*",
      local.notary_role,
      local.notary_log_group,
      "${local.notary_log_group}:*",
    ]
  }

  # Terraform manages the user pool, its client and its domain, never users. Without this,
  # cognito-idp:* on the pool would let CI create accounts, set their passwords and sign in as
  # them, past the per-user quota. Users are created by an administrator with the AWS CLI.
  # UpdateUserPool can still turn on self sign-up; that stays a reviewed change in modules/auth.
  statement {
    sid    = "NeverManageUsers"
    effect = "Deny"
    actions = [
      "cognito-idp:Admin*",
      "cognito-idp:CreateUserImportJob",
      "cognito-idp:StartUserImportJob",
      "cognito-idp:CreateIdentityProvider",
      "cognito-idp:UpdateIdentityProvider",
    ]
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

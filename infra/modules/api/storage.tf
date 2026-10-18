resource "aws_s3_bucket" "data" {
  bucket = var.data_bucket_name
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "data_bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.data.arn, "${aws_s3_bucket.data.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "data" {
  bucket = aws_s3_bucket.data.id
  policy = data.aws_iam_policy_document.data_bucket.json
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id

  versioning_configuration {
    status = "Enabled"
  }
}

# No default retention: the Lambda locks each manifest as it writes it, and catalog uploads stay
# replaceable. Irreversible: once enabled, Object Lock stays on and versioning cannot be suspended.
resource "aws_s3_bucket_object_lock_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  depends_on = [aws_s3_bucket_versioning.data]
}

resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "expire-manifests"
    status = "Enabled"

    filter {
      prefix = "manifests/"
    }

    expiration {
      days = var.run_retention_days
    }

    # In a versioned bucket, expiration only hides a manifest behind a delete marker. This deletes
    # it the day after, once its Object Lock retention has passed.
    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }

  rule {
    id     = "expire-replaced-catalogs"
    status = "Enabled"

    filter {
      prefix = "data/"
    }

    # A replaced catalog is kept as long as the manifests that may have been cleared against it.
    noncurrent_version_expiration {
      noncurrent_days = var.run_retention_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.data]
}

resource "aws_s3_object" "catalog" {
  for_each = toset(["catalog.json", "embeddings.json"])

  bucket       = aws_s3_bucket.data.id
  key          = "data/${each.key}"
  source       = "${var.data_dir}/${each.key}"
  source_hash  = filemd5("${var.data_dir}/${each.key}")
  content_type = "application/json"
}

resource "aws_dynamodb_table" "runs" {
  name         = "${var.name_prefix}-runs"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "runId"

  attribute {
    name = "runId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  # Lists a user's runs newest first. Projects only what the list shows, so listing reads no steps.
  global_secondary_index {
    name               = "byUser"
    projection_type    = "INCLUDE"
    non_key_attributes = ["prompt", "territory", "date", "stopReason", "clipCount", "rejectedCount", "costUsd"]

    key_schema {
      attribute_name = "userId"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "createdAt"
      key_type       = "RANGE"
    }
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

resource "aws_dynamodb_table" "quotas" {
  name         = "${var.name_prefix}-quotas"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userDay"

  attribute {
    name = "userDay"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}

locals {
  content_types = {
    html        = "text/html; charset=utf-8"
    txt         = "text/plain; charset=utf-8"
    js          = "application/javascript"
    css         = "text/css"
    json        = "application/json"
    map         = "application/json"
    svg         = "image/svg+xml"
    ico         = "image/x-icon"
    png         = "image/png"
    woff2       = "font/woff2"
    webmanifest = "application/manifest+json"
  }

  # config.json is written by the environment, which knows the Cognito ids this build does not.
  site_files = setsubtract(fileset(var.site_dir, "**"), ["config.json"])
}

resource "aws_s3_bucket" "site" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket = aws_s3_bucket.site.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "site_bucket" {
  statement {
    sid       = "AllowThisDistributionOnly"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }

  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]

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

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site_bucket.json
}

resource "aws_s3_object" "site" {
  for_each = local.site_files

  bucket       = aws_s3_bucket.site.id
  key          = each.key
  source       = "${var.site_dir}/${each.key}"
  source_hash  = filemd5("${var.site_dir}/${each.key}")
  content_type = lookup(local.content_types, reverse(split(".", each.key))[0], "application/octet-stream")

  # Hashed build assets never change under the same name; everything else must be revalidated,
  # so a deploy is visible without a CloudFront invalidation.
  cache_control = startswith(each.key, "_next/static/") ? "public, max-age=31536000, immutable" : "no-cache"
}

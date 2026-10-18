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

# Inline rather than an aws_iam_policy_document: a data source that references the distribution
# is only read at apply time whenever the distribution has changes, so every such plan would show
# this policy as changing.
resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowThisDistributionOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.site.arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.this.arn } }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
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

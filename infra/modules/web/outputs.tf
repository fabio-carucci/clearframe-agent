output "url" {
  value = "https://${var.domain_name}"
}

output "cloudfront_url" {
  value = "https://${aws_cloudfront_distribution.this.domain_name}"
}

output "domain" {
  description = "The distribution's cloudfront.net name: the target of the custom domain's CNAME."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "certificate_validation_record" {
  description = "The CNAME ACM checks to issue and renew the certificate."
  value = one([
    for option in aws_acm_certificate.site.domain_validation_options : {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  ])
}

output "bucket" {
  value = aws_s3_bucket.site.id
}

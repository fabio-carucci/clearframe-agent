resource "aws_acm_certificate" "site" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# The domain's DNS is hosted outside AWS, so Terraform cannot write the validation record: this
# waits until it is added there by hand and ACM issues the certificate. That record must stay, or
# the certificate cannot renew.
resource "aws_acm_certificate_validation" "site" {
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.site.arn

  timeouts {
    create = "30m"
  }
}

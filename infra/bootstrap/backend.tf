terraform {
  backend "s3" {
    bucket       = "clearframe-tfstate-6iit7"
    key          = "bootstrap/terraform.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    use_lockfile = true
  }
}

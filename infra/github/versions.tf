terraform {
  required_version = ">= 1.10"

  backend "s3" {
    bucket       = "clearframe-tfstate-6iit7"
    key          = "github/terraform.tfstate"
    region       = "eu-west-1"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.69"
    }
  }
}

provider "aws" {
  region = "eu-west-1"

  default_tags {
    tags = {
      Project   = "clearframe"
      Stack     = "github"
      ManagedBy = "terraform"
    }
  }
}

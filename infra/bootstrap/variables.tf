variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "state_bucket_name" {
  description = "Globally unique name of the bucket holding every Terraform state of the project."
  type        = string
  default     = "clearframe-tfstate-6iit7"
}

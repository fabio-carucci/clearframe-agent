variable "name_prefix" {
  type = string
}

variable "domain_prefix" {
  description = "Prefix of the Cognito managed login domain: <prefix>.auth.<region>.amazoncognito.com. Unique per region."
  type        = string
}

variable "callback_urls" {
  description = "Where Cognito may send users back after sign-in. Anything else is refused."
  type        = list(string)
}

variable "logout_urls" {
  type = list(string)
}

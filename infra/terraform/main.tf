terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

module "network" {
  source                = "./modules/network"
  project_name          = var.project_name
  vpc_cidr              = var.vpc_cidr
  public_subnet_cidr    = var.public_subnet_cidr
  private_subnet_cidr   = var.private_subnet_cidr
  private_subnet_b_cidr = var.private_subnet_b_cidr
  availability_zone     = var.availability_zone
  aws_region            = var.aws_region
}

module "storage" {
  source                   = "./modules/storage"
  bucket_name              = var.artifact_bucket_name
  artifact_expiration_days = 30
}

module "registry" {
  source       = "./modules/registry"
  project_name = var.project_name
}

module "database" {
  source                 = "./modules/database"
  project_name           = var.project_name
  data_security_group_id = module.network.data_security_group_id
  db_subnet_group_name   = module.network.db_subnet_group_name
  db_username            = var.db_username
}

module "iam" {
  source                  = "./modules/iam"
  project_name            = var.project_name
  artifact_bucket_arn     = module.storage.bucket_arn
  db_password_arn         = module.database.ssm_password_arn
  backend_repository_arn  = module.registry.backend_repository_arn
  frontend_repository_arn = module.registry.frontend_repository_arn
}

module "compute" {
  source                    = "./modules/compute"
  project_name              = var.project_name
  instance_type             = var.instance_type
  public_subnet_id          = module.network.public_subnet_id
  app_security_group_id     = module.network.app_security_group_id
  iam_instance_profile_name = module.iam.instance_profile_name
}

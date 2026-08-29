#!/bin/bash
set -e

# bootstrap
cat << 'TF' > infra/terraform/bootstrap/main.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Cost estimate: $0.00/month (Free Tier allows 5GB Standard storage)
resource "aws_s3_bucket" "terraform_state" {
  bucket = var.state_bucket_name
}

resource "aws_s3_bucket_versioning" "terraform_state_versioning" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state_crypto" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state_access" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Cost estimate: $0.00/month (Free Tier allows 25 GB of storage and 2.5M stream read requests/month)
resource "aws_dynamodb_table" "terraform_locks" {
  name         = var.dynamodb_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"
  attribute {
    name = "LockID"
    type = "S"
  }
}
TF

cat << 'TF' > infra/terraform/bootstrap/variables.tf
variable "aws_region" {
  type    = string
  default = "us-east-1"
}
variable "state_bucket_name" {
  type = string
}
variable "dynamodb_table_name" {
  type = string
}
TF

# network
cat << 'TF' > infra/terraform/modules/network/main.tf
# Cost estimate: $0.00/month (VPC and basic networking components are free)
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags = {
    Name = "${var.project_name}-igw"
  }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidr
  map_public_ip_on_launch = true
  availability_zone       = var.availability_zone
  tags = {
    Name = "${var.project_name}-public-subnet"
  }
}

# Note: We are not deploying a NAT Gateway as it costs ~$32/month.
# A private subnet is created for database placement (via single-AZ if using RDS free tier).
resource "aws_subnet" "private" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidr
  availability_zone = var.availability_zone
  tags = {
    Name = "${var.project_name}-private-subnet"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }
  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "app" {
  name        = "${var.project_name}-app-sg"
  description = "Allow inbound HTTP/HTTPS traffic to the orchestrator"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "data" {
  name        = "${var.project_name}-data-sg"
  description = "Allow database access only from the app tier"
  vpc_id      = aws_vpc.main.id

  # Ingress restricted to the app SG rather than 0.0.0.0/0 so Postgres is unreachable from the public internet even if the instance is compromised
  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
TF

cat << 'TF' > infra/terraform/modules/network/variables.tf
variable "project_name" { type = string }
variable "vpc_cidr" { type = string }
variable "public_subnet_cidr" { type = string }
variable "private_subnet_cidr" { type = string }
variable "availability_zone" { type = string }
TF

cat << 'TF' > infra/terraform/modules/network/outputs.tf
output "vpc_id" { value = aws_vpc.main.id }
output "public_subnet_id" { value = aws_subnet.public.id }
output "private_subnet_id" { value = aws_subnet.private.id }
output "app_security_group_id" { value = aws_security_group.app.id }
output "data_security_group_id" { value = aws_security_group.data.id }
TF

# iam
cat << 'TF' > infra/terraform/modules/iam/main.tf
resource "aws_iam_role" "orchestrator" {
  name = "${var.project_name}-orchestrator-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = { Service = "ec2.amazonaws.com" }
      }
    ]
  })
}

resource "aws_iam_policy" "s3_artifacts" {
  name        = "${var.project_name}-s3-artifacts-policy"
  description = "Least privilege access for orchestrator to manage S3 artifacts"
  policy      = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.artifact_bucket_arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket"
        ]
        Resource = var.artifact_bucket_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "orchestrator_s3" {
  role       = aws_iam_role.orchestrator.name
  policy_arn = aws_iam_policy.s3_artifacts.arn
}

resource "aws_iam_instance_profile" "orchestrator" {
  name = "${var.project_name}-orchestrator-profile"
  role = aws_iam_role.orchestrator.name
}
TF

cat << 'TF' > infra/terraform/modules/iam/variables.tf
variable "project_name" { type = string }
variable "artifact_bucket_arn" { type = string }
TF

cat << 'TF' > infra/terraform/modules/iam/outputs.tf
output "instance_profile_name" { value = aws_iam_instance_profile.orchestrator.name }
TF

# compute
cat << 'TF' > infra/terraform/modules/compute/main.tf
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
  
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Cost estimate: $0.00/month (Free Tier allows 750 hours of t2.micro or t3.micro per month)
resource "aws_instance" "orchestrator" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  
  subnet_id                   = var.public_subnet_id
  vpc_security_group_ids      = [var.app_security_group_id]
  iam_instance_profile        = var.iam_instance_profile_name
  associate_public_ip_address = true
  
  # Cost estimate: $0.00/month (Free Tier allows 30 GB of EBS General Purpose SSD)
  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  tags = {
    Name = "${var.project_name}-orchestrator"
  }
}
TF

cat << 'TF' > infra/terraform/modules/compute/variables.tf
variable "project_name" { type = string }
variable "instance_type" { type = string }
variable "public_subnet_id" { type = string }
variable "app_security_group_id" { type = string }
variable "iam_instance_profile_name" { type = string }
TF

cat << 'TF' > infra/terraform/modules/compute/outputs.tf
output "instance_id" { value = aws_instance.orchestrator.id }
output "public_ip" { value = aws_instance.orchestrator.public_ip }
TF

# storage
cat << 'TF' > infra/terraform/modules/storage/main.tf
# Cost estimate: $0.00/month (Free Tier allows 5GB Standard storage)
resource "aws_s3_bucket" "artifacts" {
  bucket = var.bucket_name
}

resource "aws_s3_bucket_versioning" "artifacts_versioning" {
  bucket = aws_s3_bucket.artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts_crypto" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts_access" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts_lifecycle" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "expire_old_artifacts"
    status = "Enabled"
    filter {}

    expiration {
      days = var.artifact_expiration_days
    }
    
    noncurrent_version_expiration {
      noncurrent_days = 7
    }
  }
}
TF

cat << 'TF' > infra/terraform/modules/storage/variables.tf
variable "bucket_name" { type = string }
variable "artifact_expiration_days" { type = number }
TF

cat << 'TF' > infra/terraform/modules/storage/outputs.tf
output "bucket_id" { value = aws_s3_bucket.artifacts.id }
output "bucket_arn" { value = aws_s3_bucket.artifacts.arn }
TF

# root env
cat << 'TF' > infra/terraform/main.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  backend "s3" {
    bucket         = "gridnode-tfstate-12345"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "gridnode-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

module "network" {
  source              = "./modules/network"
  project_name        = var.project_name
  vpc_cidr            = var.vpc_cidr
  public_subnet_cidr  = var.public_subnet_cidr
  private_subnet_cidr = var.private_subnet_cidr
  availability_zone   = var.availability_zone
}

module "storage" {
  source                   = "./modules/storage"
  bucket_name              = var.artifact_bucket_name
  artifact_expiration_days = 30
}

module "iam" {
  source              = "./modules/iam"
  project_name        = var.project_name
  artifact_bucket_arn = module.storage.bucket_arn
}

module "compute" {
  source                    = "./modules/compute"
  project_name              = var.project_name
  instance_type             = var.instance_type
  public_subnet_id          = module.network.public_subnet_id
  app_security_group_id     = module.network.app_security_group_id
  iam_instance_profile_name = module.iam.instance_profile_name
}
TF

cat << 'TF' > infra/terraform/variables.tf
variable "aws_region" { type = string }
variable "project_name" { type = string }
variable "vpc_cidr" { type = string }
variable "public_subnet_cidr" { type = string }
variable "private_subnet_cidr" { type = string }
variable "availability_zone" { type = string }
variable "artifact_bucket_name" { type = string }
variable "instance_type" { type = string }
TF

cat << 'TF' > infra/terraform/outputs.tf
output "orchestrator_public_ip" { value = module.compute.public_ip }
output "artifact_bucket_name" { value = module.storage.bucket_id }
TF

cat << 'TF' > infra/terraform/terraform.tfvars.example
aws_region             = "us-east-1"
project_name           = "gridnode"
vpc_cidr               = "10.0.0.0/16"
public_subnet_cidr     = "10.0.1.0/24"
private_subnet_cidr    = "10.0.2.0/24"
availability_zone      = "us-east-1a"
artifact_bucket_name   = "gridnode-artifacts-prod-12345"
instance_type          = "t3.micro"
TF

cat << 'EOF' > .gitignore
*.tfstate
*.tfstate.*
*.tfvars
.terraform/
.terraform.lock.hcl

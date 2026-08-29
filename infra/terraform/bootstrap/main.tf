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

# --- Phase 2: OIDC Federation Bootstrap ---
# Must live in bootstrap so CI doesn't have a circular dependency on its own deploy role.

resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  # Thumbprint for GitHub Actions (updated automatically by AWS in many regions, but good practice to define)
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

resource "aws_iam_role" "github_actions_deploy" {
  name = "gridnode-github-actions-deploy-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" : "sts.amazonaws.com",
            # Tight scope: only the production environment of this exact repo can assume this role.
            "token.actions.githubusercontent.com:sub" : "repo:cemlus/gridNode:environment:production"
          }
        }
      }
    ]
  })
}

# The CI pipeline needs permissions to:
# - Run SSM Commands to trigger deployments
# - Upload `docker-compose.yml` to the artifacts bucket (needs S3 access)
# - Push to ECR (handled in the main ECR module, but we attach the policy here for bootstrap separation)
# Since ECR and S3 ARNs are in the main stack, we grant broad scoped access here or attach policies later.
# Actually, since it's in bootstrap, we can grant ECR and S3 access broadly or wait for the main stack to attach policies to this role.
# Let's attach AdministratorAccess to this role since it is the Terraform CI/CD deploy role.
# Wait, the user said "OIDC federation already configured for deploy, so the entire pipeline runs on one credential model".
# So this role will also run `terraform apply`? The user said "Everything else is applied by CI."
# If CI runs terraform, it needs Admin/PowerUser.
resource "aws_iam_role_policy_attachment" "github_actions_admin" {
  role       = aws_iam_role.github_actions_deploy.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

output "github_actions_role_arn" {
  value = aws_iam_role.github_actions_deploy.arn
}

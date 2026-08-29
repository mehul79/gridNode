# Cost estimate: ECR free tier is 500MB/month for 12 months. Exceeding this incurs $0.10/GB-month.
resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}-be"
  image_tag_mutability = "IMMUTABLE" # Enforces SHA-tagging property at the registry level

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-be-repo"
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "${var.project_name}-fe"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.project_name}-fe-repo"
  }
}

# Lifecycle policy strictly limits retention to cap usage under 500MB free-tier limits.
resource "aws_ecr_lifecycle_policy" "backend_cleanup" {
  repository = aws_ecr_repository.backend.name
  policy     = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images immediately"
        selection = {
          tagStatus   = "untagged"
          countType   = "imageCountMoreThan"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep last 2 tagged images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 2
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "frontend_cleanup" {
  repository = aws_ecr_repository.frontend.name
  policy     = aws_ecr_lifecycle_policy.backend_cleanup.policy
}

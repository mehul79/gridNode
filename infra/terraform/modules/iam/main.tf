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

resource "aws_iam_policy" "ssm_parameter_access" {
  name        = "${var.project_name}-ssm-parameter-policy"
  description = "Least privilege access for orchestrator to read DB password"
  policy      = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter"
        ]
        Resource = var.db_password_arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "orchestrator_s3" {
  role       = aws_iam_role.orchestrator.name
  policy_arn = aws_iam_policy.s3_artifacts.arn
}

resource "aws_iam_role_policy_attachment" "orchestrator_ssm_parameter" {
  role       = aws_iam_role.orchestrator.name
  policy_arn = aws_iam_policy.ssm_parameter_access.arn
}

resource "aws_iam_role_policy_attachment" "orchestrator_ssm_core" {
  role       = aws_iam_role.orchestrator.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "orchestrator" {
  name = "${var.project_name}-orchestrator-profile"
  role = aws_iam_role.orchestrator.name
}

resource "aws_iam_policy" "ecr_pull" {
  name        = "${var.project_name}-ecr-pull-policy"
  description = "Allow orchestrator to pull images from ECR"
  policy      = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = [
          var.backend_repository_arn,
          var.frontend_repository_arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "orchestrator_ecr_pull" {
  role       = aws_iam_role.orchestrator.name
  policy_arn = aws_iam_policy.ecr_pull.arn
}

resource "aws_iam_policy" "cloudwatch_logs" {
  name        = "${var.project_name}-cloudwatch-logs-policy"
  description = "Allow orchestrator to write container logs to CloudWatch"
  policy      = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ]
        Resource = "arn:aws:logs:*:*:log-group:/ecs/gridnode-*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "orchestrator_cloudwatch_logs" {
  role       = aws_iam_role.orchestrator.name
  policy_arn = aws_iam_policy.cloudwatch_logs.arn
}

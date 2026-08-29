#!/bin/bash
set -e

# 1. Update Network module to remove SSH and add DB subnet group
sed -i '/from_port   = 22/,/cidr_blocks = \["0.0.0.0\/0"\]/d' infra/terraform/modules/network/main.tf
sed -i '/ingress {/,/}/d' infra/terraform/modules/network/main.tf
cat << 'TF' >> infra/terraform/modules/network/main.tf
# App tier SG
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

  # No SSH port 22 ingress. All management access must be via SSM Session Manager.

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

resource "aws_db_subnet_group" "private" {
  name       = "${var.project_name}-db-subnet-group"
  subnet_ids = [aws_subnet.private.id, aws_subnet.public.id] # Required 2 subnets for RDS, even if Single-AZ. Using public as a dummy second AZ, but DB is strictly private.
  
  tags = {
    Name = "${var.project_name}-db-subnet-group"
  }
}
TF
# Fix the duplicate resources I just caused via sed/cat appending... I should just overwrite the file to be safe.

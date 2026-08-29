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

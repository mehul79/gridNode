resource "random_password" "db_password" {
  length           = 32
  special          = true
  # RDS Postgres restricts certain special characters like /, @, ", and spaces in the master password.
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_ssm_parameter" "db_password" {
  name  = "/${var.project_name}/database/password"
  type  = "SecureString"
  value = random_password.db_password.result
}

# Cost estimate: ~$15-20/month if free tier has expired. Free Tier allows 750 hrs/month of db.t3.micro, 20GB General Purpose (SSD) storage, and 20GB of automated backup storage for 12 months.
resource "aws_db_instance" "postgres" {
  identifier           = "${var.project_name}-postgres"
  engine               = "postgres"
  engine_version       = "15.4" 
  instance_class       = "db.t3.micro"
  allocated_storage    = 20
  storage_type         = "gp2"
  
  db_name              = "gridnode"
  username             = var.db_username
  password             = random_password.db_password.result 
  
  vpc_security_group_ids = [var.data_security_group_id]
  db_subnet_group_name   = var.db_subnet_group_name
  
  publicly_accessible = false
  multi_az            = false 
  storage_encrypted   = true
  
  backup_retention_period = 7
  
  deletion_protection = false
  skip_final_snapshot = true
  
  tags = {
    Name = "${var.project_name}-postgres"
  }
}

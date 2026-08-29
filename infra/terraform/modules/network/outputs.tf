output "vpc_id" { value = aws_vpc.main.id }
output "public_subnet_id" { value = aws_subnet.public.id }
output "private_subnet_id" { value = aws_subnet.private.id }
output "app_security_group_id" { value = aws_security_group.app.id }
output "data_security_group_id" { value = aws_security_group.data.id }
output "db_subnet_group_name" { value = aws_db_subnet_group.private.name }

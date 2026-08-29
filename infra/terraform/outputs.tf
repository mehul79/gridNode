output "orchestrator_public_ip" { value = module.compute.public_ip }
output "artifact_bucket_name" { value = module.storage.bucket_id }

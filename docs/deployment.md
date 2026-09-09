# GridNode Deployment Guide

> **⚠️ PROMINENT COST WARNING ⚠️**
> The AWS RDS and EC2 Free Tiers are only available for 12 months after account creation.
> On an older account, this stack costs real money—roughly **$15–$20/month** for RDS alone.
> Anyone applying this infrastructure MUST check their AWS Free Tier status first and set up an AWS Billing Alarm to prevent billing surprises.

## Prerequisites
1. Configure AWS CLI with an IAM user that has administrative privileges.
2. Ensure you have installed Terraform (`>= 1.5.0`).
3. Setup an AWS Billing Alarm in the AWS Console (`Billing Dashboard` > `Billing Preferences` > `Receive Free Tier Usage Alerts`).

## 1. Bootstrap State Storage
[TODO: Reasoning for the sequence...]
```bash
cd infra/terraform/bootstrap
terraform init
terraform plan
terraform apply
```

## 2. Deploy Infrastructure
[TODO: Reasoning for the sequence...]
```bash
cd ../
# Ensure your terraform.tfvars is populated
terraform init
terraform plan
terraform apply
```

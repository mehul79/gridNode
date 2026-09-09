# GridNode Runbook

## Rollback Procedure

Deployments use immutable Docker image tags based on the Git commit SHA (`${{ github.sha }}`). This enables instant, deterministic rollbacks without needing to rebuild the codebase.

### How to Roll Back a Deployment

If a recent deployment introduces a critical regression, follow these steps to roll back:

1. **Identify the Last Known Good SHA:**
   Locate the commit SHA of the previously stable release via GitHub Commits or Actions.
   *(e.g., `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0`)*

2. **Trigger the Rollback via SSM:**
   The EC2 orchestrator is entirely isolated and relies on AWS SSM Session Manager for access.
   
   Execute the following AWS CLI command to force the orchestrator to pull and run the stable tag:
   ```bash
   aws ssm send-command \
     --instance-ids "<YOUR_EC2_INSTANCE_ID>" \
     --document-name "AWS-RunShellScript" \
     --parameters "commands=[
       \"cd /opt/gridnode\",
       \"export IMAGE_TAG=<LAST_KNOWN_GOOD_SHA>\",
       \"docker-compose pull\",
       \"docker-compose up -d\"
     ]"
   ```

3. **Verify Health:**
   Check the application health and ensure the logs indicate a clean startup.
   [TODO: Note specific metrics or logs to check]

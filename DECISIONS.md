# Decisions Log

## Phase 1 — Terraform

### State Management: Remote S3 + DynamoDB vs Local State
**Picked:** Remote state backend on S3 with DynamoDB state locking.
**Rejected:** Local `.tfstate` files committed to Git or stored on individual machines.
**Why:** GridNode is meant to be a reliable platform. Local state fundamentally breaks when multiple people (or a CI/CD pipeline) attempt to manage infrastructure concurrently, leading to split-brain scenarios and resource corruption. Remote state ensures a single source of truth, and DynamoDB locking guarantees that two `terraform apply` operations cannot run concurrently and step on each other.

### Compute Authentication: IAM Instance Profile vs Hardcoded Credentials
**Picked:** AWS IAM Instance Profile attached directly to the Orchestrator EC2 instance.
**Rejected:** Generating long-lived IAM Access Keys and injecting them via `.env` or `~/.aws/credentials`.
**Why:** Long-lived keys are a massive security liability—if leaked, they provide persistent access to the AWS account. An instance profile relies on temporary STS credentials that are automatically rotated by AWS. This entirely eliminates the secret management burden and strictly ties the identity to the compute resource that actually needs it.

### S3 Artifact Policy: Least Privilege
**Picked:** An IAM policy restricted exclusively to the artifact bucket ARN, permitting only `PutObject`, `GetObject`, `DeleteObject` on the bucket contents (`arn:aws:s3:::<bucket>/*`), and `ListBucket` on the bucket itself.
**Rejected:** The managed `AmazonS3FullAccess` policy or wildcard resource ARNs (`"Resource": "*"`).
**Why:** GridNode acts as a broker issuing pre-signed URLs, meaning it only needs to read, write, and expire specific job artifacts. If the orchestrator is compromised, the blast radius is strictly confined to the artifacts bucket. The attacker cannot list or access other buckets in the AWS account, nor modify bucket configuration (like turning off versioning or making the bucket public).

### EC2 Orchestrator Capacity Limitations
**Limitation:** A `t3.micro` instance provides only 1GB RAM and 2 vCPUs. Running the Node orchestrator, Redis, and eventually a Prometheus/Grafana stack on this node is severely constrained.
**Mitigation:** 
- A 2GB swap file is provisioned via EC2 `user_data` as a crash-avoidance backstop to prevent abrupt OOM kills.
- Node will be constrained to `--max-old-space-size=384`.
- Redis is constrained to `128mb` with an `allkeys-lru` eviction policy.
**Risk:** Redis is used as the BullMQ job queue. Evicting keys under pressure is a correctness risk (jobs may be lost/dropped), not just a performance hit. In a real budget environment, separating the observability stack and moving Redis to a managed service (ElastiCache) or enabling disk persistence would be the primary correction.

### Compute Access: SSM Session Manager vs SSH
**Picked:** AWS Systems Manager (SSM) Session Manager (using the `AmazonSSMManagedInstanceCore` policy).
**Rejected:** Port 22 SSH ingress open to the internet.
**Why:** It removes the need for inbound security group rules entirely. The orchestrator now has zero inbound management access. All sessions are IAM-authenticated, lack the key-management burden of SSH keys, and can be logged to CloudTrail.
**Network Placement:** SSM requires outbound 443 access to AWS endpoints. The EC2 instance is placed in the public subnet specifically because it avoids the need for a billable NAT Gateway or VPC Interface Endpoints, which would be required if placed in a private subnet.

### Database Placement: RDS in Private Subnets vs Docker Compose
**Picked:** RDS Postgres `db.t3.micro` in the private subnet group.
**Rejected:** Running Postgres directly on the EC2 instance via Docker Compose.
**Why:** Moving Postgres off the box frees up roughly 200MB of vital RAM. Crucially, it makes the network security model load-bearing. With Postgres in RDS on a private subnet, the `data-sg` security group actively restricts inbound 5432 traffic exclusively to the `app-sg` EC2 instance, shielding the database from the internet even if EC2 is compromised.
**Redis Tradeoff:** Redis remains in Docker because it serves as an ephemeral queue. Spinning up a separate ElastiCache instance would break the complexity/budget bounds here.

### EC2 Instance Hardening: IMDSv2 Enforcement
**Picked:** `metadata_options { http_tokens = "required" }` on the EC2 instance.
**Rejected:** Default IMDSv1 allowed.
**Why:** IMDSv1 relies on simple GET requests to the instance metadata endpoint. If an application-layer vulnerability (like SSRF) exists in the untrusted third-party workloads running on GridNode, an attacker could extract the IAM instance profile credentials. Enforcing IMDSv2 requires a `PUT` request with a specific TTL header, successfully mitigating this extraction risk.

### Security Group Rule Conventions
**Picked:** Standalone `aws_security_group_rule` resources uniformly for both App and Data tiers.
**Rejected:** Inline `ingress`/`egress` blocks within the `aws_security_group` resource.
**Why:** Terraform does not tolerate mixing inline blocks and standalone resources on the same security group—it causes state thrashing where rules are repeatedly added and removed. Adopting standalone rules globally enforces a consistent pattern that natively prevents this silent conflict.

### RDS Master Password Constraints
**Limitation:** `random_password` includes characters like `/`, `@`, `"`, and space by default, which AWS RDS outright rejects for master passwords.
**Mitigation:** `override_special` is strictly defined as `!#$%&*()-_=+[]{}<>:?`.
**Why:** This is a classic example of an integration constraint that `terraform validate` physically cannot catch (because the configuration parses successfully), but which blows up during the actual API apply phase. Defining explicit safe characters prevents this.

### KMS Decrypt for SecureString
**Limitation / Question:** Does the orchestrator's IAM role require explicit `kms:Decrypt` permissions to retrieve the DB password from SSM if it's stored as a `SecureString`?
**Finding:** No. GridNode is using the default AWS-managed KMS key (`alias/aws/ssm`). As per AWS documentation, if a user/role has access to an SSM parameter encrypted with the AWS-managed key, they do not need explicit `kms:Decrypt` permissions in their IAM policy because the AWS-managed key's internal resource policy implicitly grants permission to the account's authorized SSM callers. If we ever switch to a Customer Managed Key (CMK), we would need to explicitly grant `kms:Decrypt` on that key ARN.

## Phase 2 — CI/CD

### CI Workflow Setup
**Picked:** Distinct jobs for linting, typechecking, tests, docker-builds, and static analysis.
**Why:** Fail fast logic. `terraform-check` enforces `tflint` and `trivy` as blocking gates, ensuring no misconfigured or insecure infrastructure changes merge into `main`.

### Deployment Authentication
**Picked:** AWS OIDC Federation via GitHub Actions.
**Rejected:** `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` stored as repository secrets.
**Why:** OIDC federation generates short-lived STS tokens bound specifically to the GitHub repository and workflow context. Static keys inevitably leak or sit unrotated for years. OIDC is inherently zero-trust identity federation.

### Immutable Image Tagging
**Picked:** Tagging Docker images with `${{ github.sha }}`.
**Rejected:** Tagging with `latest`.
**Why:** `latest` creates a mutable target, meaning rollbacks are impossible without re-running CI/CD pipelines to build old code. SHA tags enable deterministic, instant rollbacks by simply reverting the deployment manifest or manually triggering `docker-compose up` with an older SHA tag.

### Container Registry: ECR vs GHCR
**Picked:** AWS ECR (Elastic Container Registry) scoped natively to the AWS account.
**Rejected:** GitHub Container Registry (GHCR) using a PAT stored in Secrets Manager.
**Why:** Storing a long-lived GitHub PAT inside AWS Secrets Manager explicitly violates our zero-trust OIDC architecture (which eliminates static credentials entirely). By switching to ECR, the EC2 instance dynamically fetches auth tokens via its IAM instance profile, and GitHub Actions dynamically authenticates to ECR via its existing OIDC trust. No passwords exist.
**Constraint:** ECR's free tier limits storage to 500MB. To stay within bounds, strict lifecycle policies are enforced (untagged images expire immediately, max 5 retained tags).

### Host Configuration Split (Bootstrap vs Deploy)
**Picked:** `user_data` strictly handles infrastructure bootstrapping (installing Docker, configuring `/swapfile`, making directories). `docker-compose.yml` is shipped as part of the deploy pipeline and written directly via SSM.
**Rejected:** Baking the `docker-compose.yml` into `user_data` or using Ansible.
**Why:** Baking the compose file into `user_data` forces a full EC2 instance replacement just to change an application environment variable. By isolating the compose file to the deployment pipeline, it ensures the infrastructure remains decoupled from app configuration, and the compose version strictly matches the immutable SHA image being deployed (enabling clean rollbacks). Ansible is rejected because the single-host architecture does not justify the complexity overhead.

### CI/CD Supply Chain Hardening
**Picked:** Pinning third-party GitHub Actions to explicit commit SHAs (e.g., `actions/checkout@eef61447...`).
**Rejected:** Using semantic version tags (e.g., `@v4`).
**Why:** Tags are mutable references. If an attacker compromises a popular GitHub Action and moves the `v4` tag to malicious code, they gain arbitrary execution inside our CI pipeline (with our AWS OIDC token in scope). Pinning SHAs mitigates this supply chain vector entirely, at the minor cost of manual maintenance/updates.

### IAM OIDC Provider Location (Bootstrap)
**Picked:** Placing the GitHub OIDC Identity Provider and the `deploy` role in `infra/terraform/bootstrap/main.tf`.
**Rejected:** Placing them alongside the application IAM roles in the main module structure.
**Why:** The OIDC provider and role are foundational primitives required for the CI pipeline to exist. If they were managed by the CI pipeline's Terraform execution, CI would be unable to bootstrap itself. Like the S3 remote state bucket, this explicitly delineates the "human-applied once" layer from the "CI-applied forever" layer.

## Phase 3 — Observability

### Metrics Instrumentation (Prometheus)
**Picked:** Exposing `/metrics` via the `prom-client` library in the Node.js backend.
**Why:** Wraps the Express application globally via middleware rather than tightly coupling metric increments into the `Best Fit` scheduling logic or database query routes. Collects the standard Node.js footprint (Event loop lag, memory) and API throughput (HTTP latency, error rate). 

### Alerting Thresholds
**Picked:** 
- **HighApiErrorRate:** >5% 5xx errors over 5m.
- **HighApiLatency:** 95th percentile > 2s over 2m.
- **NodeEventLoopLag:** > 100ms over 1m.
**Why:** These are foundational symptom-based (RED - Rate, Errors, Duration) metrics. A >100ms event loop lag is heavily indicative of the Node orchestrator doing heavy synchronous bin-packing (scheduling logic), and is a leading indicator for health drops before HTTP latency actually spikes or the sweeper fails to fire.

### Deployment of Observability
**Picked:** A separate `docker-compose.monitoring.yml`.
**Why:** In the 1GB RAM limitation described in Phase 1, Prometheus and Grafana are heavily resource-constrained. If they crash due to memory pressure, separating their compose definitions prevents the crash from taking down the core `backend` and `frontend` GridNode containers. Ideally, observability runs on distinct infrastructure to ensure telemetry survives an application host failure, but free-tier bounds force co-location here.

## Phase 4 — Container Hardening

### Multi-Stage Dockerfiles & Pinned Digests
**Picked:** Pinned `node:18-alpine@sha256:...` images, decoupled dependency installation from the build step, and stripped devDependencies in the final runner stage.
**Why:** Pinning by SHA guarantees absolute immutability; `node:18-alpine` can secretly receive updates, a SHA cannot. Stripping `devDependencies` removes massive swathes of the attack surface (build tools, compilers) from the production image, keeping the footprint tiny and reducing CVEs.

### Explicit Non-Root Users
**Picked:** `USER node` (Backend) and `USER nextjs` (Frontend).
**Why:** Running as root inside a container is a fundamental security anti-pattern. If a directory traversal or remote code execution (RCE) vulnerability exists in the app, the attacker executes commands as the UID running the app. Lowering privileges contains the blast radius.

### CI Image Scanning (Trivy)
**Picked:** Uploading built images to local Docker daemon (`load: true`) and running Trivy over them *before* pushing to ECR.
**Why:** Fails the CI pipeline if an OS or library vulnerability marked `CRITICAL` or `HIGH` is introduced. Catching it before the ECR push guarantees vulnerable images never enter the deployment pipeline.

### gVisor vs GPU Exception
**Limitation:** gVisor (`runsc`) enforces strict syscall emulation, but lacks NVIDIA CUDA passthrough. GPU jobs must fall back to standard `runc`.
**Why:** Documenting this explicitly in `docs/gvisor_boundaries.md` sets an honest expectation for compute providers. CPU jobs are strictly sandboxed against kernel exploits; GPU jobs carry standard Docker host-kernel risk.

### gVisor Unavailability: Warn and Fall Back, but Report It
**Picked:** When Docker has no `runsc` runtime registered, the agent warns loudly and runs the job under `runc` instead of refusing it. The machine reports its actual mode (`Machine.isolationMode`) on registration and on every heartbeat, and the Machines page badges it. Owners who want the guarantee can set `COMPUTESHARE_REQUIRE_GVISOR=true` to refuse jobs instead.
**Why:** Refusing outright would make the agent unrunnable on Windows and macOS, where Docker Desktop cannot provide gVisor at all — and the risk of weaker isolation lands on the machine owner's own hardware, so it is their call to make. The failure mode we actually care about is a *silent* downgrade, which is why the mode is surfaced in the UI rather than left in the agent's journal.
**Correction:** `install.sh` previously downloaded the `runsc` binary but never ran `runsc install`, so Docker never exposed the runtime and `build_command` requested `--runtime runsc` unconditionally. Every CPU job on a freshly installed machine failed with `unknown runtime: runsc`. The installer now registers the runtime and verifies the download against its published SHA-512.

## Phase 4 Additions & Phase 3 Corrections

### Alert Routing
**Picked:** Grafana managed alerts wired to a Discord/Slack webhook.
**Rejected:** Deploying Alertmanager separately.
**Why:** Grafana 11 natively evaluates and routes alerts perfectly well. Running a discrete Alertmanager container wastes memory on a 1GB host to solve a problem that is already solved. A webhook is absolutely required so alerts push to human channels rather than decaying silently in a closed browser tab.

### Log Aggregation
**Picked:** Docker `awslogs` driver natively shipping logs to AWS CloudWatch.
**Rejected:** Deploying Grafana Loki locally.
**Why:** Container logs on a single EC2 host die when the instance terminates (which is exactly when you need them to debug). Loki solves this but is incredibly memory-hungry and inappropriate for a 1GB footprint. CloudWatch requires zero extra containers and is seamlessly authorized via the EC2 Instance Profile. We also set a global `max-size: 10m` fallback for the `json-file` driver to prevent the root EBS volume from choking on un-rotated logs if `awslogs` ever degrades.

### Database Telemetry (Postgres Exporter)
**Picked:** Deployed `postgres-exporter` within the monitoring stack.
**Why:** CloudWatch only reports hardware utilization (CPU, Disk). It has zero awareness of `pg_stat_activity` (the internal Postgres connection pool). A burst of scheduled jobs is highly likely to exhaust the connection pool on a `db.t4g.micro` before hitting a CPU limit. The exporter costs barely 20MB of RAM and provides the missing application-layer database visibility.

### Frontend Static Assets Load Testing
**Picked:** Declining to inject Nginx or CloudFront *until* measured.
**Why:** Adding architectural complexity (like a CDN or reverse proxy) to solve a presumed bottleneck violates evidence-based engineering. Next.js standalone already sets immutable cache headers on static assets. We will load test it first. If it's a bottleneck, we will add CloudFront (which costs $0 memory) over Nginx (which costs RAM).

### Strict Least-Privilege (Read-Only Root Filesystems)
**Picked:** Appending `read_only: true`, mounting `tmpfs` in `/tmp`, dropping `ALL` Linux capabilities, and enabling `no-new-privileges:true`.
**Why:** Achieving non-root isn't the finish line. This layered model neutralizes entire classes of exploits: if an attacker compromises Node, they cannot download payloads (read-only FS), they cannot execute privilege escalation binaries (no-new-privs), and they cannot manipulate network namespaces (capabilities dropped). 

### Python Agent Privilege (The Docker Socket Paradox)
**Picked:** Running the `computeshare-agent` Python binary under a dedicated `computeshare` unprivileged systemd user.
**Limitation:** The user *must* be added to the `docker` group to spawn gVisor workspaces. Membership in the `docker` group is natively root-equivalent, meaning a compromised agent can bypass its user constraints entirely.
**Why:** We are honest about the residual risk. We've dropped ambient root, but the only true fixes for this specific attack vector are migrating to Rootless Docker or deploying a strict Docker socket proxy that strictly whitelists `docker run/stop` commands.

### Supply Chain (Node EOL, Trivy, and Dependabot)
**Picked:** Migrated to `node:22-alpine` (latest LTS), enforced `ignore-unfixed: true` on Trivy, and added `.github/dependabot.yml` to automatically bump the SHAs.
**Why:** Pinning to an EOL image (Node 18) meant CVEs would accumulate with no available patch, rendering the Trivy gate a perpetual blocker. `ignore-unfixed` prevents Trivy from failing builds over CVEs that literally cannot be patched. Dependabot solves the "rot" of pinned SHAs by automating the bump PRs, giving us immutability without stagnation.

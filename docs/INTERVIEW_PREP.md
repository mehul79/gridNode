# GridNode Operations: Interview Prep

Use this guide to defend the operational, IaC, and security decisions made in this repository. 

## Foundational & Terraform
1. **Why Terraform over manual AWS console setup?**
   *Answer:* Infrastructure as Code gives us deterministic repeatability and auditability. It allows changes to the database size or security groups to pass through the exact same Git PR review process as application code, eliminating "ghost configuration" and accidental deletions.
2. **Explain the `bootstrap` vs `main` Terraform split.**
   *Answer:* The chicken-and-egg paradox. CI/CD needs an IAM OIDC role and a remote S3 state bucket to deploy `main` automatically. If we put those resources *inside* `main`, CI would need to exist before it could create the role that allows it to exist. We split it into a human-applied `bootstrap` and a machine-applied `main`.
3. **Why did we enforce IMDSv2 on the EC2 instance?**
   *Answer:* IMDSv1 is vulnerable to Server-Side Request Forgery (SSRF). If the Express app has a bug allowing a user to fetch arbitrary URLs, they can hit `169.254.169.254` and steal the EC2's IAM credentials. IMDSv2 requires a PUT request with a specific session token header, natively neutralizing the SSRF vector.
4. **How does the database sit in the network, and why?**
   *Answer:* It sits strictly in AWS private subnets. It has no route to an Internet Gateway. Egress traffic on its security group is completely blocked. This guarantees that even if the database is compromised, it physically cannot initiate a reverse shell or exfiltrate data to the public internet.

## CI/CD & Deployments
5. **How does GitHub Actions deploy to AWS without an Access Key?**
   *Answer:* OIDC Federation. GitHub Actions dynamically requests a temporary STS token from AWS. AWS verifies GitHub's cryptographic signature and issues the token because we explicitly mapped the trust policy to our repository (`sub: repo:cemlus/gridNode:environment:production`). No static passwords exist to leak.
6. **Why do we tag Docker images with `github.sha` instead of `latest`?**
   *Answer:* The `latest` tag is mutable; it breaks deterministic rollbacks because you can't guarantee what code `latest` currently points to. By pinning images to the Git SHA, we know exactly what code is running, and rolling back is an instant action (redeploying an old SHA) rather than waiting for a full CI rebuild.
7. **Explain the deploy process to EC2.**
   *Answer:* CI does not SSH into the box (port 22 is closed). Instead, CI uses the AWS API to trigger an SSM (Systems Manager) RunCommand. SSM tells the EC2 instance to fetch the new `docker-compose.yml` (injected with the new SHA) and run `docker compose up -d`. This enforces zero-inbound network access.
8. **Why pin third-party GitHub Actions by SHA instead of `@v4`?**
   *Answer:* Semantic version tags are mutable. If an attacker compromises the repository of a popular Action, they can update the `v4` tag to point to malicious code and execute it inside our pipeline (with our AWS credentials in scope). Pinning by SHA physically prevents this supply chain attack.

## Container Security & Sandboxing
9. **How did we achieve Least Privilege inside the Docker containers?**
   *Answer:* It's a five-layer defense. 1) We drop root via `USER node`. 2) We drop all Linux capabilities (`cap_drop: [ALL]`). 3) We prevent privilege escalation (`no-new-privileges:true`). 4) We mount the container as `read_only: true` with strict `tmpfs` mounts. 5) We strip compilers out via Multi-Stage builds.
10. **What is gVisor, and why do we use it for the Agent workloads?**
    *Answer:* Standard Docker (`runc`) shares the host Linux kernel. A kernel exploit from untrusted provider code compromises the whole machine. gVisor (`runsc`) acts as a user-space kernel, intercepting and safely emulating system calls, isolating the payload from the actual host kernel.
11. **Tradeoff Question: What is the security gap in our Agent deployment?**
    *Answer:* To spawn these isolated gVisor containers, our Python agent needs access to the Docker daemon. Because we added our unprivileged `computeshare` user to the `docker` group, it practically possesses root-equivalent privileges (it can mount `/` into a container). True mitigation requires Rootless Docker or a strict socket proxy.

## Observability & Operations
12. **What is the difference between USE and RED metrics?**
    *Answer:* USE (Utilization, Saturation, Errors) measures the hardware (e.g., EC2 CPU, RAM, Disk). RED (Rate, Errors, Duration) measures the application layer. We explicitly wrapped the Express app to expose RED metrics because it tells us what the user is experiencing, not just what the hardware is doing.
13. **Why did we alert on Node Event Loop Lag rather than just CPU usage?**
    *Answer:* Node.js is single-threaded. CPU usage might look fine at 30%, but if the event loop is blocked for >100ms by synchronous bin-packing logic, the backend cannot respond to Socket.io heartbeats. Event loop lag is our truest leading indicator of degradation.
14. **Why do we use CloudWatch for logs instead of Grafana Loki?**
    *Answer:* On an EC2 instance, if the server dies, local container logs die with it. We need off-host aggregation. While Loki is powerful, it is too memory-hungry for our strict 1GB footprint. Docker's native `awslogs` driver ships logs directly to CloudWatch seamlessly using the IAM instance profile, costing zero RAM.
15. **Tradeoff Question: Why use `postgres-exporter` when AWS already gives us RDS metrics?**
    *Answer:* CloudWatch provides infrastructure metrics (CPU, Disk IO). It lacks application-level database metrics. On a tiny `db.t4g.micro`, connection pool exhaustion is highly probable under load. The `postgres-exporter` gives us visibility into `pg_stat_activity` (active connections) for only ~20MB of memory overhead.

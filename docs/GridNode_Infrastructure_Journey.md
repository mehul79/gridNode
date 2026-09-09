# The GridNode Infrastructure Journey: From Code to Cloud

Building a software application is only half the battle. The other half is figuring out where it lives, how it gets updated, how it stays safe from bad actors, and how we know if it's broken. This document explains exactly what we did to the GridNode platform to make it production-ready. 

We will walk through the problems we solved, the jargon we used, and the compromises we had to make along the way.

---

## 1. Introduction: The Problem We Solved

**The Before State:** 
Imagine writing a brilliant recipe (your code) but having no kitchen to cook it in. Historically, engineers would rent a server, manually log in, manually install software, and copy their code over. If the server died, the recipe was lost, and they had to remember exactly how they built the kitchen to do it again. This is known as "click-ops"—clicking around a web console to build things. It is fragile, error-prone, and impossible to track.

**The Solution:**
We introduced **Infrastructure as Code (IaC)**. 
Instead of manually clicking buttons to rent servers, we wrote code that *describes* our ideal kitchen. We hand this code to an automated tool, and the tool builds the kitchen exactly as described. If the kitchen burns down, we just run the code again, and the kitchen is rebuilt in 5 minutes.

### 📖 Jargon Explained
* **Infrastructure as Code (IaC):** Using programming files to automatically build and manage servers, networks, and databases instead of clicking through a web interface.
* **CI/CD (Continuous Integration / Continuous Deployment):** A robot assembly line. When a developer finishes writing code, CI tests it to make sure it isn't broken. CD automatically delivers it to the live server.
* **Provisioning:** The act of officially requesting and creating resources (like a server or a database) from a cloud provider.

---

## 2. The Foundation (AWS & Network)

**What we did:** 
We built a virtual fortress for GridNode on Amazon Web Services (AWS). We divided this fortress into two zones: a "public" lobby and a "private" vault. 
We placed our application server (the Orchestrator) in the public lobby so users could talk to it. We placed our Postgres Database in the private vault, completely disconnected from the public internet.

**Why we did it:** 
If a hacker finds a vulnerability in our application, they might try to steal our data. Because our database is in a private network, it physically cannot be accessed from the outside world. It only accepts traffic from our specific application server. 

### 📖 Jargon Explained
* **AWS (Amazon Web Services):** A massive cloud provider that rents out computers and services by the minute.
* **VPC (Virtual Private Cloud):** Your own private, logically isolated slice of AWS. It's like buying a fenced-off plot of land in the cloud.
* **Subnet:** Dividing your plot of land into zones. A **Public Subnet** has a door to the internet. A **Private Subnet** has no doors to the outside world.
* **EC2 (Elastic Compute Cloud):** Amazon's fancy term for a rented virtual computer (a server). 
* **RDS (Relational Database Service):** Amazon's managed database service. Instead of installing database software on a server ourselves, Amazon handles the backups, updates, and maintenance.
* **IAM (Identity and Access Management):** The bouncer at the door. It is the system that strictly defines who (or what) is allowed to do what inside your AWS account.

---

## 3. The Automation Pipeline (CI/CD)

**What we did:** 
We created a GitHub Actions pipeline. Now, whenever an engineer merges new code, GitHub automatically checks it for errors, packages it up, and securely asks AWS to update the live server. We did this using a highly secure handshake (OIDC) rather than storing long-lived passwords.

**Why we did it:** 
Humans make mistakes; robots don't. Automating deployments means zero downtime and zero manual copying of files. Furthermore, stolen passwords are the #1 way companies get hacked. By using OIDC, GitHub and AWS temporarily trust each other for a few minutes to do the deployment, meaning there are no static passwords for hackers to steal.

### 📖 Jargon Explained
* **GitHub Actions:** A service provided by GitHub that runs scripts (like tests and deployments) automatically when code changes.
* **OIDC (OpenID Connect):** A way for two systems to verify identity without exchanging passwords. Think of it like showing a temporary VIP badge instead of handing over the keys to the building.
* **ECR (Elastic Container Registry):** A secure cloud folder provided by AWS where we store our packaged application code (Docker images).
* **Immutable Tags (SHA):** When we package code, we label it with a unique, unchangeable ID based on the code's exact contents (a SHA digest). If we need to roll back to an old version, we just tell the server to load that exact unchangeable ID. It prevents confusion over what "Version 2" actually means.

---

## 4. Keeping the Lights On (Observability)

**What we did:** 
We installed tools (Prometheus and Grafana) that constantly take the pulse of our application. They measure how many requests are coming in, how long they take to process, and if any are failing. We wired this system to automatically send a message to a Discord/Slack channel if the system starts choking.

**Why we did it:** 
If the application crashes, users will notice before we do. By tracking these metrics, we get alerted the moment things start slowing down, allowing us to fix the problem *before* a total crash happens. 

### 📖 Jargon Explained
* **Prometheus:** A tool that periodically "scrapes" (asks for) health metrics from your application and stores them.
* **Grafana:** A visualization tool that turns Prometheus's raw data numbers into beautiful, readable charts and graphs.
* **Telemetry:** The automatic measurement and transmission of data from remote sources (our server telling us how it feels).
* **RED Metrics:** A philosophy for monitoring applications focusing on **Rate** (how much traffic), **Errors** (how many failed requests), and **Duration** (how long requests take).
* **Event Loop Lag:** Node.js (our backend language) handles tasks in a single queue (the event loop). If a heavy task blocks the queue, everything else waits. "Lag" measures this delay. High lag means the server is struggling to keep up.

---

## 5. Locking Down the Sandbox (Container Security)

**What we did:** 
GridNode allows strangers to run code on volunteer computers. This is incredibly dangerous. We packaged our application into strictly locked-down **Containers**. We stripped out all unnecessary tools, removed administrative ("root") powers, and forced all untrusted code to run inside a high-security vault called **gVisor**.

**Why we did it:** 
If malicious code breaks out of our app, we want it trapped in an empty room. By removing tools and administrative powers, the hacker has nothing to work with. By using gVisor, even if they try to talk directly to the computer's core brain (the kernel), gVisor intercepts and neutralizes the malicious request.

### 📖 Jargon Explained
* **Docker / Containers:** Packaging an application and all its dependencies into a single, standardized box. Unlike a Virtual Machine (which brings its own heavy operating system), a container is lightweight and shares the host's operating system.
* **Multi-stage builds:** A clever way to build a container where you use heavy tools (like compilers) in step 1, but only copy the finished, lightweight product into step 2. The final container is tiny and free of dangerous tools.
* **Root vs. Non-Root:** "Root" is the ultimate admin user on a computer. Running an app as non-root is like giving someone a guest pass instead of the master key.
* **gVisor / Syscall Interception:** The computer's kernel is its core brain. Normally, apps talk directly to it via "system calls". gVisor acts as a secure middleman. If the app tries to do something dangerous to the kernel, gVisor blocks it. 

---

## 6. The Tradeoffs (Real-World Engineering Decisions)

In engineering, there is no such thing as a perfect solution—only tradeoffs. Here are the deliberate compromises we made:

1. **Free-Tier Limits vs. Separation of Concerns:** 
   Ideally, our application, our database, and our monitoring tools would all live on separate servers. Because we strictly limited ourselves to AWS's Free Tier (a 1GB RAM micro-server), we had to cram the application, the job queue (Redis), and the monitoring stack onto one machine. We traded optimal separation for zero financial cost.
   
2. **The GPU Security Gap:** 
   gVisor is incredible at isolating CPU-based jobs. However, it cannot currently pass through physical GPU hardware (NVIDIA graphics cards) safely. Because GridNode requires GPU rendering, we had to allow GPU jobs to bypass gVisor and use standard Docker. 
   **Tradeoff:** We traded strict security for required functionality. CPU jobs are highly secure; GPU jobs carry a residual risk to the host machine.

3. **The Python Agent & The Docker Socket Problem:** 
   We successfully made the local Python Agent run as an unprivileged user. However, for the Agent to spawn Docker containers for jobs, it must be part of the `docker` group. In Linux, being in the `docker` group is practically equivalent to being the Root Admin. 
   **Tradeoff:** We dropped ambient privileges, but a highly sophisticated hacker who compromises the Python Agent could still technically gain host access. Fixing this requires a massive architectural shift to "Rootless Docker," which was out of scope for this phase. We accepted the residual risk but documented it openly.

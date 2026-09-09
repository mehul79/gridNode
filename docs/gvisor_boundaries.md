# GridNode Security Architecture: gVisor Boundaries

## Overview
GridNode allows execution of untrusted third-party code (Machine Learning models, rendering scripts, arbitrary python payloads) on volunteer provider hardware. Standard Docker containers (`runc`) share the host kernel; a kernel exploit in a container compromises the entire provider machine.

To mitigate this, GridNode enforces strict kernel-level isolation using **gVisor (`runsc`)** for all CPU-bound workloads.

## The gVisor Boundary (How it Works)

gVisor provides a user-space kernel (the Sentry) that intercepts application system calls. 

1. **System Call Interception:** When the untrusted payload calls `open()`, `execve()`, or `socket()`, the request does not go to the provider's Linux kernel. It is intercepted by gVisor.
2. **Safe Emulation:** gVisor emulates the Linux kernel surface in memory-safe Go. Only highly restricted, filtered system calls are passed down to the host kernel.
3. **Defense in Depth:** 
   - **`--network none`:** The agent executes the workload without external networking. It cannot reach the internet to exfiltrate data, nor can it probe the provider's local LAN (preventing SSRF and lateral movement).
   - **`--security-opt no-new-privileges`:** Prevents the payload from gaining elevated privileges using `setuid` binaries.
   - **Read-only Mounts:** The dataset and code volumes are mounted read-only. The payload can only write to a designated, ephemeral scratch space.

## Exception: GPU Workloads (`runc`)

gVisor currently lacks robust support for GPU hardware passthrough (NVIDIA CUDA). 
For jobs requiring the `gpuMemoryTier`, the agent automatically falls back to standard `runc` to allow the `--gpus all` flag to function.

**Warning for Providers:** GPU jobs carry inherently higher risk due to the `runc` fallback. Kernel exploits from GPU-bound payloads *could* compromise the host. Providers can opt out of GPU jobs via their provider dashboard to remain strictly inside the gVisor security boundary.

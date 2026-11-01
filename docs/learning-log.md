# Learning Log

## Phase 2: what to learn first

Running commands without knowing what they do teaches nothing, and my autoscaler is built on
these ideas. So I learn each topic below first, then go back to Phase 2 and predict what each
command will do before I run it.

**The big idea:** Kubernetes keeps asking "what should be running?" and "what is running?", and
fixes any difference. Pods need room on nodes. When there's no room, pods wait. My autoscaler
adds a node when pods are waiting, and safely removes a node when it isn't needed.

**Where to learn:**
- [Learn Kubernetes Basics](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
- [K3s Quick-Start Guide](https://docs.k3s.io/quick-start)
- [K3s Architecture](https://docs.k3s.io/architecture)

**How to use this list:** learn the topics in order and tick one only when I can answer its
"Check" question out loud without looking.

### 1. Cluster, node, and K3s
- **What:** a cluster is a group of machines (nodes). The control plane (K3s server, "master")
  makes decisions. Workers (K3s agents) run the apps. K3s is a small Kubernetes. k3d runs K3s
  inside Docker.
- **Why I need it:** my autoscaler adds and removes workers, so I must know what a node does.
- [ ] **Check:** what's the difference between the server and an agent?

### 2. Pod
- **What:** the smallest thing Kubernetes runs: one or more containers together. Pods can be
  destroyed and replaced at any time.
- **Why I need it:** everything in Phase 2 is about where pods run.
- [ ] **Check:** if I delete a pod that belongs to a Deployment, what happens, and why?

### 3. Deployment and ReplicaSet
- **What:** a Deployment says "keep N copies of this pod running". It uses a ReplicaSet to keep
  that count correct.
- **Why I need it:** this is why pods come back on another node after a drain.
- [ ] **Check:** what does `kubectl scale deployment web --replicas=50` actually change?

### 4. Namespace, Service, DaemonSet
- **What:** a Namespace is a folder for resources. A Service gives pods one stable address. A
  DaemonSet runs one pod on every node.
- **Why I need it:** I delete the `demo` namespace to clean up. Drains skip DaemonSet pods, which
  is why the command has `--ignore-daemonsets`.
- [ ] **Check:** why can't a drain move a DaemonSet pod to another node?

### 5. Requests, limits, and the scheduler (the most important topic)
- **What:** a request is the CPU and memory a pod reserves. A limit is the most it may use. The
  scheduler picks a node using **requests, not real usage**. `200m` means 0.2 of a CPU.
- **Why I need it:** this explains Pending pods, and Pending pods are what trigger scale-up.
- [ ] **Check:** why can a node be "full" while its real CPU use is almost 0%?

### 6. Pod phases and why pods stay Pending
- **What:** the phases are Pending, Running, Succeeded and Failed. Pending means the pod isn't
  running yet. The reason is under `Events` in `kubectl describe pod`, such as `Insufficient cpu`.
- **Why I need it:** adding a node only helps if the pod is waiting for room. It doesn't help a
  pod that is just slowly pulling its image.
- [ ] **Check:** what does `Insufficient cpu` mean, and how would a new node fix it?

### 7. Labels, nodeSelector, taints, and tolerations
- **What:** a label is a name tag on a node or pod. A nodeSelector says "only run on nodes with
  this label". A taint keeps pods away from a node. A toleration lets a pod ignore that taint.
- **Why I need it:** the master must stay free of app pods, and Prometheus must stay on the master
  so it's never removed during scale-down.
- [ ] **Check:** what's the difference between a taint and a nodeSelector?

### 8. Cordon and drain
- **What:** cordon means "no new pods here". Drain means cordon, then evict the pods so they move
  to other nodes.
- **Why I need it:** my Lambda must do this before it terminates a worker, or live pods die.
- [ ] **Check:** why isn't cordon enough before removing a node?

### 9. PodDisruptionBudget (PDB)
- **What:** a rule like "keep at least N copies running during voluntary evictions". If an eviction
  would break the rule, Kubernetes refuses it.
- **Why I need it:** this is why a drain can get stuck. My autoscaler needs to handle that safely.
- [ ] **Check:** why would a drain hang when `minAvailable` equals the replica count?

### 10. The Kubernetes API, ServiceAccount, and RBAC
- **What:** `kubectl` is only a client for an HTTP API. A ServiceAccount is an identity for a
  program. RBAC decides what that identity may do. A Role/ClusterRole lists the permissions, and a
  binding gives them to the identity.
- **Why I need it:** my Lambda calls this API directly, with only the permissions it needs.
- [ ] **Check:** why may the autoscaler evict pods but not delete them?

### Which topics each Phase 2 step needs

| Step | What I do | Topics |
|---|---|---|
| 1 | Create the cluster | 1 |
| 2 | Taint and label the master | 7 |
| 3 | Deploy the demo app | 2, 3, 4, 5 |
| 4 | Make pods Pending | 5, 6 |
| 5 | Drain a worker | 3, 4, 8 |
| 6 | See a PDB block a drain | 9 |
| 7 | Talk to the API directly | 10 |
| 8 | Write `autoscaler-rbac.yaml` | 10 |
| 9 | Save commands in `commands.sh` | all |

### Where I stopped
- I'm on Phase 2, step 4. The `learn` cluster is running with the `demo` namespace and `web`
  scaled to 30.
- 30 pods all fit, so nothing went Pending. k3d workers share Docker's CPUs, so I need 50 replicas
  (or 80 if needed) to fill them.
- I use `registry.k8s.io/pause:3.10` instead of the plan's `hpa-example` image.
- In commands, `<one-pending-pod>` is a placeholder. I replace all of it with a real pod name.

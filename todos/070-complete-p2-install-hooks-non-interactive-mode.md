---
status: complete
priority: p2
issue_id: "070"
tags: [code-review, agent-native, install, automation]
dependencies: []
---

## Problem Statement

`install-hooks.sh:34, 42, 48` use interactive `read -rp` prompts. An agent provisioning a new device cannot run install non-interactively. This is now particularly relevant: with the optional-auth feature, the cost of provisioning a new device drops (no token to mint), so automated installs become more attractive.

## Findings

- **Source:** agent-native-reviewer (P2)
- **File:** `install-hooks.sh:34-51`
- **Evidence:** Three blocking `read` calls; no env-var or flag-based override.

## Proposed Solutions

### Option A: Env-var fallthrough — skip prompts when set
```bash
API_URL="${LATTICE_API_URL:-}"
[ -z "$API_URL" ] && read -rp "..." API_URL
# same for token, device label
```
- Pros: Agent sets `LATTICE_API_URL=... ./install-hooks.sh` and skips all prompts
- Cons: Two paths to test
- Effort: Small

### Option B: `--non-interactive` flag with config file
- `./install-hooks.sh --config ~/lattice-install.env`
- Pros: Explicit
- Cons: Extra layer
- Effort: Small/Medium

### Option C: Both
- Effort: Small

## Acceptance Criteria

- [ ] Setting `LATTICE_API_URL` and `LATTICE_DEVICE_LABEL` (and optionally `LATTICE_API_TOKEN`) env vars before running the script skips the corresponding prompts
- [ ] Script still works in fully-interactive mode (no env vars set)
- [ ] README documents the env-var-driven non-interactive mode

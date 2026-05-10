---
status: complete
priority: p2
issue_id: "068"
tags: [code-review, security, install, optional-auth]
dependencies: []
---

## Problem Statement

`install-hooks.sh:35-38` previously enforced `https://` only. This PR relaxes it to accept `http://` (needed for Tailscale URLs that don't terminate TLS). When a user provides a token AND an `http://` URL on a non-trusted-network host, the bearer token is sent in plaintext — sniffable. The script prints no warning.

## Findings

- **Source:** security-sentinel (P3-4), architecture-strategist
- **File:** `install-hooks.sh:35-43`
- **Evidence:** No warning when `http://` is combined with a non-loopback / non-Tailscale URL.

## Proposed Solutions

### Option A: Warn when `http://` + token + non-trusted-network host
```bash
if [[ "$API_URL" == http://* && -n "$API_TOKEN" ]]; then
  echo "WARNING: API token will be sent in plaintext over http://. Use https:// or leave the token blank for trusted-network mode."
  read -rp "  Continue anyway? [y/N]: " CONFIRM
  [[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]] || exit 1
fi
```
- Pros: Catches the dangerous combination
- Cons: Interactive — see #070 for non-interactive concern
- Effort: Small

### Option B: Allow `http://` only when host is loopback / RFC1918 / Tailscale CGNAT
- Parse the host, check against the same trusted-CIDR list
- Pros: Encodes the safe-use case structurally
- Cons: Requires CIDR parsing in bash (or call out to node)
- Effort: Medium

### Option C: Plain warning, no confirmation
- Just print and continue
- Pros: Doesn't break automation
- Cons: Easy to miss
- Effort: Trivial

## Acceptance Criteria

- [ ] `http://lattice.example.com` + token prints a clear warning
- [ ] `http://100.x.x.x` (Tailscale) + token does not warn (trusted)
- [ ] `https://` always proceeds without warning
- [ ] No-token case (auth-disabled) over `http://` is silent (correct use)

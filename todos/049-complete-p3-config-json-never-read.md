---
status: complete
priority: p3
issue_id: "049"
tags: [code-review, quality, dead-code]
---

## Problem Statement

The installer writes both `config.json` and `config.env`. Hooks only source `config.env`. Nothing reads `config.json`. Dead artifact.

## Proposed Solutions

- Remove `config.json` write from `install-hooks.sh:63-70`
- Effort: Trivial | Risk: None

## Acceptance Criteria

- [ ] Installer only writes config.env
- [ ] No references to config.json remain

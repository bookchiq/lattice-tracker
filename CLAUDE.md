# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lattice is a cross-device Claude Code session and project tracker. It consists of three components:

1. **Claude Code hooks** (Bash + Node.js) — emit events from each machine to a central API
2. **Fastify API + SQLite** — runs on a VPS, ingests events, serves query data
3. **Web dashboard** (static SPA) — shows project status, session history, continuity context

Data flows one direction: hooks → VPS API → SQLite. A cron job exports snapshots to a private git repo.

## Repo Structure (Planned)

The full spec is in `docs/plans/lattice-spec.md`. Key directories:

- `hooks/scripts/` — Bash hook scripts installed to `~/.claude/hooks/lattice/` on each machine
- `hooks/scripts/lib/` — shared utilities (emit-event, detect-project, detect-interface)
- `server/src/` — Fastify server: `routes/`, `db/`, `services/`
- `server/dashboard/` — static SPA (vanilla JS or Preact), dark mode default
- `skills/checkpoint/SKILL.md` — checkpoint summary skill for Claude Code
- `commands/` — slash command definitions (`status.md`, `where.md`)

## Tech Stack

- **Server:** Fastify (Node.js), better-sqlite3, served on port 3377
- **Hooks:** Bash scripts, reading JSON from stdin, posting via curl
- **Dashboard:** Vanilla JS or Preact/Alpine.js — intentionally lightweight
- **Auth:** Bearer token (env var `LATTICE_API_TOKEN`)
- **Config:** `~/.config/lattice/config.json` per machine, env vars on VPS

## Key Design Decisions

- **Append-only event log:** All data enters as events via `POST /api/events`. Tables (sessions, git_snapshots, checkpoints) are derived from events.
- **Auto-discovery:** Projects are auto-created on first event. Users enrich later with `display_name` and `client_tag`.
- **Project identity:** Resolved from normalized git remote URL → fallback to path hash → override via `.lattice-project` file.
- **Checkpoint system:** Continuity summaries written by Claude Code itself at meaningful moments (PR created, merge) or manually via `/lattice:checkpoint`. Output goes to `.lattice/last-checkpoint.json`.
- **Hook fast paths:** `post-tool-use.sh` and `stop.sh` fire on every Bash call / every response — they must exit immediately when there's nothing to do.
- **Agent-native parity:** Everything in the dashboard must be queryable via API. Slash commands are just curl + jq compositions.

## API Shape

- `POST /api/events` — single ingestion endpoint for all event types
- `GET /api/projects`, `GET /api/projects/:id`, `PATCH /api/projects/:id`
- `GET /api/sessions`, `GET /api/sessions/:id`, `GET /api/sessions/:id/events`
- `GET /api/snapshots`

## Event Types

`session.start`, `session.end`, `session.heartbeat`, `session.waiting`, `session.checkpoint`, `git.snapshot`, `git.commit`, `git.branch_switch`, `git.pr_created`, `project.tag`

## Status

This repo is currently spec-only. The spec in `docs/plans/lattice-spec.md` is the source of truth for all architecture and implementation decisions.

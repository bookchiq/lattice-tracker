#!/bin/bash
# Lattice Tracker — capture current git state as JSON
# Outputs a JSON object with branch, commit, and uncommitted status
set -o pipefail

# Capture git state — designed to be sourced or called
# Sets LATTICE_GIT_SNAPSHOT_JSON
lattice_capture_git_snapshot() {
  local branch commit_hash commit_message status_output has_changes

  branch="$(git branch --show-current 2>/dev/null)" || branch=""
  commit_hash="$(git rev-parse --short HEAD 2>/dev/null)" || commit_hash=""
  commit_message="$(git log -1 --format=%s 2>/dev/null)" || commit_message=""
  status_output="$(git status --porcelain 2>/dev/null)" || status_output=""

  if [ -n "$status_output" ]; then
    has_changes=1
  else
    has_changes=0
  fi

  # Build JSON in a single jq call
  LATTICE_GIT_SNAPSHOT_JSON="$(jq -n \
    --arg branch "$branch" \
    --arg commit_hash "$commit_hash" \
    --arg commit_message "$commit_message" \
    --argjson has_uncommitted_changes "$has_changes" \
    --arg uncommitted_summary "$status_output" \
    '{
      branch: $branch,
      commit_hash: $commit_hash,
      commit_message: $commit_message,
      has_uncommitted_changes: $has_uncommitted_changes,
      uncommitted_summary: $uncommitted_summary
    }')"
}

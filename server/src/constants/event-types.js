/**
 * Single source of truth for the set of event types Lattice ingests.
 *
 * Adding a new event type? Update this list, then add a matching case in
 * `services/event-processor.js`. The `/api/config` discovery manifest and
 * the test suite both import from here, so they stay in sync automatically.
 */
export const EVENT_TYPES = [
  'session.start',
  'session.end',
  'session.heartbeat',
  'session.waiting',
  'session.checkpoint',
  'git.snapshot',
  'git.commit',
  'git.branch_switch',
  'git.pr_created',
  'project.tag',
  'project.note',
];

export const EVENT_TYPE_SET = new Set(EVENT_TYPES);

// Passive lifecycle: don't bump projects.last_activity_at (heartbeats fire every 3 min).
export const PASSIVE_EVENT_TYPES = new Set([
  'session.heartbeat',
  'session.waiting',
  'session.end',
]);

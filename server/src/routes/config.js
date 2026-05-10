import { createRequire } from 'node:module';
import { EVENT_TYPES } from '../constants/event-types.js';
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

// Public surface map. Keep in sync with route registrations in app.js.
// Agents can curl /api/config once and discover the full HTTP surface
// without grepping source.
const ENDPOINTS = {
  events: '/api/events',
  eventsBatch: '/api/events/batch',
  projects: '/api/projects',
  projectDetail: '/api/projects/:id',
  projectSessions: '/api/projects/:id/sessions',
  projectCheckpoints: '/api/projects/:id/checkpoints',
  projectNotes: '/api/projects/:id/notes',
  sessions: '/api/sessions',
  sessionDetail: '/api/sessions/:id',
  snapshots: '/api/snapshots',
  health: '/api/health',
  config: '/api/config',
};

export default async function configRoutes(fastify) {
  // Public discovery endpoint. Every field is publicly readable; do not expose secrets.
  fastify.get('/config', async () => {
    return {
      authDisabled: fastify.config.authDisabled,
      version,
      eventTypes: EVENT_TYPES,
      endpoints: ENDPOINTS,
      rateLimit: { max: 100, windowSeconds: 60 },
    };
  });
}

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const EVENT_TYPES = [
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

export default async function configRoutes(fastify) {
  // Public discovery endpoint. Every field is publicly readable; do not expose secrets.
  fastify.get('/config', async () => {
    return {
      authDisabled: fastify.config.authDisabled,
      version,
      eventTypes: EVENT_TYPES,
      rateLimit: { max: 100, windowSeconds: 60 },
    };
  });
}

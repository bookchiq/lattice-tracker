import { createQueries } from '../db/queries.js';

export default async function sessionRoutes(fastify) {
  const queries = createQueries(fastify.db);

  // GET /api/sessions
  fastify.get('/sessions', async (request) => {
    const { status, hostname, limit, offset } = request.query;
    return queries.getSessions({
      status,
      hostname,
      limit: parseInt(limit || '50', 10),
      offset: parseInt(offset || '0', 10),
    });
  });

  // GET /api/sessions/:id
  fastify.get('/sessions/:id', async (request, reply) => {
    const session = queries.getSessionById(request.params.id);
    if (!session) {
      reply.code(404);
      return { error: 'Not Found', message: 'Session not found' };
    }

    const events = queries.getEventsBySessionId(session.id, { limit: 100 });
    const snapshots = queries.getSnapshotsByProjectId(session.project_id, { limit: 20 });

    return { ...session, events, snapshots };
  });

  // GET /api/sessions/:id/events
  fastify.get('/sessions/:id/events', async (request) => {
    const limit = parseInt(request.query.limit || '100', 10);
    const offset = parseInt(request.query.offset || '0', 10);
    return queries.getEventsBySessionId(request.params.id, { limit, offset });
  });
}

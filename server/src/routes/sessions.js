function clampInt(val, fallback, max) {
  const n = parseInt(val || String(fallback), 10);
  return Math.min(Math.max(isNaN(n) ? fallback : n, 1), max);
}

function clampOffset(val) {
  const n = parseInt(val || '0', 10);
  return Math.max(isNaN(n) ? 0 : n, 0);
}

export default async function sessionRoutes(fastify) {
  const queries = fastify.queries;

  // GET /api/sessions
  fastify.get('/sessions', async (request) => {
    const { status, hostname } = request.query;
    const limit = clampInt(request.query.limit, 50, 200);
    const offset = clampOffset(request.query.offset);
    const sessions = queries.getSessions({ status, hostname, limit, offset });
    return { data: sessions, limit, offset };
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
    const limit = clampInt(request.query.limit, 100, 200);
    const offset = clampOffset(request.query.offset);
    const events = queries.getEventsBySessionId(request.params.id, { limit, offset });
    return { data: events, limit, offset };
  });
}

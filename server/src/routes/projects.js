function clampInt(val, fallback, max) {
  const n = parseInt(val || String(fallback), 10);
  return Math.min(Math.max(isNaN(n) ? fallback : n, 1), max);
}

function clampOffset(val) {
  const n = parseInt(val || '0', 10);
  return Math.max(isNaN(n) ? 0 : n, 0);
}

export default async function projectRoutes(fastify) {
  const queries = fastify.queries;

  // GET /api/projects
  fastify.get('/projects', async (request) => {
    const { client_tag, status } = request.query;
    const projects = queries.getProjects({ client_tag, status });
    return { data: projects };
  });

  // GET /api/projects/:id
  fastify.get('/projects/:id', async (request, reply) => {
    const project = queries.getProjectById(request.params.id);
    if (!project) {
      reply.code(404);
      return { error: 'Not Found', message: 'Project not found' };
    }

    const latestSession = queries.getSessionsByProjectId(project.id, { limit: 1 })[0] || null;
    const latestSnapshot = queries.getLatestSnapshot(project.id) || null;
    const latestCheckpoint = queries.getLatestCheckpoint(project.id) || null;

    return {
      ...project,
      latest_session: latestSession,
      latest_snapshot: latestSnapshot,
      latest_checkpoint: latestCheckpoint,
    };
  });

  // GET /api/projects/:id/sessions
  fastify.get('/projects/:id/sessions', async (request) => {
    const limit = clampInt(request.query.limit, 20, 200);
    const offset = clampOffset(request.query.offset);
    const sessions = queries.getSessionsByProjectId(request.params.id, { limit, offset });
    return { data: sessions, limit, offset };
  });

  // GET /api/projects/:id/checkpoints
  fastify.get('/projects/:id/checkpoints', async (request) => {
    const limit = clampInt(request.query.limit, 1, 200);
    const offset = clampOffset(request.query.offset);
    const checkpoints = queries.getCheckpointsByProjectId(request.params.id, { limit, offset });
    return { data: checkpoints, limit, offset };
  });

  // PATCH /api/projects/:id
  fastify.patch('/projects/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          display_name: { type: 'string', maxLength: 255 },
          client_tag: { type: 'string', maxLength: 255 },
        },
      },
    },
  }, async (request, reply) => {
    const result = queries.updateProject(request.params.id, request.body);
    if (!result) {
      reply.code(404);
      return { error: 'Not Found', message: 'Project not found' };
    }
    return { ok: true };
  });
}

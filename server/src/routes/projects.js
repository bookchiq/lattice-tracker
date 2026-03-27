import { createQueries } from '../db/queries.js';

export default async function projectRoutes(fastify) {
  const queries = createQueries(fastify.db);

  // GET /api/projects
  fastify.get('/projects', async (request) => {
    const { client_tag } = request.query;
    return queries.getProjects({ client_tag });
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
    const limit = parseInt(request.query.limit || '20', 10);
    const offset = parseInt(request.query.offset || '0', 10);
    return queries.getSessionsByProjectId(request.params.id, { limit, offset });
  });

  // GET /api/projects/:id/checkpoints
  fastify.get('/projects/:id/checkpoints', async (request) => {
    const limit = parseInt(request.query.limit || '1', 10);
    const offset = parseInt(request.query.offset || '0', 10);
    return queries.getCheckpointsByProjectId(request.params.id, { limit, offset });
  });

  // PATCH /api/projects/:id
  fastify.patch('/projects/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          display_name: { type: 'string' },
          client_tag: { type: 'string' },
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

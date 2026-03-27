import { clampInt, clampOffset } from '../utils/pagination.js';

export default async function snapshotRoutes(fastify) {
  const queries = fastify.queries;

  // GET /api/snapshots
  fastify.get('/snapshots', async (request) => {
    const { project_id, trigger } = request.query;
    const limit = clampInt(request.query.limit, 50, 200);
    const offset = clampOffset(request.query.offset);
    const snapshots = queries.getSnapshots({ project_id, trigger, limit, offset });
    return { data: snapshots, limit, offset };
  });
}

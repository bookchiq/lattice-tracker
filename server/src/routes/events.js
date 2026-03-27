import { createQueries } from '../db/queries.js';
import { createEventProcessor } from '../services/event-processor.js';

const eventSchema = {
  type: 'object',
  required: ['event_type', 'timestamp'],
  properties: {
    event_type: { type: 'string' },
    client_event_id: { type: 'string' },
    session_id: { type: 'string' },
    project_id: { type: 'string' },
    hostname: { type: 'string' },
    timestamp: { type: 'string' },
    payload: { oneOf: [{ type: 'object' }, { type: 'string', maxLength: 65536 }] },
  },
};

export default async function eventRoutes(fastify) {
  const queries = createQueries(fastify.db);
  const processEvent = createEventProcessor(queries);
  const processInTransaction = fastify.db.transaction(processEvent);

  // POST /api/events — single event
  fastify.post('/events', {
    schema: {
      body: eventSchema,
    },
    bodyLimit: 1048576, // 1MB
  }, async (request, reply) => {
    const result = processInTransaction(request.body);
    reply.code(201);
    return { ok: true, event_id: Number(result.lastInsertRowid) };
  });

  // POST /api/events/batch — multiple events in one transaction
  fastify.post('/events/batch', {
    schema: {
      body: {
        type: 'array',
        items: eventSchema,
        maxItems: 50,
      },
    },
    bodyLimit: 5242880, // 5MB
  }, async (request, reply) => {
    const events = request.body;
    const processBatch = fastify.db.transaction((evts) => {
      return evts.map((evt) => {
        const result = processEvent(evt);
        return Number(result.lastInsertRowid);
      });
    });

    const eventIds = processBatch(events);
    reply.code(201);
    return { ok: true, event_ids: eventIds };
  });
}

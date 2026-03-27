import { createEventProcessor } from '../services/event-processor.js';

const eventSchema = {
  type: 'object',
  required: ['event_type', 'timestamp'],
  properties: {
    event_type: { type: 'string', maxLength: 100 },
    client_event_id: { type: 'string', maxLength: 255 },
    session_id: { type: 'string', maxLength: 255 },
    project_id: { type: 'string', maxLength: 500 },
    hostname: { type: 'string', maxLength: 255 },
    timestamp: { type: 'string', maxLength: 30 },
    payload: { oneOf: [{ type: 'object' }, { type: 'string', maxLength: 65536 }] },
  },
};

export default async function eventRoutes(fastify) {
  const processEvent = createEventProcessor(fastify.queries);
  const processInTransaction = fastify.db.transaction(processEvent);

  const processBatch = fastify.db.transaction((evts) => {
    return evts.map((evt) => {
      const result = processEvent(evt);
      return {
        event_id: Number(result.lastInsertRowid),
        status: result.duplicate ? 'duplicate' : 'created',
      };
    });
  });

  // POST /api/events — single event
  fastify.post('/events', {
    schema: { body: eventSchema },
    bodyLimit: 1048576, // 1MB
  }, async (request, reply) => {
    const result = processInTransaction(request.body);

    if (result.duplicate) {
      reply.code(409);
      return { ok: false, error: 'duplicate_event', event_id: Number(result.lastInsertRowid) };
    }

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
    const results = processBatch(request.body);
    reply.code(201);
    return { ok: true, results };
  });
}

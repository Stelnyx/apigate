import Fastify from "fastify";

const fastify = Fastify({ logger: true });

fastify.get("/health", async () => ({ ok: true }));

fastify.post("/orders", async (request, reply) => {
  return reply.code(201).send({ id: "1" });
});

fastify.delete<{ Params: { id: string } }>("/orders/:id", async (request) => {
  return { deleted: request.params.id };
});

await fastify.listen({ port: 3000 });

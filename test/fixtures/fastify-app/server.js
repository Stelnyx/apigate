const fastify = require("fastify")();

async function verifyJWT(req, reply) { /* ... */ }

fastify.get("/ping", (req, reply) => reply.send({ pong: true }));

fastify.route({
  method: "POST",
  url: "/items",
  preHandler: [verifyJWT],
  handler: (req, reply) => reply.send({})
});

fastify.delete("/items/:id", { preHandler: verifyJWT }, (req, reply) => reply.send({}));

module.exports = fastify;

// Two factory functions each declare their own `router`. The use() in
// adminRoutes must not leak into publicRoutes.
const express = require("express");
const { requireAuth } = require("./auth.js");

function adminRoutes() {
  const router = express.Router();
  router.use(requireAuth);
  router.get("/a", (req, res) => res.end());                 // -> GUARDED
  return router;
}

function publicRoutes() {
  const router = express.Router();
  router.post("/signup", (req, res) => res.end());           // -> OPEN
  return router;
}

module.exports = { adminRoutes, publicRoutes };

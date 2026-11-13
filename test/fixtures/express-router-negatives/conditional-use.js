// A use() that may not run must not guard later routes.
const express = require("express");
const { requireAuth } = require("./auth.js");

const r2 = express.Router();
if (process.env.AUTH_ENABLED) r2.use(requireAuth);
r2.delete("/wipe", (req, res) => res.end());                 // -> OPEN

const router = express.Router();
function protect() {
  router.use(requireAuth);
}
router.post("/open", (req, res) => res.end());               // -> OPEN (registered before protect())
protect();

module.exports = { r2, router };

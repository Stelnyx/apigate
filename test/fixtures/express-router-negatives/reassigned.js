// A router variable reassigned to a new Router() is a different router.
const { Router } = require("express");
const { requireAuth } = require("./auth.js");

let r = Router();
r.use(requireAuth);
r.get("/a", (req, res) => res.end());
module.exports.first = r;
r = Router();
r.post("/b", (req, res) => res.end());                       // -> OPEN
module.exports.second = r;

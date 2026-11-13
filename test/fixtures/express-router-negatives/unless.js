// jwt(...).unless(...) skips some paths, so it does not guard the router.
const express = require("express");
const jwt = require("express-jwt");

const secret = "fixture-only";
const app = express();
app.use(jwt({ secret }).unless({ path: ["/webhook"] }));
app.post("/webhook", (req, res) => res.end());               // -> OPEN

const api = express.Router();
api.use(jwt({ secret }));
api.post("/guarded", (req, res) => res.end());               // -> GUARDED (control)

module.exports = { app, api };

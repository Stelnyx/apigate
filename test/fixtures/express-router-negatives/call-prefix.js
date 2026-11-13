// X.use(<call>, mw): the call may return a path, so this is not router-wide.
const express = require("express");
const { requireAuth } = require("./auth.js");

const prefixFor = (name) => "/" + name;
const app = express();
app.use(prefixFor("admin"), requireAuth);
app.post("/public", (req, res) => res.end());                // -> OPEN

module.exports = app;

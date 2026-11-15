const express = require("express");
const app = express();
const r = express.Router();
r.use("/x", require("./leaf"));
app.use("/api", r);
module.exports = { app, r };

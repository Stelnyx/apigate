const express = require("express");
const r2 = express.Router();
r2.get("/z", (q, s) => s.end());
module.exports = r2;

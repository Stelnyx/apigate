// Path-less use() of body parsers, imported routers and error handlers is
// not auth: the write route after them stays OPEN.
const express = require("express");
const importedRouter = require("./other-routes.js");
const { errorHandler } = require("./errors.js");

const app = express();
app.use(express.json());
app.use(importedRouter);
app.use(errorHandler);
app.post("/items", (req, res) => res.end());                 // -> OPEN

module.exports = app;

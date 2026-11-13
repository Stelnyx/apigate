// `(app) => {}` parameters in two functions are not one app.
const express = require("express");
const { requireAuth } = require("./auth.js");

module.exports.mountAdmin = (app) => {
  app.use(requireAuth);
  app.get("/a", (req, res) => res.end());
};

module.exports.mountPublic = (app) => {
  app.post("/signup", (req, res) => res.end());              // -> OPEN
};

module.exports.express = express;

const { Router } = require("express");

module.exports = function build() {
  const r = Router();
  r.get("/old", (req, res) => res.end());
  return r;
};

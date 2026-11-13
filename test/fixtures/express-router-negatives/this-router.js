// `this.router` in two classes is not one router.
const express = require("express");
const { requireAuth } = require("./auth.js");

class AdminController {
  constructor() {
    this.router = express.Router();
    this.router.use(requireAuth);
    this.router.get("/a", (req, res) => res.end());
  }
}

class PublicController {
  constructor() {
    this.router = express.Router();
    this.router.post("/signup", (req, res) => res.end());    // -> OPEN
  }
}

module.exports = { AdminController, PublicController };

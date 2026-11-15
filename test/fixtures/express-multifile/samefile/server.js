const express = require("express");
const app = express();
const router = express.Router();
router.get("/u", (q, s) => s.end());
app.use("/api", router);
module.exports = { app, router };

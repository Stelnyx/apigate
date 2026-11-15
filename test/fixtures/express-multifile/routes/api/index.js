const express = require("express");
const { itemsRouter } = require("./items");

const router = express.Router();

router.use("/items", itemsRouter);
router.get("/ping", (req, res) => res.end("pong"));

module.exports = router;

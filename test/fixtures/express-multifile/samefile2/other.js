const express = require("express");
const { router } = require("./server");
const main = express();
main.use("/x", router);

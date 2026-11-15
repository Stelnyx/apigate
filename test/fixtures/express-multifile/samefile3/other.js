const express = require("express");
const { r } = require("./server");
const main = express();
main.use("/c", r);

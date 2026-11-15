const express = require("express");
const main = express();
const sub = express();
const r = express.Router();
r.use("/x", require("./leaf"));
sub.use("/r", r);
main.use("/v", sub);
main.listen(3000);

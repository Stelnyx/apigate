const express = require("express");
const app = express();
const r0 = express.Router();
const r = express.Router();
r.get("/own", (q, s) => s.end());
r.use("/x", require("./leaf"));
r0.use("/r", r);
app.use("/api", r0);
app.listen(3000);

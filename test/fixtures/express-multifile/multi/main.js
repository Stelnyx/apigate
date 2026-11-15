import express from "express";
import { sharedRouter as shared } from "./shared.js";
import * as named from "./named.js";

const app = express();

app.use("/a", shared);
app.use("/b", shared);
app.use("/ns", named.nsRouter);
app.use("/inline", require("./inline.js"));

export default app;

import express from "express";
import usersRouter from "./routes/users.js";
import adminRouter from "./routes/admin";
import apiRouter from "./routes/api";
import legacy from "./routes/legacy";
import dynRouter from "./routes/dyn.js";
import ghost from "@/routes/ghost";
import { requireAuth } from "./auth.js";

const app = express();

app.use("/api/users", usersRouter);
app.use("/admin", requireAuth, adminRouter);
app.use("/v1", apiRouter);
app.use("/legacy", legacy);
app.use(process.env.DYN, dynRouter);
app.use("/ghost", ghost);

export default app;

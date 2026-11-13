// Source order of path-less `X.use(mw)` and per-method middleware in
// `route()` chains. CommonJS on purpose (require alias + destructured Router).
const { Router } = require("express");
const createApp = require("express");
const { requireAuth } = require("./auth.js");

const server2 = createApp();
const adminRouter = Router();
const panel = Router();

adminRouter.get("/early", (req, res) => res.end());          // before use -> OPEN
adminRouter.route("/reports")
  .get(requireAuth, (req, res) => res.end())                 // per-method mw -> GUARDED
  .post((req, res) => res.end());                            // -> OPEN
adminRouter.use(requireAuth);                                // router-level auth
adminRouter.get("/late", (req, res) => res.end());           // after use -> GUARDED
server2.use("/admin", adminRouter);

panel.get("/ping", (req, res) => res.end());                 // other router, no auth -> OPEN
server2.use("/panel", panel);

// A dynamic mount path followed by auth must NOT guard the whole app.
const prefix = process.env.PREFIX || "/scoped";
server2.use(prefix, requireAuth);
server2.get("/after-dynamic", (req, res) => res.end());      // -> OPEN

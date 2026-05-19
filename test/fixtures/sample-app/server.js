// Mixed Express fixture — exercises mounts, prefixes, write methods, auth markers.
const express = require("express");
const app = express();
const usersRouter = express.Router();
const billingRouter = express.Router();

function requireAuth(req, res, next) { next(); }
function ensureAuthenticated(req, res, next) { next(); }

app.get("/health", (req, res) => res.json({ ok: true }));

usersRouter.get("/:id", requireAuth, (req, res) => res.json({}));
usersRouter.post("/", requireAuth, (req, res) => res.json({}));
usersRouter.delete("/:id", requireAuth, (req, res) => res.json({}));

billingRouter.post("/charge", (req, res) => res.json({})); // OPEN write — should fail
billingRouter.get("/invoice/:id", ensureAuthenticated, (req, res) => res.json({}));

app.use("/users", usersRouter);
app.use("/billing", billingRouter);

const dynamicPrefix = process.env.MOUNT || "/x";
const otherRouter = express.Router();
otherRouter.get("/secret", (req, res) => res.json({}));
app.use(dynamicPrefix, otherRouter); // mount path unresolved — endpoint flagged

module.exports = app;

// Regression fixture for issue #7: the reproduction, verbatim.
// Expected: DELETE /admin/wipe GUARDED, GET /internal/stats OPEN,
//           GET /items OPEN, POST /items OPEN.
import express from "express";
import { requireAuth } from "./auth.js";
const app = express();
const admin = express.Router();           // any name that is not app/router/*Router
const adminRouter = express.Router();
adminRouter.use(requireAuth);             // router-level auth, no path
adminRouter.delete("/wipe", (req, res) => res.end());
admin.get("/stats", (req, res) => res.end());
app.use("/admin", adminRouter);
app.use("/internal", admin);
app.route("/items").get((req, res) => res.end()).post((req, res) => res.end());

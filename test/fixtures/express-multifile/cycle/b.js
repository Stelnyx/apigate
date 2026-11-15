import { Router } from "express";
import { aRouter } from "./a.js";

export const bRouter = Router();

bRouter.use("/a", aRouter);
bRouter.get("/y", (req, res) => res.end());

import { Router } from "express";
import { bRouter } from "./b.js";

export const aRouter = Router();

aRouter.use("/b", bRouter);
aRouter.get("/x", (req, res) => res.end());

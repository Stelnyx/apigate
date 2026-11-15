import { Router } from "express";

export const sharedRouter = Router();

sharedRouter.get("/ping", (req, res) => res.end());

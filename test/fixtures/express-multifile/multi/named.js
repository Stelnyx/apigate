import { Router } from "express";

const nsRouter = Router();

nsRouter.get("/n", (req, res) => res.end());

export { nsRouter };

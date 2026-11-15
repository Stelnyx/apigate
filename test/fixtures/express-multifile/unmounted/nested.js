const { Router } = require("express");
const router = Router();
const sub = Router();
sub.get("/x", (req, res) => res.json({}));
router.use("/sub", sub);
router.get("/top", (req, res) => res.json({}));
module.exports = router;

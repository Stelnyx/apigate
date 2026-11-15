const router = require("express").Router();

router.delete("/wipe", (req, res) => res.end());

module.exports = router;

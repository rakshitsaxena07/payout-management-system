const express = require("express");
const {
  markPayoutFailed,
  RecoveryError,
} = require("../services/payoutRecoveryService");
const payoutRepo = require("../repositories/payoutRepository");

const router = express.Router();

router.get("/payouts/:id", (req, res) => {
  const txn = payoutRepo.getTransaction(req.params.id);
  if (!txn) return res.status(404).json({ error: "Transaction not found" });
  res.json(txn);
});

router.post("/payouts/:id/status", (req, res) => {
  const { status } = req.body;
  try {
    res.json(markPayoutFailed(req.params.id, status));
  } catch (err) {
    if (err instanceof RecoveryError) {
      const codeToHttp = {
        NOT_FOUND: 404,
        INVALID_STATUS: 400,
        NOT_RECOVERABLE: 400,
        ALREADY_RESOLVED: 409,
        CONFLICT: 409,
      };
      return res
        .status(codeToHttp[err.code] || 400)
        .json({ error: err.message, code: err.code });
    }
    throw err;
  }
});

module.exports = router;

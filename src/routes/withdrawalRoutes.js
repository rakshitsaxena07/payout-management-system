const express = require("express");
const {
  initiateWithdrawal,
  WithdrawalError,
} = require("../services/withdrawalService");

const router = express.Router();

router.post("/withdrawals", (req, res) => {
  const { userId, amount } = req.body;
  if (!userId || typeof amount !== "number") {
    return res
      .status(400)
      .json({ error: "userId and numeric amount are required" });
  }
  try {
    res.status(201).json(initiateWithdrawal(userId, amount));
  } catch (err) {
    if (err instanceof WithdrawalError) {
      const codeToHttp = {
        NOT_FOUND: 404,
        INVALID_AMOUNT: 400,
        COOLDOWN_ACTIVE: 429,
        INSUFFICIENT_FUNDS: 422,
      };
      return res
        .status(codeToHttp[err.code] || 400)
        .json({ error: err.message, code: err.code });
    }
    throw err;
  }
});

module.exports = router;

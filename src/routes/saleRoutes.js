const express = require("express");
const saleRepo = require("../repositories/saleRepository");
const userRepo = require("../repositories/userRepository");
const { runAdvancePayoutJob } = require("../services/advancePayoutService");
const {
  reconcileSale,
  ReconciliationError,
} = require("../services/reconciliationService");

const router = express.Router();

router.post("/sales", (req, res) => {
  const { userId, brand, earning } = req.body;
  if (!userId || !brand || typeof earning !== "number" || earning < 0) {
    return res
      .status(400)
      .json({
        error: "userId, brand, and non-negative numeric earning are required",
      });
  }
  if (!userRepo.getUser(userId)) {
    return res.status(404).json({ error: `User ${userId} not found` });
  }
  res.status(201).json(saleRepo.createSale({ userId, brand, earning }));
});

router.get("/sales/:id", (req, res) => {
  const sale = saleRepo.getSale(req.params.id);
  if (!sale) return res.status(404).json({ error: "Sale not found" });
  res.json(sale);
});

router.post("/jobs/advance-payout", (req, res) => {
  res.json(runAdvancePayoutJob());
});

router.post("/sales/:id/reconcile", (req, res) => {
  const { status } = req.body;
  try {
    const result = reconcileSale(req.params.id, status);
    res.json(result);
  } catch (err) {
    if (err instanceof ReconciliationError) {
      const codeToHttp = {
        NOT_FOUND: 404,
        INVALID_STATUS: 400,
        ALREADY_RECONCILED: 409,
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

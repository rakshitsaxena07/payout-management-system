const db = require("../db/db");
const saleRepo = require("../repositories/saleRepository");
const payoutRepo = require("../repositories/payoutRepository");
const balanceRepo = require("../repositories/balanceRepository");

class ReconciliationError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function reconcileSale(saleId, newStatus) {
  if (!["approved", "rejected"].includes(newStatus)) {
    throw new ReconciliationError(
      `Invalid reconciliation status "${newStatus}" — must be approved or rejected`,
      "INVALID_STATUS",
    );
  }

  const sale = saleRepo.getSale(saleId);
  if (!sale) throw new ReconciliationError("Sale not found", "NOT_FOUND");
  if (sale.status !== "pending") {
    throw new ReconciliationError(
      `Sale ${saleId} is already reconciled as "${sale.status}"`,
      "ALREADY_RECONCILED",
    );
  }

  const adjustment =
    newStatus === "approved"
      ? sale.earning - sale.advance_amount
      : -sale.advance_amount;

  const tx = db.transaction(() => {
    const won = saleRepo.reconcile(saleId, newStatus);
    if (!won)
      throw new ReconciliationError(
        "Concurrent reconciliation conflict",
        "CONFLICT",
      );

    const txn = payoutRepo.insertTransaction({
      userId: sale.user_id,
      saleId: sale.id,
      type: "FINAL_ADJUSTMENT",
      amount: adjustment,
      status: "SUCCESS",
      idempotencyKey: `final:${sale.id}`,
    });

    const balance = balanceRepo.adjustBalance(sale.user_id, adjustment);
    return { sale: saleRepo.getSale(saleId), transaction: txn, balance };
  });

  return tx();
}

module.exports = { reconcileSale, ReconciliationError };

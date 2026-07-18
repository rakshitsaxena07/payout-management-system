const db = require("../db/db");
const saleRepo = require("../repositories/saleRepository");
const payoutRepo = require("../repositories/payoutRepository");

const ADVANCE_RATE = 0.1;

function runAdvancePayoutJob() {
  const candidates = saleRepo.listPendingUnadvanced();
  const results = [];

  for (const sale of candidates) {
    const advanceAmount = Math.round(sale.earning * ADVANCE_RATE);

    const tx = db.transaction(() => {
      const won = saleRepo.markAdvancePaid(sale.id, advanceAmount);
      if (!won) return null;
      return payoutRepo.insertTransaction({
        userId: sale.user_id,
        saleId: sale.id,
        type: "ADVANCE",
        amount: advanceAmount,
        status: "SUCCESS",
        idempotencyKey: `advance:${sale.id}`,
      });
    });

    const txn = tx();
    if (txn) results.push(txn);
  }

  return { advanced: results.length, transactions: results };
}

module.exports = { runAdvancePayoutJob, ADVANCE_RATE };

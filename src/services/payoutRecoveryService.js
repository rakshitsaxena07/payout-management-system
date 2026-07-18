const db = require("../db/db");
const payoutRepo = require("../repositories/payoutRepository");
const balanceRepo = require("../repositories/balanceRepository");

const TERMINAL_FAILURE_STATUSES = ["CANCELLED", "REJECTED", "FAILED"];

class RecoveryError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function markPayoutFailed(transactionId, newStatus) {
  if (!TERMINAL_FAILURE_STATUSES.includes(newStatus)) {
    throw new RecoveryError(
      `Invalid status "${newStatus}" — must be one of ${TERMINAL_FAILURE_STATUSES.join(", ")}`,
      "INVALID_STATUS",
    );
  }

  const txn = payoutRepo.getTransaction(transactionId);
  if (!txn) throw new RecoveryError("Transaction not found", "NOT_FOUND");

  if (!["ADVANCE", "WITHDRAWAL"].includes(txn.type)) {
    throw new RecoveryError(
      `Transactions of type ${txn.type} are not eligible for failure recovery`,
      "NOT_RECOVERABLE",
    );
  }

  if (
    ["SUCCESS", ...TERMINAL_FAILURE_STATUSES].includes(txn.status) &&
    txn.type === "WITHDRAWAL"
  ) {
    if (txn.status !== "INITIATED") {
      throw new RecoveryError(
        `Transaction already resolved as "${txn.status}"`,
        "ALREADY_RESOLVED",
      );
    }
  }
  if (txn.type === "ADVANCE" && txn.status !== "SUCCESS") {
    throw new RecoveryError(
      `Transaction already resolved as "${txn.status}"`,
      "ALREADY_RESOLVED",
    );
  }

  const result = db.transaction(() => {
    const won = payoutRepo.updateStatus(transactionId, newStatus);
    if (!won) throw new RecoveryError("Concurrent update conflict", "CONFLICT");

    const balance = balanceRepo.adjustBalance(txn.user_id, txn.amount);

    if (txn.type === "WITHDRAWAL") {
      balanceRepo.setLastWithdrawalAt(txn.user_id, null);
    }

    return { transaction: payoutRepo.getTransaction(transactionId), balance };
  })();

  return result;
}

module.exports = { markPayoutFailed, RecoveryError };

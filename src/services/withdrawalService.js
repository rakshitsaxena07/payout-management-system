const db = require("../db/db");
const balanceRepo = require("../repositories/balanceRepository");
const payoutRepo = require("../repositories/payoutRepository");

const WITHDRAWAL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

class WithdrawalError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function initiateWithdrawal(userId, amount) {
  if (amount <= 0)
    throw new WithdrawalError(
      "Withdrawal amount must be positive",
      "INVALID_AMOUNT",
    );

  const balance = balanceRepo.getBalance(userId);
  if (!balance) throw new WithdrawalError("User not found", "NOT_FOUND");

  if (balance.last_withdrawal_at) {
    const elapsed = Date.now() - new Date(balance.last_withdrawal_at).getTime();
    if (elapsed < WITHDRAWAL_COOLDOWN_MS) {
      const hoursLeft = ((WITHDRAWAL_COOLDOWN_MS - elapsed) / 3600000).toFixed(
        1,
      );
      throw new WithdrawalError(
        `Only one withdrawal allowed per 24h. Try again in ${hoursLeft}h`,
        "COOLDOWN_ACTIVE",
      );
    }
  }

  if (balance.withdrawable_balance < amount) {
    throw new WithdrawalError(
      "Insufficient withdrawable balance",
      "INSUFFICIENT_FUNDS",
    );
  }

  const tx = db.transaction(() => {
    balanceRepo.adjustBalance(userId, -amount);
    balanceRepo.setLastWithdrawalAt(userId, new Date().toISOString());
    return payoutRepo.insertTransaction({
      userId,
      type: "WITHDRAWAL",
      amount,
      status: "INITIATED",
    });
  });

  return tx();
}

module.exports = {
  initiateWithdrawal,
  WithdrawalError,
  WITHDRAWAL_COOLDOWN_MS,
};

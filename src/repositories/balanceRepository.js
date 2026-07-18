const db = require("../db/db");

function getBalance(userId) {
  return db
    .prepare("SELECT * FROM user_balances WHERE user_id = ?")
    .get(userId);
}

function adjustBalance(userId, delta) {
  db.prepare(
    `UPDATE user_balances
     SET withdrawable_balance = withdrawable_balance + ?,
         updated_at = datetime('now')
     WHERE user_id = ?`,
  ).run(delta, userId);
  return getBalance(userId);
}

function setLastWithdrawalAt(userId, isoTimestampOrNull) {
  db.prepare(
    `UPDATE user_balances SET last_withdrawal_at = ?, updated_at = datetime('now') WHERE user_id = ?`,
  ).run(isoTimestampOrNull, userId);
}

module.exports = { getBalance, adjustBalance, setLastWithdrawalAt };

const { randomUUID } = require("crypto");
const db = require("../db/db");

function insertTransaction({
  userId,
  saleId = null,
  type,
  amount,
  status = "SUCCESS",
  idempotencyKey = null,
}) {
  const id = randomUUID();
  try {
    db.prepare(
      `INSERT INTO payout_transactions (id, user_id, sale_id, type, amount, status, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, userId, saleId, type, amount, status, idempotencyKey);
  } catch (err) {
    if (String(err.message).includes("UNIQUE constraint failed")) {
      return null;
    }
    throw err;
  }
  return getTransaction(id);
}

function getTransaction(id) {
  return db.prepare("SELECT * FROM payout_transactions WHERE id = ?").get(id);
}

function listForUser(userId) {
  return db
    .prepare(
      "SELECT * FROM payout_transactions WHERE user_id = ? ORDER BY created_at",
    )
    .all(userId);
}

function updateStatus(id, newStatus) {
  const result = db
    .prepare(
      `UPDATE payout_transactions
       SET status = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(newStatus, id);
  return result.changes === 1;
}

module.exports = {
  insertTransaction,
  getTransaction,
  listForUser,
  updateStatus,
};

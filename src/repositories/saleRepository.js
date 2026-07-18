const { randomUUID } = require("crypto");
const db = require("../db/db");

function createSale({ userId, brand, earning }) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO sales (id, user_id, brand, earning, status)
     VALUES (?, ?, ?, ?, 'pending')`,
  ).run(id, userId, brand, earning);
  return getSale(id);
}

function getSale(id) {
  return db.prepare("SELECT * FROM sales WHERE id = ?").get(id);
}

function listSalesForUser(userId) {
  return db
    .prepare("SELECT * FROM sales WHERE user_id = ? ORDER BY created_at")
    .all(userId);
}

function listPendingUnadvanced() {
  return db
    .prepare(
      `SELECT * FROM sales WHERE status = 'pending' AND advance_paid = 0`,
    )
    .all();
}

function markAdvancePaid(saleId, advanceAmount) {
  const result = db
    .prepare(
      `UPDATE sales
       SET advance_paid = 1, advance_amount = ?
       WHERE id = ? AND status = 'pending' AND advance_paid = 0`,
    )
    .run(advanceAmount, saleId);
  return result.changes === 1;
}

function reconcile(saleId, newStatus) {
  const result = db
    .prepare(
      `UPDATE sales
       SET status = ?, reconciled_at = datetime('now')
       WHERE id = ? AND status = 'pending'`,
    )
    .run(newStatus, saleId);
  return result.changes === 1;
}

module.exports = {
  createSale,
  getSale,
  listSalesForUser,
  listPendingUnadvanced,
  markAdvancePaid,
  reconcile,
};

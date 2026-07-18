const { randomUUID } = require("crypto");
const db = require("../db/db");

function createUser(name) {
  const id = randomUUID();
  const insertUser = db.prepare("INSERT INTO users (id, name) VALUES (?, ?)");
  const insertBalance = db.prepare(
    "INSERT INTO user_balances (user_id, withdrawable_balance) VALUES (?, 0)",
  );

  const tx = db.transaction(() => {
    insertUser.run(id, name);
    insertBalance.run(id);
  });
  tx();

  return getUser(id);
}

function getUser(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function listUsers() {
  return db.prepare("SELECT * FROM users").all();
}

module.exports = { createUser, getUser, listUsers };

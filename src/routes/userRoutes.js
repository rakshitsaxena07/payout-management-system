const express = require("express");
const userRepo = require("../repositories/userRepository");
const balanceRepo = require("../repositories/balanceRepository");
const payoutRepo = require("../repositories/payoutRepository");
const saleRepo = require("../repositories/saleRepository");

const router = express.Router();

router.post("/users", (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  res.status(201).json(userRepo.createUser(name));
});

router.get("/users/:id", (req, res) => {
  const user = userRepo.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

router.get("/users/:id/balance", (req, res) => {
  const balance = balanceRepo.getBalance(req.params.id);
  if (!balance) return res.status(404).json({ error: "User not found" });
  res.json(balance);
});

router.get("/users/:id/transactions", (req, res) => {
  res.json(payoutRepo.listForUser(req.params.id));
});

router.get("/users/:id/sales", (req, res) => {
  res.json(saleRepo.listSalesForUser(req.params.id));
});

module.exports = router;

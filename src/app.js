const express = require("express");

const userRoutes = require("./routes/userRoutes");
const saleRoutes = require("./routes/saleRoutes");
const withdrawalRoutes = require("./routes/withdrawalRoutes");
const payoutRoutes = require("./routes/payoutRoutes");

const app = express();
app.use(express.json());

app.use(userRoutes);
app.use(saleRoutes);
app.use(withdrawalRoutes);
app.use(payoutRoutes);

app.get("/health", (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;

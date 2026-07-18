const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Use a throwaway DB file per test run so tests never touch data.sqlite.
const TEST_DB = path.join(__dirname, 'test.sqlite');
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
process.env.DB_PATH = TEST_DB;

const userRepo = require('../src/repositories/userRepository');
const saleRepo = require('../src/repositories/saleRepository');
const balanceRepo = require('../src/repositories/balanceRepository');
const payoutRepo = require('../src/repositories/payoutRepository');
const { runAdvancePayoutJob } = require('../src/services/advancePayoutService');
const { reconcileSale, ReconciliationError } = require('../src/services/reconciliationService');
const { initiateWithdrawal, WithdrawalError } = require('../src/services/withdrawalService');
const { markPayoutFailed } = require('../src/services/payoutRecoveryService');

test('PDF worked example: 3x pending ₹40 sales -> ₹68 final payout', () => {
  const user = userRepo.createUser('john_doe');
  const sales = [
    saleRepo.createSale({ userId: user.id, brand: 'brand_1', earning: 40 }),
    saleRepo.createSale({ userId: user.id, brand: 'brand_1', earning: 40 }),
    saleRepo.createSale({ userId: user.id, brand: 'brand_1', earning: 40 }),
  ];

  const advanceResult = runAdvancePayoutJob();
  assert.equal(advanceResult.advanced, 3);
  sales.forEach((s) => {
    const refreshed = saleRepo.getSale(s.id);
    assert.equal(refreshed.advance_amount, 4); // 10% of 40
  });

  reconcileSale(sales[0].id, 'rejected'); // -4
  reconcileSale(sales[1].id, 'approved'); // 40 - 4 = 36
  reconcileSale(sales[2].id, 'approved'); // 40 - 4 = 36

  const balance = balanceRepo.getBalance(user.id);
  assert.equal(balance.withdrawable_balance, 68); // -4 + 36 + 36
});

test('advance payout job is idempotent across repeated runs', () => {
  const user = userRepo.createUser('idempotency_user');
  const sale = saleRepo.createSale({ userId: user.id, brand: 'brand_1', earning: 100 });

  const first = runAdvancePayoutJob();
  const second = runAdvancePayoutJob();
  const third = runAdvancePayoutJob();

  const txns = payoutRepo.listForUser(user.id).filter((t) => t.type === 'ADVANCE');
  assert.equal(txns.length, 1, 'sale must be advanced exactly once no matter how many job runs');
  assert.equal(saleRepo.getSale(sale.id).advance_amount, 10);
});

test('cannot reconcile the same sale twice', () => {
  const user = userRepo.createUser('double_reconcile_user');
  const sale = saleRepo.createSale({ userId: user.id, brand: 'brand_1', earning: 50 });
  runAdvancePayoutJob();

  reconcileSale(sale.id, 'approved');
  assert.throws(() => reconcileSale(sale.id, 'rejected'), (err) => err instanceof ReconciliationError && err.code === 'ALREADY_RECONCILED');
});

test('withdrawal is blocked within 24h cooldown, allowed after', () => {
  const user = userRepo.createUser('withdrawal_user');
  const sale = saleRepo.createSale({ userId: user.id, brand: 'brand_1', earning: 200 });
  runAdvancePayoutJob();
  reconcileSale(sale.id, 'approved'); // balance = 200 - 20 = 180

  const w1 = initiateWithdrawal(user.id, 50);
  assert.equal(w1.status, 'INITIATED');

  assert.throws(
    () => initiateWithdrawal(user.id, 10),
    (err) => err instanceof WithdrawalError && err.code === 'COOLDOWN_ACTIVE'
  );

  // Simulate 24h passing.
  balanceRepo.setLastWithdrawalAt(user.id, new Date(Date.now() - 25 * 3600 * 1000).toISOString());
  const w2 = initiateWithdrawal(user.id, 10);
  assert.equal(w2.status, 'INITIATED');
});

test('withdrawal fails on insufficient balance', () => {
  const user = userRepo.createUser('poor_user');
  assert.throws(
    () => initiateWithdrawal(user.id, 100),
    (err) => err instanceof WithdrawalError && err.code === 'INSUFFICIENT_FUNDS'
  );
});

test('failed payout recovery credits balance back and lifts withdrawal cooldown', () => {
  const user = userRepo.createUser('recovery_user');
  const sale = saleRepo.createSale({ userId: user.id, brand: 'brand_1', earning: 300 });
  runAdvancePayoutJob();
  reconcileSale(sale.id, 'approved'); // balance = 300 - 30 = 270

  const withdrawal = initiateWithdrawal(user.id, 100); // balance -> 170, cooldown starts
  assert.equal(balanceRepo.getBalance(user.id).withdrawable_balance, 170);

  markPayoutFailed(withdrawal.id, 'FAILED');

  const balance = balanceRepo.getBalance(user.id);
  assert.equal(balance.withdrawable_balance, 270, 'failed withdrawal amount must be credited back');
  assert.equal(balance.last_withdrawal_at, null, 'cooldown should be lifted after a failed withdrawal');

  // User can now immediately withdraw again despite the earlier attempt.
  const retry = initiateWithdrawal(user.id, 100);
  assert.equal(retry.status, 'INITIATED');
});

test('rejected sale with no prior advance produces a zero-clawback adjustment', () => {
  const user = userRepo.createUser('no_advance_user');
  // Sale reconciled WITHOUT the advance job ever running on it.
  const sale = saleRepo.createSale({ userId: user.id, brand: 'brand_1', earning: 75 });
  reconcileSale(sale.id, 'rejected'); // advance_amount defaults to 0 -> adjustment = 0

  const balance = balanceRepo.getBalance(user.id);
  assert.equal(balance.withdrawable_balance, 0);
});

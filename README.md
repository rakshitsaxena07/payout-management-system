# User Payout Management System
 
This is a backend system for handling affiliate payouts. Every sale starts
as "pending". As soon as it comes in, the user gets an advance payout of
10% of the earnings. Later, an admin reviews the sale and marks it
approved or rejected, and the system settles the final payout based on
what was already advanced.
 
Built with Node.js, Express, and SQLite.
 
---
 
## How it works
 
1. A sale gets created with status `pending`.
2. A job runs (can be triggered manually or on a schedule) that gives a
   10% advance on every pending sale that hasn't been advanced yet.
3. An admin reconciles the sale, marking it `approved` or `rejected`.
   - If approved, the user gets `earning - advance already paid`.
   - If rejected, the advance gets clawed back (a negative adjustment).
4. The user can withdraw their balance, but only once every 24 hours.
5. If a payout fails somewhere along the way (bank issue, gateway
   timeout, whatever), the money goes back into their balance so they
   can try withdrawing again.
---
 
## Database
 
Four tables:
 
- **users** — just id and name.
- **sales** — one row per sale, tracks status, earning, and whether it's
  already been advanced.
- **payout_transactions** — every single payout event (advance, final
  adjustment, withdrawal) gets logged here as its own row. Nothing gets
  overwritten, only added to.
- **user_balances** — the running total of what a user can withdraw
  right now.
```
┌──────────────┐        ┌──────────────────┐
│    users     │1      1│  user_balances    │
│──────────────│◄───────│───────────────────│
│ id (PK)      │        │ user_id (PK/FK)   │
│ name         │        │ withdrawable_bal  │
│ created_at   │        │ last_withdrawal_at│
└──────┬───────┘        └───────────────────┘
       │1
       │
       │N
┌──────▼───────┐        ┌────────────────────────┐
│    sales     │1      N│  payout_transactions    │
│──────────────│◄───────│─────────────────────────│
│ id (PK)      │        │ id (PK)                 │
│ user_id (FK) │        │ user_id (FK)             │
│ brand        │        │ sale_id (FK, nullable)   │
│ earning      │        │ type (advance /          │
│ status       │        │   final adjustment /     │
│ advance_paid │        │   withdrawal)             │
│ advance_amt  │        │ amount (signed)          │
│ reconciled_at│        │ status                   │
└──────────────┘        └──────────────────────────┘
```
 
I kept a transaction log instead of just updating one balance number
directly, because if something ever looks off, you can trace exactly
where every rupee came from instead of just seeing a final total and
guessing.
 
---
 
## Folder structure
 
```
payout-system/
├── server.js              starts the app
├── src/
│   ├── app.js               wires the app together
│   ├── db/                  schema + database connection
│   ├── repositories/        talks to the database (plain queries)
│   ├── services/            the actual business logic
│   └── routes/               handles the HTTP requests
└── tests/
    └── scenario.test.js     tests, including the exact example from the assignment
```
 
The idea is simple: routes handle HTTP stuff, services hold the rules
(like "10% advance" or "24 hour cooldown"), and repositories just talk to
the database. Nothing crosses over — the routes don't know how the math
works, and the database layer doesn't know why it's updating something.
Makes it easier to change one part without breaking another.
 
---
 
## A few decisions worth explaining
 
**Making sure the advance payout only happens once per sale.**
The tricky part here isn't the 10% math, it's making sure a sale never
gets advanced twice even if the job accidentally runs multiple times.
Instead of checking "has this been advanced?" and then updating it
(which leaves a small window where two things could sneak through at
once), the update itself carries the condition:
 
```sql
UPDATE sales SET advance_paid = 1, advance_amount = ?
WHERE id = ? AND advance_paid = 0
```
 
If the sale was already advanced, this update just does nothing — zero
rows change, and the code knows to skip it. Simple, but it closes the
race condition completely.
 
**Advance payouts aren't counted in the withdrawable balance.**
An advance is treated as money that's already gone out to the user
directly, not something sitting in their account waiting to be
withdrawn. That keeps the final payout math clean — `earning - advance`
just works without double-counting anything. It also means advances
aren't affected by the 24-hour withdrawal rule, since they're not
something the user is requesting, they're automatic.
 
**A rejected sale can make the balance go negative.**
If someone's advance was bigger than what they end up owed, their
balance can dip below zero. That's fine — it just means they can't
withdraw anything until later approvals bring it back up. This is
roughly how real affiliate payout systems handle clawbacks too.
 
**Once a sale is reconciled, it's locked.**
A sale can only be reconciled while it's still pending. Once it's
approved or rejected, it can't be flipped again. This also protects
against accidentally reconciling the same sale twice if a request gets
sent more than once.
 
**Withdrawals happen in two steps.**
When someone withdraws, the money is taken out of their balance right
away and the transaction is marked `INITIATED` — not `SUCCESS` yet.
That's because in real life, the money still has to actually reach the
bank. If it fails, there's a separate endpoint that marks it failed,
which puts the money back and also resets their 24-hour cooldown, since
it wasn't their fault the transfer didn't go through.
 
**All money is stored as whole numbers.**
No decimals anywhere in the money fields, to avoid floating point
rounding issues. Rounding only happens once, when the 10% advance
amount is calculated.
 
---
 
## API
 
| Method | Endpoint | What it does |
|---|---|---|
| POST | `/users` | create a user |
| GET | `/users/:id/balance` | check withdrawable balance |
| GET | `/users/:id/transactions` | full payout history for a user |
| POST | `/sales` | create a sale |
| POST | `/jobs/advance-payout` | run the advance payout job |
| POST | `/sales/:id/reconcile` | mark a sale approved/rejected |
| POST | `/withdrawals` | request a withdrawal |
| POST | `/payouts/:id/status` | mark a payout failed/cancelled/rejected |
 
---
 
## Edge cases it handles
 
- Running the advance payout job more than once doesn't double-pay anyone
- Reconciling the same sale twice gets rejected
- A rejected sale that never got an advance just settles to zero, no errors
- Withdrawing before 24 hours have passed gets blocked
- Withdrawing more than the balance gets blocked
- Creating a sale for a user that doesn't exist gets rejected cleanly
- A failed payout gets credited back and the user can retry right away
---
 
## What I left out 
 
- No login/auth — in a real system, the admin-only endpoints (reconcile,
  the advance job, marking payouts failed) would need that
- No real payment gateway — payouts are just marked as done in the
  database, not actually sent anywhere
- No pagination on the list endpoints
- Assumes one currency throughout
---
 
## Running it
 
```bash
npm install
npm start       # runs on localhost:3000
npm test        # runs the test suite
```
 
The tests cover the exact example from the assignment — three ₹40 sales,
one rejected and two approved, landing on a final payout of ₹68 — along
with the idempotency, cooldown, and failure-recovery cases.
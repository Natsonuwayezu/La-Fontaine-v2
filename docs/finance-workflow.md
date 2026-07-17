# Finance Workflow

**Status: not yet built.** Every file in `js/modules/finance/` is still an empty placeholder (see `tests/router-tests.js`'s `KNOWN_PENDING_MODULES` list for the exact current set). This doc describes the *intended* workflow, based on the nav structure already registered in `config/navigation.js` and the calculation logic already written in `core/finance-formulas.js` — both of which are real, tested, and ready to be built against. `database-schema.md` has the table shapes these formulas expect.

## Intended pages (already registered in navigation.js, not yet wired to any file)

| Nav id | Purpose |
|---|---|
| `finance-dashboard` | Collection rates and recent payments |
| `fee-structure` | Fee categories and amounts per class/year |
| `record-payment` | FIFO auto-allocation, instant receipt |
| `payment-history` | Filter by student, class, date, method |
| `receipts` | Print, reprint, export |
| `fee-waivers` | Waivers/discounts with reason and audit trail |
| `payment-reversals` | Reverse a payment with balance recalculation |
| `finance-audit` | Audit trail for all transactions |
| `family-fee-summary` | Fee summary grouped by family |

A few more finance-related files exist as empty placeholders without a nav entry yet: `fee-assignments.js`, `fee-term-status.js`, `credit-balances.js`, `balances.js`, `student-fees.js`, `student-statements.js`, `manual-adjustments.js`, `discounts.js`, `carry-forward.js`, `financial-reports.js` — likely sub-views or supporting logic for the pages above, following the same data-layer/render-page split pattern used in `settings/` and `staff/` (see `architecture.md`).

## The calculation layer (already built and unit-tested — `core/finance-formulas.js`)

This is the most valuable head start for building the UI: the math is done and covered by `tests/finance-tests.js`.

- **`computeFeeBalance(fee)`** — for one `student_fees` row: `effective = amount - waived_amount`, `remaining = effective - paid_amount`, `isFullyPaid`.
- **`computeStudentFeeSummary(fees[], creditBalance)`** — aggregates every fee row for a student into `{ total, waived, effective, paid, balance, outstanding, isFullyPaid, hasCredit }`. `outstanding` is `balance` minus any credit applied — this is the number to show as "what they still owe right now."
- **`computeWaiver(amount, type, value)`** — `type` is `'full'` (zeroes the fee), `'percentage'` (clamped to 100%), or `'partial'` (clamped to the fee amount) — returns `{ waivedAmount, effectiveAmount }`.
- **`applyCreditBalance(creditAmount, fees[])`** — FIFO allocation of a credit balance against a student's owed fees, oldest fee first (by `created_at`). Returns which fees are fully covered, which one is partially covered, and how much credit is left over.
- **`computeCollectionStats(fees[])`** — aggregate collection-rate numbers, meant for `finance-dashboard`.

`core/api.js` already has `allocatePaymentFIFO()` — the DB-write counterpart that actually creates `payment_allocations` rows — see `database-schema.md`.

## Suggested build order

1. **`fee-structure.js`** — needs to exist before anything else can assign fees to students. Follow the `settings/class-management.js` pattern (self-contained CRUD page, no data-layer split needed for something this size).
2. **`record-payment.js`** — the highest-value page; wraps `allocatePaymentFIFO()` + `applyCreditBalance()`. Look at `students/enroll-student.js` for the established pattern of a real API-writing form (validation → `insert`/`update` → `refreshTable` → `logAction` → `showToast`).
3. **`finance-dashboard.js`** — once payments exist, wire `computeCollectionStats()` up to real charts (see `js/ui/charts.js` for the established charting helpers used elsewhere).
4. **`payment-history.js`**, **`receipts.js`**, **`fee-waivers.js`**, **`payment-reversals.js`**, **`finance-audit.js`**, **`family-fee-summary.js`** — in roughly that order, since each builds on data the previous ones create.

## Don't forget

- Follow the `MODULE_FILE_MAP` conventions in `core/router.js` — add an entry (single path, or an array if you split into a data-layer + page file) for each new nav id, and double-check the render function name matches `moduleIdToRenderFn(navId)`'s mechanical conversion (see `architecture.md` — this exact mistake broke the `grading-scale` page once already).
- Grep for any name you're about to declare at the top level of a new file against the rest of `js/` first — see `troubleshooting.md`'s `SyntaxError: Identifier already declared` section.
- Every write should go through `core/validators.js`-style validation, `core/api.js`'s `insert`/`update`/`refreshTable`, and `core/logger.js`'s `logAction()` for the audit trail — matching the pattern already established in every built module.

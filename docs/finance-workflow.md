# École La Fontaine v9.0 — Finance Workflow

---

## Fee Structure

### Fee categories (`fee_categories` table)
Each fee has a name, type, and `default_amount`. The `is_core` flag marks
categories used by second-sitting logic. Configured in Settings → Fee Structure.

### Fee amounts (`fee_amounts` table)
Per-year and per-class amounts that override the default. Allows different fees
for different classes or years.

---

## Fee Assignment

Fees are assigned to individual students in three ways:

### 1. Manual assignment (fee-assignments module)
Admin or accountant selects student, fee category, amount, term, due date.
Inserts to `student_fees` with `academic_year_id`, `term_id`, `amount`,
`fee_category_id`, `due_date`, `notes`.

### 2. Enrollment assignment (enroll-student.js)
During enrollment wizard step 4, fees from the catalog are selected.
If entered amount < configured amount: `waived_amount = difference` (discount).
All enrollment fees: `requires_approval = true`, `source = 'enrollment'`.
Fees that are paid in full at enrollment: `is_approved = true` immediately.
Others: go to fee-approvals queue.

### 3. Holiday enrollment assignment (holidays-enrollment.js / holidays-fees.js)
During holiday enrollment, configured session fees are assigned.
All holiday fees: written to `holiday_fees` (NOT `student_fees`).
Tagged with `holiday_session_id`. Fee config stored in `holiday_sessions.fee_config` (JSON).
Auto-Assign button assigns configured fee to all enrolled students who don't have one.

---

## Fee Approval Workflow

All fees created during enrollment require approval before they appear in
finance reports as confirmed income.

```
Enrollment creates fee
        │
        ▼
fee_approvals module lists it
        │
   ┌────┴────┐
   │         │
Already    Not yet
paid?      paid?
   │         │
   ▼         ▼
Auto-     Admin/accountant
approved  reviews manually
   │         │
   │    ┌────┴────┐
   │    │         │
   │  Approve   Reject
   │    │         │
   │    ▼         ▼
   └──► is_approved=true  Fee row deleted
        fee_approval_log  fee_approval_log
        entry             entry with reason
```

`fee_approval_log` records every approval and rejection with:
`student_fee_id`, `action` (approved/rejected/auto_approved), `acted_by`, `acted_at`, `note`.

---

## Payment Recording

1. Accountant opens Finance → Record Payment.
2. Searches for student by name or code.
3. System shows outstanding fees (approved only — `is_approved = true`).
4. Enters amount, payment method, reference number, notes.
5. System saves to `payments` table:
   `student_id`, `amount`, `payment_date`, `payment_method`, `receipt_number`,
   `recorded_by`, `recorded_by_name`, `academic_year_id`, `term_id`, `notes`.
6. Creates `payment_allocations` row: links payment to specific fee.
7. Updates `student_fees.paid_amount` and `is_paid`.
8. If holiday fee: updates `holiday_fees.paid_amount`, `is_paid`, `is_approved = true`
   (paying automatically removes from approval queue).
9. Logs action via `logAction()`.
10. Receipt number auto-generated (format: `RCT-YYYYMM-XXXX`).

### Partial payments
If payment amount < outstanding balance: `paid_amount` is updated to the partial amount.
`is_paid` remains false. Remaining balance shown on next payment attempt.

### Payment methods
Cash, Bank Transfer, Mobile Money (MTN/Airtel), Cheque.

---

## Receipts

Receipts are generated for every recorded payment.
Standard A4 format and 58mm/80mm thermal format available.
QR code on each receipt links to a frozen snapshot for verification.

---

## Fee Waivers

Admin or accountant grants a waiver with a required reason.
Waiver reduces `student_fees.waived_amount`. Net amount = `amount - waived_amount`.
All waivers logged in `system_logs` via `logAction()`.

---

## Carry-Forward

At the start of a new term, unpaid balances from the previous term can be
carried forward to the new term's fee list via Finance → Carry Forward.
Creates new `student_fees` rows in the new term referencing the same `fee_category_id`.

---

## Credit Balances

If a student overpays: `credit_balances` table stores the surplus.
Credit can be applied to future fees via Finance → Credit Balances.

---

## Family Discounts

Families with multiple enrolled children receive sibling discounts.
Discount rules stored in `discount_rules` table (percentage by number of siblings).
`auto_apply_family_discounts()` DB function applies discounts automatically.
Applied as `waived_amount` on `student_fees`.

---

## Holiday Fees (separate system)

Holiday fees are completely separate from academic fees:

| Aspect | Academic fees | Holiday fees |
|---|---|---|
| Table | `student_fees` | `holiday_fees` |
| Tagged with | `academic_year_id`, `term_id` | `holiday_session_id`, `academic_year_id` |
| Fee config | `fee_categories` + `fee_amounts` | `holiday_sessions.fee_config` (JSON) |
| Approval | `fee_approval_log` | `fee_approval_log` |
| Free option | Amount = 0 | Amount = 0 in config |

Holiday fees shown in Finance → Holiday Fees module only.
They do not appear in the main Finance Dashboard totals.

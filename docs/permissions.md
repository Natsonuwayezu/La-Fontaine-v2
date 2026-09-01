# École La Fontaine v9.0 — Permissions Matrix

Role definitions: `admin`, `teacher`, `accountant`.
Class teacher access: teachers only see their own class (classes.class_teacher_id).

---

## Module Access by Role

| Module | Admin | Teacher | Accountant |
|---|:---:|:---:|:---:|
| **Dashboards** | | | |
| admin-dashboard | ✅ | | |
| teacher-dashboard | ✅ | ✅ | |
| accountant-dashboard | ✅ | | ✅ |
| **Attendance** | | | |
| attendance-entry | ✅ | ✅ (own class) | |
| attendance-reports | ✅ | ✅ (own class) | |
| attendance-summary | ✅ | ✅ (own class) | |
| attendance-analytics | ✅ | | |
| **Students** | | | |
| student-list | ✅ | ✅ (read) | ✅ (read) |
| enroll-student | ✅ | | |
| student-details | ✅ | | |
| student-profile | ✅ | ✅ (own class) | ✅ |
| family-management | ✅ | | ✅ |
| sibling-linking | ✅ | | |
| student-archive | ✅ | | |
| student-promotion | ✅ | ✅ (own class) | |
| **Academics** | | | |
| marks-entry | ✅ | ✅ (own class) | |
| marks-database | ✅ | ✅ (own class) | |
| marks-analysis | ✅ | ✅ (own class) | |
| marks-import-export | ✅ | ✅ (own class) | |
| assessments | ✅ | ✅ (own class) | |
| assessment-locking | ✅ | | |
| second-sitting | ✅ | ✅ (own class) | |
| class-register | ✅ | ✅ (own class) | |
| annual-register | ✅ | ✅ (own class) | |
| register-export | ✅ | ✅ (own class) | |
| report-cards | ✅ | ✅ (own class) | |
| rankings | ✅ | ✅ (own class) | |
| statistics | ✅ | ✅ (own class) | |
| academic-reports | ✅ | ✅ (own class) | |
| **Holidays** | | | |
| holidays-enrollment | ✅ | | |
| holidays-marks | ✅ | ✅ (own class) | |
| holidays-reports | ✅ | ✅ (own class) | |
| holidays-rankings | ✅ | ✅ (own class) | |
| holidays-fees | ✅ | | ✅ |
| **Finance** | | | |
| finance-dashboard | ✅ | | ✅ |
| fee-structure | ✅ | | ✅ |
| fee-assignments | ✅ | | ✅ |
| fee-term-status | ✅ | | ✅ |
| record-payment | ✅ | | ✅ |
| payment-history | ✅ | | ✅ |
| receipts | ✅ | | ✅ |
| overdue-payments | ✅ | | ✅ |
| fee-waivers | ✅ | | ✅ |
| fee-approvals | ✅ | | ✅ |
| credit-balances | ✅ | | ✅ |
| balances | ✅ | | ✅ |
| student-fees | ✅ | | ✅ |
| student-statements | ✅ | | ✅ |
| family-fee-summary | ✅ | | ✅ |
| payment-reversals | ✅ | | |
| manual-adjustments | ✅ | | |
| discounts | ✅ | | ✅ |
| carry-forward | ✅ | | ✅ |
| finance-audit | ✅ | | ✅ |
| financial-reports | ✅ | | ✅ |
| **Staff & Timetable** | | | |
| teachers | ✅ | ✅ (read) | |
| subjects | ✅ | ✅ (read) | |
| teacher-assignments | ✅ | | |
| teacher-performance | ✅ | | |
| class-timetable | ✅ | ✅ | |
| teacher-timetable | ✅ | ✅ (own) | |
| staff-timetable | ✅ | ✅ (read) | |
| timetable-generator | ✅ | | |
| timetable-conflicts | ✅ | | |
| timetable-import | ✅ | | |
| user-management | ✅ | | |
| **Communication** | | | |
| announcements | ✅ | ✅ (read) | ✅ (read) |
| announcement-center | ✅ | ✅ | ✅ |
| notifications | ✅ | ✅ | ✅ |
| notification-center | ✅ | ✅ | ✅ |
| reminders | ✅ | ✅ (read) | ✅ (read) |
| **Analytics** | | | |
| analytics | ✅ | | |
| analytics-settings | ✅ | | |
| system-health | ✅ | | |
| **Settings** | | | |
| settings | ✅ | | |
| school-settings | ✅ | | |
| academic-years | ✅ | | |
| academic-calendar | ✅ | | |
| grading-scale | ✅ | | |
| grading-settings | ✅ | | |
| holidays | ✅ | | |
| backup-restore | ✅ | | |
| system-logs | ✅ | | |
| api-settings | ✅ | | |
| users | ✅ | | |
| **Bulk Operations** | | | |
| bulk-import | ✅ | | |
| bulk-export | ✅ | | ✅ |
| bulk-student-actions | ✅ | | |
| bulk-finance-actions | ✅ | | ✅ |
| **Help** | | | |
| help-center | ✅ | ✅ | ✅ |
| faq | ✅ | ✅ | ✅ |
| support | ✅ | ✅ | ✅ |

---

## Database RLS Policies

| Policy type | Tables |
|---|---|
| Admin full access | All 43 tables |
| Teacher read own class | marks, assessments, class_enrollments, attendance |
| Teacher write own class | marks (own assessments), attendance (own class) |
| Accountant read | students, student_fees, payments, payment_allocations, fee_categories, fee_amounts, families |
| Accountant write | payments, payment_allocations, student_fees, fee_waivers |
| No hard delete | marks, payments, system_logs, verifications, snapshots |

---

## Holiday Mode — Additional Restrictions

In holiday mode, teachers access holiday equivalents of their normal modules,
but still restricted to their assigned class:

| Normal module | Holiday equivalent | Teacher access |
|---|---|---|
| marks-entry | holidays-marks | Own class only |
| class-register | holidays-marks (register tab) | Own class only |
| report-cards | holidays-reports | Own class only |
| rankings | holidays-rankings | Own class only |
| assessments | holidays-enrollment | Admin only |
| fee-structure | holidays-fees | Accountant only |

Finance modules (holidays-fees, fee-approvals) — admin and accountant only in both modes.

---

## Class Teacher Assignment

A teacher is identified as class teacher by:
- `classes.class_teacher_id` = teacher's `id` in the `teachers` table.
- This FK controls all class-level access restrictions.
- A teacher with no class assigned sees their modules but with no class data.
- Admin overrides all restrictions — sees all classes always.

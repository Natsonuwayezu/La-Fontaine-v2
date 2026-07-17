# Database Schema

Supabase/Postgres tables this app reads or writes, reverse-engineered from `core/api.js`, `core/validators.js`, `core/state.js`, `core/logger.js`, and `config/constants.js`'s `BACKUP_ALL_TABLES` list (the authoritative full table list — anything in this app's backup/restore feature must appear there). There is no SQL migration file in this repo to cross-check against, so treat column lists below as **as-observed from the code that reads/writes them**, not a guaranteed-complete spec.

## Core / settings

**`school_settings`** — key/value pairs (`{ key, value }`), read via `getSchoolSettings()`/`getSchoolSetting(key, fallback)`, written via `updateSchoolSetting(key, value)`. Known keys in use: `school_name`, `school_motto`, `head_teacher_name`, `contact_phone`, `contact_email`, `address`, `school_logo`, `pass_mark`.

**`academic_years`** — `id, year_name, start_date, end_date, is_active`

**`terms`** — `id, academic_year_id, term_number, start_date, end_date, midterm_date, status` (status is one of `TERM_STATUSES` in `constants.js`)

**`holidays`** — `id, name, type, start_date, end_date, academic_year_id` (type is one of `HOLIDAY_TYPES`)

**`grading_scale`** — `id, grade, min, max, desc, color, sort_order` — falls back to `DEFAULT_GRADES` in `constants.js` when empty

**`system_logs`** — `id, action, entity_type, entity_id, performed_by, performed_by_name, role, details, level, holiday_mode, created_at` — written by `logAction()` in `core/logger.js`, read by `settings/system-logs.js`

## Staff / classes

**`teachers`** — `id, first_name, last_name, role, username, email, phone, password, is_active`. Despite the name, **every** staff account (admin, accountant, teacher) lives in this one table, distinguished by `role` — see `core/state.js`'s own comment on `state.teachers`.

**`classes`** — `id, code, name, level, sort_order, class_teacher_id` — falls back to `CLASS_LIST` in `constants.js` when empty

**`subjects`** — `id, code, name, level, mg_max, ex_max, appears_only_post_midterm, sort_order` — falls back to `NURSERY_SUBJECTS`/`PRIMARY_SUBJECTS` in `constants.js` when empty

**`teacher_assignments`** — `id, teacher_id, class_id, subject_id` — the simple "who teaches where" summary used by `staff/teacher-assignments.js`'s matrix view. Not in `core/api.js`'s `REFRESH_MAP` yet; loaded directly by that page instead.

**`timetable_slots`** — `id, class_id, subject_id, teacher_id, day_of_week, period_number, room` — the full weekly grid, built manually (no auto-scheduler) via `staff/timetable.js`, validated for teacher/class double-booking by `core/validators.js`'s `validateTimetableSlot()`.

## Students / families

**`students`** — id + name fields + `class_id`, `student_code`, guardian info (used in `students/enroll-student.js`; exact full column list not confirmed beyond what's referenced there).

**`families`** — sibling/guardian grouping used for family fee discounts; loaded via `getAll('families', ...)`, ordered by `id` descending for the "next family code" logic in `api.js`.

## Academics

**`assessments`** — `id, class_id, subject_id, term_id, created_by, ...` — `created_by` is the teacher id, used by `calcCompletionRate()` in `core/academic-formulas.js` to compute per-teacher completion rate.

**`marks`** — `id, assessment_id, student_id, score, ...` — `score` is the raw mark; `null`/`undefined` means "not yet entered" (see `validateMarkValue()` in `core/validators.js`).

## Finance (tables exist and are backed up; the UI module itself is not yet built — see `finance-workflow.md`)

**`fee_categories`**, **`fee_amounts`** — fee structure/amount configuration (loaded into `state.feeCategories`/`state.feeAmounts`).

**`student_fees`** — `id, student_id, amount, paid_amount, is_paid, is_waived, waived_amount, created_at, updated_at` — one row per fee charge assigned to a student. `core/finance-formulas.js`'s `computeFeeBalance()`/`computeStudentFeeSummary()` operate on rows of this shape.

**`payments`** — payment records (referenced by `payment_allocations.payment_id`; full column list not confirmed).

**`payment_allocations`** — `id, payment_id, student_fee_id, amount, created_at` — FIFO-allocated portions of a payment against specific `student_fees` rows, written by `allocatePaymentFIFO()` in `core/api.js`.

**`student_credit_balance`** — `id, student_id, credit_amount, updated_at` — leftover payment amount after all owed fees are covered, applied FIFO to future fees by `core/finance-formulas.js`'s `applyCreditBalance()`.

**`fee_waivers`** — waiver records (full/percentage/partial — see `computeWaiver()` in `finance-formulas.js` for the calculation logic, though the waiver-management UI itself isn't built yet).

## Communication

**`notifications`**, **`announcements`** — used by `js/modules/communication/*` (all already built).

## Promotion

**`student_promotions`**, **`student_promotion_records`** — end-of-year promotion decisions, driven by `getPromotionDecision()` in `core/formulas.js`.

## Holiday-mode tables (separate schema, always backed up together)

**`holiday_marks`**, **`holiday_fees`**, **`holiday_enrollments`**, **`holiday_subjects`** — support a parallel holiday-programme mode (`isHolidayMode()` in `core/state.js` toggles behavior across the app). The UI modules for these (`js/modules/holidays/holidays-marks.js`, `holidays-fees.js`) are not yet built.

## Where to look for more detail

- `core/api.js`'s `REFRESH_MAP` — the definitive list of which tables get reloaded into `state.X` after a write, and under what key.
- `core/validators.js` — has a dedicated `validate*Form()` function for most of these tables' write paths (e.g. `validateTeacherForm`, `validateAcademicYearForm`, `validateHolidayForm`, `validateTimetableSlot`), which is the most reliable source for exact expected field names on writes.
- `config/constants.js`'s `BACKUP_ALL_TABLES` — the full authoritative table list.

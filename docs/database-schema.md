# École La Fontaine v9.0 — Database Schema

All 46 application tables. Supabase system tables (auth.*, storage.*) are excluded.
Migrations 001-009 have been applied.

---

## Academic

### `academic_years`
Tracks school years. Each year has 3 terms.

**Columns:**
```
id (bigint NOT NULL, name (character varying, is_active (boolean, start_date (date, end_date (date, created_at (timestamp with time zone, updated_at (timestamp with time zone, is_locked (boolean, locked_at (timestamp with time zone, locked_by (integer
```

### `terms`
Term periods within an academic year. term_number 1/2/3. status: upcoming/active/completed.

**Columns:**
```
id (integer NOT NULL, academic_year_id (integer, name (character varying, start_date (date, end_date (date, midterm_date (date, is_locked (boolean, created_at (timestamp without time zone, updated_at (timestamp without time zone, term_number (integer, is_active (boolean DEFAULT false
```

### `classes`
School classes. class_teacher_id FK to teachers. sort_order determines promotion path.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('classes_id_seq'::regclass), name (character varying NOT NULL, code (character varying, level (character varying NOT NULL, sort_order (integer, capacity (integer, is_active (boolean, created_at (timestamp with time zone, updated_at (timestamp with time zone, class_teacher_id (bigint, academic_year_id (integer NOT NULL
```

### `subjects`
Subjects taught. is_core: true = eligible for second sitting and annual report.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('subjects_id_seq'::regclass), name (character varying, code (character varying, level (character varying, mg_max (integer, ex_max (integer, appears_only_post_midterm (boolean, sort_order (integer, is_active (boolean, created_at (timestamp with time zone, updated_at (timestamp with time zone, academic_year_id (integer
```

### `teacher_assignments`
Teacher assigned to class+subject per academic year.

**Columns:**
```
id (bigint NOT NULL, teacher_id (bigint, class_id (bigint, subject_id (bigint, academic_year_id (bigint, created_at (timestamp with time zone
```

### `timetable_slots`
Weekly timetable entries: class, subject, teacher, day, period, room.

**Columns:**
```
id (integer NOT NULL, day (text NOT NULL, time_slot (text NOT NULL, class_id (bigint NOT NULL, subject_id (bigint NOT NULL, teacher_id (bigint, created_at (timestamp without time zone, academic_year_id (integer NOT NULL, duration_minutes (integer DEFAULT 40, is_active (boolean DEFAULT true
```

### `assessments`
One row per assessment. phase: pre_midterm/post_midterm/second_sitting. max_marks, is_locked.

**Columns:**
```
id (bigint NOT NULL, class_id (bigint NOT NULL, subject_id (bigint NOT NULL, term_id (bigint NOT NULL, assessment_type (character varying NOT NULL, assessment_name (character varying NOT NULL, max_marks (numeric NOT NULL, due_date (date, recorded_at (date, is_locked (boolean, created_by (bigint, created_at (timestamp with time zone, updated_at (timestamp with time zone, academic_year_id (integer NOT NULL, entered_by (integer, date (date
```

### `marks`
Student score per assessment. score, is_absent, entered_by, academic_year_id, term_id, enrollment_id.

**Columns:**
```
id (bigint NOT NULL, assessment_id (bigint NOT NULL, student_id (bigint NOT NULL, score (numeric NOT NULL, entered_by (bigint, entered_at (timestamp with time zone DEFAULT now(), updated_at (timestamp with time zone, academic_year_id (integer NOT NULL, term_id (integer NOT NULL, is_archived (boolean DEFAULT false, archived_at (timestamp without time zone, archived_to (integer, enrollment_id (bigint
```

### `attendance`
Daily attendance per student. status: Present/Absent/Late. academic_year_id, term_id.

**Columns:**
```
id (bigint NOT NULL, class_id (bigint NOT NULL, student_id (bigint NOT NULL, date (date NOT NULL, status (text NOT NULL, reason (text, notes (text, recorded_by (bigint, created_at (timestamp with time zone, updated_at (timestamp with time zone, academic_year_id (integer NOT NULL, term_id (integer NOT NULL, is_excused (boolean DEFAULT false
```

### `class_enrollments`
Student enrollment in a class for a specific term. is_active tracks mid-year changes. Used by getHistoricalRoster().

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('class_enrollments_id_seq'::regclass), student_id (integer NOT NULL, class_id (integer NOT NULL, academic_year_id (integer NOT NULL, term_id (integer, enrollment_date (date NOT NULL DEFAULT CURRENT_DATE, is_active (boolean DEFAULT true, promoted_from_id (integer, promoted_to_id (integer, status (character varying DEFAULT 'Active'::character varying max:20, notes (text, created_at (timestamp without time zone DEFAULT now(), updated_at (timestamp without time zone DEFAULT now()
```

### `student_class_history`
Audit trail of every class change per student. start_date, end_date, reason.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('student_class_history_id_seq'::regclass), student_id (integer NOT NULL, class_id (integer NOT NULL, academic_year_id (integer NOT NULL, term_id (integer, start_date (date, end_date (date, status (character varying DEFAULT 'active'::character varying max:20, created_at (timestamp without time zone DEFAULT now(), updated_at (timestamp without time zone DEFAULT now()
```

### `grading_scale`
Grade thresholds per academic year. min_pct, max_pct, grade, label.

**Columns:**
```
id (bigint NOT NULL, grade (character varying NOT NULL, min_percentage (integer NOT NULL, max_percentage (integer NOT NULL, description (character varying, color (character varying, sort_order (integer DEFAULT 0, created_at (timestamp with time zone, academic_year_id (integer, updated_at (timestamp with time zone DEFAULT now(), is_active (boolean DEFAULT true
```

### `student_academic_history`
Annual academic summary per student per year.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('student_academic_history_id_seq'::regclass), student_id (bigint, school_name (character varying NOT NULL max:200, school_code (character varying max:50, academic_year_id (integer, class_name (character varying max:100, overall_average (numeric, overall_grade (character varying max:5, rank (integer, total_students (integer, sdms_code (character varying max:50, subject_results (jsonb, transfer_reason (text, transfer_date (date, is_verified (boolean DEFAULT false, verified_by (bigint, verified_at (timestamp without time zone, notes (text, created_at (timestamp without time zone DEFAULT now(), updated_at (timestamp without time zone DEFAULT now()
```

## Students

### `students`
Master student record. first_name, last_name, date_of_birth, gender, class_id, status, code, family_id.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('students_new_id_seq'::regclass), student_code (character varying NOT NULL max:50, sdms_code (character varying max:50, first_name (character varying NOT NULL max:100, last_name (character varying NOT NULL max:100, date_of_birth (date, gender (character varying max:10, birthplace (text, nationality (character varying max:100, medical_insurance (character varying max:100, province (character varying max:100, district (character varying max:100, sector (character varying max:100, cell (character varying max:100, village (character varying max:100, address (text, class_id (bigint, enrollment_date (date, academic_year_id (integer, status (character varying DEFAULT 'Active'::character varying max:20, previous_school (character varying max:200, previous_school_marks (numeric, transfer_destination (text, transfer_notes (text, promoted_at (timestamp without time zone, repeated_at (timestamp without time zone, graduated_at (timestamp without time zone, exited_at (date, exit_reason (character varying max:100, is_deleted (boolean DEFAULT false, archived_at (date, notes (text, photo (text, created_at (timestamp without time zone DEFAULT now(), updated_at (timestamp without time zone DEFAULT now()
```

### `guardians`
Guardian information. name, phone, email, relationship, is_primary.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('guardians_id_seq'::regclass), family_id (bigint, guardian_type (character varying NOT NULL max:20, first_name (character varying NOT NULL max:100, last_name (character varying NOT NULL max:100, national_id (character varying max:20, phone (character varying max:20, email (character varying max:100, occupation (character varying max:100, employer (character varying max:200, province (character varying max:100, district (character varying max:100, sector (character varying max:100, cell (character varying max:100, village (character varying max:100, is_primary (boolean DEFAULT false, is_active (boolean DEFAULT true, notes (text, created_at (timestamp without time zone DEFAULT now(), updated_at (timestamp without time zone DEFAULT now(), student_code (character varying max:20
```

### `student_guardians`
Junction table: student ↔ guardian. Allows multiple guardians per student.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('student_guardians_id_seq'::regclass), student_id (bigint, guardian_id (bigint, relationship (character varying max:50, is_emergency_contact (boolean DEFAULT false, created_at (timestamp without time zone DEFAULT now()
```

### `families`
Family group. family_code, total_children, active_children, notes.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('families_id_seq'::regclass), family_code (character varying NOT NULL max:50, total_children (integer DEFAULT 0, active_children (integer DEFAULT 0, notes (text, created_at (timestamp without time zone DEFAULT now(), updated_at (timestamp without time zone DEFAULT now()
```

### `discount_rules`
Sibling discount rules. min_siblings, max_siblings, discount_pct.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('discount_rules_id_seq'::regclass), name (character varying, discount_type (character varying, discount_value (numeric, target_type (character varying, valid_until (date, is_active (boolean, created_at (timestamp without time zone, academic_year_id (integer, description (text, conditions (jsonb, priority (integer DEFAULT 0, max_discount (numeric, applies_to (character varying max:50, created_by (bigint, updated_at (timestamp without time zone DEFAULT now()
```

### `student_archive`
Archived student records with archive reason and date.

**Columns:**
```
id (bigint NOT NULL, original_student_id (bigint, student_code (character varying, first_name (character varying, last_name (character varying, class_name (character varying, archived_date (date, archived_reason (character varying, original_data (jsonb, created_at (timestamp with time zone
```

## Finance

### `fee_categories`
Fee types. name, type, default_amount, is_core, is_active.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('fee_categories_id_seq'::regclass), name (character varying NOT NULL, description (text, reset_frequency (character varying NOT NULL, is_mandatory (boolean DEFAULT false, is_active (boolean DEFAULT true, sort_order (integer, created_at (timestamp with time zone, updated_at (timestamp with time zone, apply_to (character varying, class_id (integer, fee_type (character varying NOT NULL, is_monthly (boolean, version (integer, previous_amount (numeric, deleted_at (timestamp without time zone, deleted_by (integer, academic_year_id (integer NOT NULL, created_by (bigint
```

### `fee_amounts`
Per-class or per-year fee overrides. fee_category_id, class_id, academic_year_id, amount.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('fee_amounts_id_seq'::regclass), fee_category_id (bigint, class_id (bigint, amount (numeric, academic_year_id (bigint, created_at (timestamp with time zone, term_id (bigint, updated_at (timestamp with time zone DEFAULT now(), created_by (bigint
```

### `student_fees`
Fee assigned to a student. amount, waived_amount, paid_amount, is_paid, is_approved, requires_approval, source, due_date, term_id, academic_year_id.

**Columns:**
```
id (bigint NOT NULL, student_id (bigint, fee_category_id (bigint, amount (numeric, paid_amount (numeric, is_waived (boolean, waiver_reason (text, waiver_approved_by (bigint, academic_year_id (bigint, term_id (bigint, due_date (date, created_at (timestamp with time zone, updated_at (timestamp with time zone, is_credit (boolean, credit_amount (numeric, is_archived (boolean, is_paid (boolean, notes (text, is_template_based (boolean, manually_deleted (boolean, archived_at (timestamp with time zone
```

### `payments`
Payment record. student_id, amount, payment_date, payment_method, receipt_number, recorded_by, academic_year_id, term_id.

**Columns:**
```
id (bigint NOT NULL, receipt_number (character varying, student_id (bigint NOT NULL, amount (numeric NOT NULL, payment_date (date NOT NULL, payment_method (character varying NOT NULL, reference_number (character varying, notes (text, recorded_by (bigint, created_at (timestamp with time zone NOT NULL DEFAULT now(), reference (text, is_credit_payment (boolean, is_credit_addition (boolean, academic_year_id (integer NOT NULL, term_id (integer, is_reversed (boolean DEFAULT false, reversed_at (timestamp without time zone, reversed_by (bigint, reversal_reason (text
```

### `payment_allocations`
Links a payment to specific fee(s). payment_id, student_fee_id, amount.

**Columns:**
```
id (bigint NOT NULL, payment_id (bigint NOT NULL, student_fee_id (bigint NOT NULL, amount (numeric NOT NULL, created_at (timestamp with time zone NOT NULL DEFAULT now()
```

### `payment_reversals`
Reversed payment record with reason. payment_id, reversed_by, reason.

**Columns:**
```
id (bigint NOT NULL, original_payment_id (bigint NOT NULL, receipt_number (character varying, amount (numeric NOT NULL, student_id (bigint NOT NULL, reversal_date (timestamp without time zone NOT NULL, reversed_by (bigint NOT NULL, reason (text NOT NULL, created_at (timestamp without time zone NOT NULL DEFAULT now()
```

### `fee_waivers`
Fee waiver grant. student_fee_id, waived_amount, reason, granted_by.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('fee_waivers_id_seq'::regclass), student_id (integer NOT NULL, student_fee_id (integer NOT NULL, amount_waived (numeric NOT NULL, reason (text, waiver_type (character varying NOT NULL DEFAULT 'full'::character varying max:20, approved_by (integer, approved_at (timestamp with time zone DEFAULT now(), academic_year_id (integer, term_id (integer, created_at (timestamp with time zone DEFAULT now(), created_by (integer, is_active (boolean DEFAULT true, notes (text
```

### `student_credit_balance`
Overpayment credit per student. credit_amount, academic_year_id.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('student_credit_balance_id_seq'::regclass), student_id (integer, credit_amount (numeric DEFAULT 0, updated_at (timestamp with time zone DEFAULT now()
```

### `fee_approval_requests`
Pending fee approval requests (alternative approval workflow).

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('fee_approval_requests_id_seq'::regclass), student_id (bigint NOT NULL, fee_category_id (bigint NOT NULL, amount (numeric NOT NULL, reason (character varying max:200, status (character varying NOT NULL DEFAULT 'pending'::character varying max:50, created_at (timestamp without time zone DEFAULT now(), reviewed_by (bigint, reviewed_at (timestamp without time zone, notes (text, academic_year_id (integer, term_id (integer, created_by (integer
```

## Holiday Programme

### `holidays`
Holiday period definitions. name, start_date, end_date, academic_year_id.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('holidays_id_seq'::regclass), name (character varying NOT NULL, start_date (date NOT NULL, end_date (date NOT NULL, type (character varying DEFAULT 'Public Holiday'::character varying, description (text, academic_year_id (integer NOT NULL, created_at (timestamp without time zone, updated_at (timestamp without time zone DEFAULT now(), is_active (boolean DEFAULT true, term_id (integer
```

### `holiday_sessions`
Holiday session record. name, start_date, end_date, status, academic_year_id, after_term_number, auto_activate, fee_config (JSON).

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('holiday_sessions_id_seq'::regclass), academic_year_id (integer NOT NULL, term_id (integer, name (character varying NOT NULL max:100, session_type (character varying NOT NULL max:50, start_date (date NOT NULL, end_date (date NOT NULL, is_active (boolean DEFAULT false, is_holiday_school (boolean DEFAULT false, description (text, created_at (timestamp without time zone DEFAULT now(), updated_at (timestamp without time zone DEFAULT now()
```

### `session_classes`
Holiday class within a session. holiday_session_id, name, is_active.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('session_classes_id_seq'::regclass), name (character varying NOT NULL max:100, is_free (boolean DEFAULT false, academic_year_id (bigint NOT NULL, is_active (boolean DEFAULT true, created_at (timestamp without time zone DEFAULT now(), holiday_session_id (bigint NOT NULL
```

### `session_subjects`
Subject within a holiday class. session_class_id, holiday_session_id, name, max_marks, is_active.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('session_subjects_id_seq'::regclass), name (character varying NOT NULL max:100, session_class_id (bigint NOT NULL, is_active (boolean DEFAULT true, created_at (timestamp without time zone DEFAULT now(), academic_year_id (bigint NOT NULL, holiday_session_id (bigint NOT NULL
```

### `session_teacher_assignments`
Teacher assigned to a holiday class. session_class_id, teacher_id, holiday_session_id.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('session_teacher_assignments_id_seq'::regclass), teacher_id (bigint, session_class_id (bigint, session_subject_id (bigint, academic_year_id (bigint NOT NULL, created_at (timestamp without time zone DEFAULT now(), holiday_session_id (bigint NOT NULL
```

### `session_assessments`
Assessment within a holiday class/subject. session_class_id, session_subject_id, name, max_marks, date, is_locked.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('session_assessments_id_seq'::regclass), session_class_id (bigint NOT NULL, session_subject_id (bigint NOT NULL, assessment_name (character varying NOT NULL max:200, assessment_type (character varying NOT NULL DEFAULT 'Quiz'::character varying max:50, max_marks (integer NOT NULL DEFAULT 100, created_by (bigint, created_at (timestamp without time zone DEFAULT now(), date (date, due_date (date, is_locked (boolean DEFAULT false, academic_year_id (bigint NOT NULL, holiday_session_id (bigint NOT NULL
```

## Second Sitting

### `second_sitting_students`
Students registered for second sitting. student_id, class_id, academic_year_id, original_average, promotion_threshold, status (registered/completed), auto_registered.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('second_sitting_students_id_seq'::regclass), student_id (bigint NOT NULL, academic_year_id (integer NOT NULL, term_id (integer, class_id (bigint NOT NULL, original_average (numeric, original_grade (character varying max:2, promotion_threshold (numeric, failed_subjects (jsonb, total_failed_subjects (integer DEFAULT 0, status (character varying DEFAULT 'registered'::character varying max:20, second_sitting_date (date, second_sitting_completed (boolean DEFAULT false, final_average (numeric, final_grade (character varying max:2, is_promoted (boolean DEFAULT false, is_repeated (boolean DEFAULT false, notes (text, created_by (bigint, reviewed_by (bigint, reviewed_at (timestamp without time zone, created_at (timestamp without time zone DEFAULT now(), updated_at (timestamp without time zone DEFAULT now()
```

### `second_sitting_marks`
Per-subject second sitting score. second_sitting_student_id, student_id, subject_id, second_percentage (0-100), second_grade, passed, entered_by, recorded_at.

**Columns:**
```
id (bigint NOT NULL DEFAULT nextval('second_sitting_marks_id_seq'::regclass), second_sitting_student_id (bigint NOT NULL, student_id (bigint NOT NULL, subject_id (bigint NOT NULL, academic_year_id (integer NOT NULL, term_id (integer, subject_name (character varying max:100, original_score (numeric, original_grade (character varying max:2, second_score (numeric, second_max_marks (numeric DEFAULT 100, second_percentage (numeric, second_grade (character varying max:2, final_score (numeric, final_grade (character varying max:2, passed (boolean DEFAULT false, entered_by (bigint, recorded_at (date, notes (text, created_at (timestamp without time zone DEFAULT now(), updated_at (timestamp without time zone DEFAULT now()
```

## Promotion

### `student_promotions`
Promotion decision per student per year. student_id, academic_year_id, class_id, annual_average_pct, second_sitting_avg_pct, first_decision, final_decision, decided_by.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('student_promotions_id_seq'::regclass), batch_name (character varying NOT NULL max:200, from_academic_year_id (integer NOT NULL, to_academic_year_id (integer NOT NULL, executed_by (integer, executed_at (timestamp without time zone DEFAULT now(), total_students (integer DEFAULT 0, promoted_count (integer DEFAULT 0, repeated_count (integer DEFAULT 0, graduated_count (integer DEFAULT 0, can_rollback (boolean DEFAULT true, notes (text
```

## Communication

### `notifications`
In-app notifications. recipient_id, sender_id, type, title, message, action_url, is_read, category, recipient_role, academic_year_id, term_id.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('notifications_id_seq'::regclass), recipient_id (bigint NOT NULL, sender_id (bigint, type (character varying NOT NULL max:30, title (character varying max:200, message (text NOT NULL, action_url (character varying max:500, is_read (boolean DEFAULT false, read_at (timestamp with time zone, created_at (timestamp with time zone NOT NULL DEFAULT now(), recipient_role (character varying max:20, is_archived (boolean DEFAULT false, academic_year_id (integer, term_id (integer, sender_role (character varying max:20, archived_at (timestamp without time zone, category (character varying DEFAULT 'system'::character varying max:50, created_by (bigint
```

### `reminders`
Automated reminders. type, title, message, scheduled_at, sent_at, recipient_role.

**Columns:**
```
id (bigint NOT NULL, title (character varying NOT NULL, description (text, due_date (date NOT NULL, priority (character varying, completed (boolean DEFAULT false, related_type (character varying, related_id (bigint, user_id (bigint NOT NULL, created_at (timestamp without time zone NOT NULL DEFAULT now(), updated_at (timestamp without time zone DEFAULT now()
```

### `school_settings`
Key-value store for all school configuration. key, value (text). Values include school_name, admin_password (bcrypt), promotion_mark, etc.

**Columns:**
```
id (bigint NOT NULL, key (character varying NOT NULL, value (text NOT NULL, updated_at (timestamp with time zone DEFAULT now()
```

## QR Verification

### `verifications`
QR verification tokens. token (uuid), type (report_card/receipt/transcript), snapshot_id, created_at, used_at, is_valid.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('verifications_id_seq'::regclass), token (uuid NOT NULL DEFAULT gen_random_uuid(), document_type (text NOT NULL, document_id (integer NOT NULL, student_id (integer, generated_at (timestamp with time zone DEFAULT now(), scan_count (integer DEFAULT 0, last_scanned_at (timestamp with time zone, is_valid (boolean DEFAULT true, created_by (integer
```

### `report_card_snapshots`
Frozen report card data. student_id, academic_year_id, snapshot_data (JSONB), token, created_at.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('report_card_snapshots_id_seq'::regclass), student_id (bigint NOT NULL, student_name (text NOT NULL, student_first_name (text NOT NULL DEFAULT ''::text, student_last_name (text NOT NULL DEFAULT ''::text, student_code (text NOT NULL, student_dob (date, student_gender (text, guardian_name (text, guardian_phone (text, class_id (bigint, class_name (text NOT NULL DEFAULT ''::text, term_id (bigint NOT NULL, term_name (text NOT NULL DEFAULT ''::text, term_number (smallint, academic_year_id (bigint NOT NULL, year_name (text NOT NULL DEFAULT ''::text, phase (text NOT NULL, is_nursery (boolean DEFAULT false, subjects (jsonb NOT NULL DEFAULT '[]'::jsonb, totals (jsonb NOT NULL DEFAULT '{}'::jsonb, annual_data (jsonb, rank (text, rank_number (smallint, class_size (smallint DEFAULT 0, overall_grade (text, overall_percentage (numeric, is_passing (boolean, attendance (jsonb, teacher_comment (text, promotion_decision (text, promotion_label (text, head_teacher_name (text, school_name (text NOT NULL DEFAULT 'ECOLE LA FONTAINE'::text, school_address (text DEFAULT 'Rubavu, Rwanda'::text, school_phone (text, school_email (text, school_logo (text, school_motto (text, school_footer_1 (text, school_footer_2 (text, generated_at (timestamp with time zone DEFAULT now(), created_by (bigint, is_locked (boolean DEFAULT true
```

### `receipt_snapshots`
Frozen receipt data. payment_id, snapshot_data (JSONB), token, created_at.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('receipt_snapshots_id_seq'::regclass), receipt_number (text NOT NULL, student_id (bigint, student_name (text NOT NULL, student_first_name (text NOT NULL DEFAULT ''::text, student_last_name (text NOT NULL DEFAULT ''::text, student_code (text NOT NULL, class_name (text NOT NULL DEFAULT ''::text, guardian_name (text, guardian_phone (text, term_id (bigint, term_name (text NOT NULL DEFAULT ''::text, academic_year_id (bigint, year_name (text NOT NULL DEFAULT ''::text, amount (numeric NOT NULL, amount_in_words (text NOT NULL, payment_method (text NOT NULL, payment_date (date NOT NULL, reference_number (text, notes (text, recorded_by (text, fees (jsonb NOT NULL DEFAULT '[]'::jsonb, line_items (jsonb NOT NULL DEFAULT '[]'::jsonb, total_fees (numeric DEFAULT 0, total_paid (numeric DEFAULT 0, outstanding_balance (numeric DEFAULT 0, school_name (text NOT NULL DEFAULT 'ECOLE LA FONTAINE'::text, school_address (text DEFAULT 'Rubavu, Rwanda'::text, school_phone (text, school_email (text, school_logo (text, head_teacher_name (text, generated_at (timestamp with time zone DEFAULT now()
```

### `transcript_snapshots`
Frozen transcript data. student_id, snapshot_data (JSONB), token, created_at.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('transcript_snapshots_id_seq'::regclass), student_id (integer, student_name (text NOT NULL, student_first_name (text NOT NULL DEFAULT ''::text, student_last_name (text NOT NULL DEFAULT ''::text, student_code (text NOT NULL, academic_year_id (integer, year_name (text NOT NULL DEFAULT ''::text, class_name (text NOT NULL DEFAULT ''::text, class_level (text DEFAULT 'primary'::text, terms (jsonb NOT NULL DEFAULT '[]'::jsonb, cumulative_totals (jsonb NOT NULL DEFAULT '{}'::jsonb, overall_grade (text, overall_percentage (numeric, school_name (text NOT NULL DEFAULT 'ECOLE LA FONTAINE'::text, school_address (text DEFAULT 'Rubavu, Rwanda'::text, school_logo (text, head_teacher_name (text, generated_at (timestamp with time zone DEFAULT now(), created_by (integer
```

## Audit

### `system_logs`
Every system action. user_id, action, entity_type, entity_id, details (JSONB), created_at. Written via logAction() only.

**Columns:**
```
id (integer NOT NULL DEFAULT nextval('system_logs_id_seq'::regclass), user_id (integer, action (character varying NOT NULL max:200, entity_type (character varying max:50, entity_id (integer, details (jsonb, ip_address (character varying max:45, created_at (timestamp with time zone DEFAULT now()
```


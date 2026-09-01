# École La Fontaine v9.0 — Academics Workflow

---

## Assessment Phases

Each term has two assessment phases:

| Phase | DB value | Label | Meaning |
|---|---|---|---|
| Pre-midterm | `pre_midterm` | TS | Continuous assessment / test score |
| Post-midterm | `post_midterm` | EX | End-of-term examination score |
| Second sitting | `second_sitting` | 2nd Sit % | Remedial exam after Term 3 |

Each assessment row in the `assessments` table has:
- `class_id` — which class
- `subject_id` — which subject
- `term_id` — which term
- `academic_year_id` — which year
- `phase` — one of the three values above
- `max_marks` — maximum possible score for this assessment
- `assessment_date` — date of the assessment
- `is_locked` — locked assessments cannot be edited in marks-entry

---

## Marks Entry Flow

1. Teacher selects class → term → subject → assessment.
2. `getHistoricalRoster(classId, termId, yearId)` is called to get the exact
   student list for that term. Students who joined after this term or left before
   it are excluded automatically.
3. Teacher enters score for each student. Absent checkbox sets `is_absent = true` and `score = null`.
4. Save writes to `marks` table with full context:
   `assessment_id`, `student_id`, `score`, `is_absent`, `entered_by`, `entered_by_name`,
   `entered_at`, `updated_at`, `academic_year_id`, `term_id`.
5. Grade displayed live as score is entered using `getGrade(pct)`.
6. Assessment auto-locks 7 days after `assessment_date`, or immediately when term
   status changes to `completed`.

---

## Report Card Format

Annual report cards match the Rwanda Ministry of Education format exactly.

### Column structure

```
Subject | Maxima (TS | EX | TOT | GR) | Term 1 (TS | EX | TOT | GR) |
Term 2 (TS | EX | TOT | GR) | Term 3 (TS | EX | TOT | GR) |
Annual Total (TOT | MAX | % | GR) | 2nd Sitting %
```

- **TS** = pre-midterm score (sum of all pre_midterm assessments for this subject/term)
- **EX** = post-midterm score (sum of all post_midterm assessments for this subject/term)
- **TOT** = TS + EX
- **GR** = grade letter from grading scale
- **Annual TOT** = sum of TOT across all 3 terms
- **Annual MAX** = sum of max_marks across all 3 terms
- **Annual %** = (Annual TOT / Annual MAX) × 100 — FIXED, never recalculated
- **2nd Sitting %** = `second_sitting_marks.second_percentage` — shown only for core subjects

### Rows

- **Conduct** row: 40 per term, 120 annual, 100% always
- **Core subjects** section: subjects with `is_core = true`
- **Non-core subjects** section: subjects with `is_core = false`
- **Total** row: sum across all subjects
- **Percentage** row: per-term % and annual %
- **Position** row: rank within class per term and annual
- **Class Teacher Remarks** row
- **Parent Signature** row
- **Grading Scale** table: A(80-100), B(75-79), C(70-74), D(65-69), E(60-64), S(50-59), F(0-49)

### Decision checkboxes

**FIRST DECISION** (before second sitting, based on annual %):
- Promoted — annual % ≥ promotion_mark threshold
- 2nd Sitting — annual % < threshold, student will sit second sitting
- Repeated — student repeats without second sitting
- Discontinued — student leaves school
- Promoted elsewhere — transferred to another school and promoted
- Repeated elsewhere — transferred to another school and repeating

**FINAL DECISION** (after second sitting — enabled only if First = 2nd Sitting):
- Promoted — now meets threshold after 2nd sitting
- Repeated — still below threshold after 2nd sitting
- Promoted after 2nd sitting
- Repeated after 2nd sitting
- Discontinued

Both decisions saved to `student_promotion_decisions` table per student per year.

---

## Second Sitting

### When available
Only after Term 3 status = `completed`. The module is locked until then.

### Who is shown
Students in the selected class whose annual average % is below `school_settings.promotion_mark`.

### Which subjects
Only core subjects (`subjects.is_core = true`). Non-core subjects are excluded from second sitting.

### How to enter marks
1. Open Academics → Second Sitting.
2. Select class (teacher sees only their own class; admin sees all).
3. Click "Auto-Register Failing Students" to populate `second_sitting_students`
   via the `auto_register_second_sitting_students` Supabase RPC.
4. Enter second sitting score (0-100%) per student per subject.
5. Save row or Save All.

### Where marks are stored
- `second_sitting_students` — one row per student registered for second sitting
- `second_sitting_marks` — one row per student per subject, `second_percentage` column

### Effect on report card
The `2nd Sitting %` column shows the average of `second_percentage` values across
core subjects. The annual % column is NOT changed — it remains the fixed original value.
Promotion eligibility for second sitting students is determined by comparing
`second_sitting_avg_pct` (not annual %) to `promotion_mark`.

---

## Rankings

Rankings are computed at three levels:
1. **Per-term ranking** — ranked by term average % within the class
2. **Annual ranking** — ranked by annual % across all 3 terms
3. **Holiday session ranking** — ranked by average % within the holiday class

All rankings are tie-aware: students with equal percentages receive the same rank.
Position displayed as e.g. "37 out of 38" on the report card.
`getHistoricalRoster()` is used to ensure the correct student count per term.

---

## Holiday Programme Marks

Holiday marks are completely separate from academic year marks:
- Stored in `holiday_marks` table (not `marks`)
- Tagged with `holiday_session_id` — different sessions never mix
- Structure: `session_class_id`, `session_subject_id`, `session_assessment_id`, `student_id`, `score`, `is_absent`
- Report cards use `session_subjects` for subject list and `session_teacher_assignments` for teacher names
- Ranks computed within the holiday class only

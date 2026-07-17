# Academics Workflow

The full academics module (`js/modules/academics/`, 16 files) is built. This doc traces the actual data flow: assessments → marks → grading → registers/report cards/rankings.

## Nav pages (in the order a teacher would use them)

| Nav id | File | What it does |
|---|---|---|
| `assessments` | `assessments.js` | Create and lock assessments per class/subject/term |
| `marks-entry` | `marks-entry.js` | Live-validated entry with batch save |
| `marks-database` | `marks-database.js` | Browse/edit marks across assessments |
| `class-register` | `class-register.js` | Pre-midterm/post-midterm/annual register layouts, separate Nursery and Primary formats |
| `report-cards` | `report-cards.js` | Individual and batch report card generation (with QR codes) |
| `transcripts` | `transcripts.js` | Full multi-year academic history |
| `statistics` | `statistics.js` | Compare performance by subject/class/term |

## Supporting files (not their own nav item)

- **`assessment-locking.js`** — locking/unlocking assessments once marks are finalized, used by `assessments.js`.
- **`ranking-engine.js`** / **`rankings.js`** — class/subject ranking calculations, built on `core/formulas.js`'s `rankStudents()`.
- **`marks-analysis.js`** — feeds `statistics.js`'s comparison views.
- **`annual-register.js`** — the annual-summary variant of `class-register.js`.
- **`academic-reports.js`** / **`report-generator.js`** — report assembly used by `report-cards.js`/`transcripts.js`.
- **`marks-import-export.js`** / **`register-export.js`** — bulk import/export paths for marks and register data.

## The calculation layer (this is what's unit-tested)

All the actual math lives in `core/formulas.js` and `core/academic-formulas.js` — the academics module files are UI/orchestration on top of these:

- **`getGrade(pct)`** / **`isPassing(pct)`** / **`isPassingScore(score, max)`** (`formulas.js`) — grade-letter lookup against `state.gradingScale` (DB-backed, editable via **Settings → Grading**; falls back to `DEFAULT_GRADES` in `constants.js`) and pass/fail against `getPassMark()` (reads `state.schoolSettings.pass_mark`, falls back to `SCHOOL_DEFAULTS.pass_mark`).
- **`rankStudents(students)`** (`formulas.js`) — sorts by total descending, ties broken alphabetically, ties share the same rank number and the next rank skips accordingly (e.g. two students tied for 1st means the next student is ranked 3rd, not 2nd).
- **`validateMarkValue(value, max)`** (`core/validators.js`) — used by `marks-entry.js` for live validation as a teacher types: empty is valid (not yet entered), non-numeric/negative/over-max are all flagged with a specific `issue` code.
- **`calcMG` / `calcTOT` / `calcPreMidtermTotals` / `calcPostMidtermTotals` / `calcAnnualTotals` / `calcCompletionRate` / `buildRegisterRows` / `buildAnnualRegisterRows` / `buildStudentReportData` / `findMissingMarks`** (`academic-formulas.js`) — the register/report-card assembly functions. `calcCompletionRate(teacherId, termId, assessments, marks)` in particular is what powers `staff/teacher-performance.js`'s completion-rate display — see `permissions.md` for who can see what here.

`tests/marks-tests.js` and `tests/performance-tests.js` cover this calculation layer directly (grading, ranking, promotion, completion rate) — if you're changing any of the functions listed above, run `npm test` and check those two suites specifically.

## Assessment types and the midterm split

Assessments are split into pre-midterm and post-midterm periods (see `PRE_MIDTERM_TYPES`/`POST_MIDTERM_TYPES` in `constants.js`) — some subjects (flagged `appears_only_post_midterm` on the `subjects` table, see `database-schema.md`) only get assessed in the second half of the term. `ANNUAL_MAX` (`constants.js`) holds the maximum possible annual total per level (1980 for primary, 2400 for nursery — 3 terms × per-term max), used by `buildAnnualRegisterRows`/annual percentage calculations.

## Promotion

End-of-year promotion decisions (`getPromotionDecision(annualPct)` in `formulas.js`) feed into the `student_promotions`/`student_promotion_records` tables (see `database-schema.md`) via `students/student-promotion.js`.

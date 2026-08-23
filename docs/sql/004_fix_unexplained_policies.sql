-- ==================================================================================
-- 004_fix_unexplained_policies.sql
-- ==================================================================================
-- 8 tables were found with full CRUD (DELETE included) policies that weren't
-- created by any of 001/002/003, and were confirmed NOT added by Natso or
-- anyone else knowingly -- likely a leftover default/seed migration.
-- Rebuilding these from scratch using the same append-only reasoning applied
-- everywhere else in this audit, split into two groups:
--
--   TRUE AUDIT/LOG/HISTORY (insert+select only -- immutable once written):
--     activity_logs, system_logs, payment_reversals, marks_archive,
--     student_archive, student_fee_history
--
--   CONFIG/TEMPLATE DATA (full CRUD is genuinely appropriate -- these are
--   editable/deletable settings, not records of what happened):
--     report_templates, fee_templates
--
-- Ensures RLS is explicitly enabled on all 8 (in case that part was also
-- inherited from wherever these came from, rather than done deliberately).
-- ==================================================================================

ALTER TABLE activity_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_reversals  ENABLE ROW LEVEL SECURITY;
ALTER TABLE marks_archive      ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_archive    ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fee_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_templates      ENABLE ROW LEVEL SECURITY;

-- ─── Drop every existing policy on all 8, unconditionally ─────────────────
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'activity_logs', 'system_logs', 'payment_reversals',
              'marks_archive', 'student_archive', 'student_fee_history',
              'report_templates', 'fee_templates'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- ─── True audit/log/history: INSERT + SELECT only, nothing else ───────────
CREATE POLICY activity_logs_select ON activity_logs FOR SELECT TO anon USING (true);
CREATE POLICY activity_logs_insert ON activity_logs FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY system_logs_select ON system_logs FOR SELECT TO anon USING (true);
CREATE POLICY system_logs_insert ON system_logs FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY payment_reversals_select ON payment_reversals FOR SELECT TO anon USING (true);
CREATE POLICY payment_reversals_insert ON payment_reversals FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY marks_archive_select ON marks_archive FOR SELECT TO anon USING (true);
CREATE POLICY marks_archive_insert ON marks_archive FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY student_archive_select ON student_archive FOR SELECT TO anon USING (true);
CREATE POLICY student_archive_insert ON student_archive FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY student_fee_history_select ON student_fee_history FOR SELECT TO anon USING (true);
CREATE POLICY student_fee_history_insert ON student_fee_history FOR INSERT TO anon WITH CHECK (true);

-- ─── Config/template data: full CRUD is appropriate ────────────────────────
CREATE POLICY report_templates_select ON report_templates FOR SELECT TO anon USING (true);
CREATE POLICY report_templates_insert ON report_templates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY report_templates_update ON report_templates FOR UPDATE TO anon USING (true);
CREATE POLICY report_templates_delete ON report_templates FOR DELETE TO anon USING (true);

CREATE POLICY fee_templates_select ON fee_templates FOR SELECT TO anon USING (true);
CREATE POLICY fee_templates_insert ON fee_templates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY fee_templates_update ON fee_templates FOR UPDATE TO anon USING (true);
CREATE POLICY fee_templates_delete ON fee_templates FOR DELETE TO anon USING (true);

-- ─── Verify ─────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
      'activity_logs', 'system_logs', 'payment_reversals',
      'marks_archive', 'student_archive', 'student_fee_history',
      'report_templates', 'fee_templates'
  )
ORDER BY tablename, cmd;
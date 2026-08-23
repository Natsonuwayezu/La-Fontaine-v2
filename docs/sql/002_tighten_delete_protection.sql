-- ═══════════════════════════════════════════════════════════════════
-- 002_tighten_delete_protection.sql
-- ═══════════════════════════════════════════════════════════════════
-- Ecole La Fontaine v2 — fixes found by auditing the LIVE pg_policies
-- output after 001 was run (with corrections — see the note at the
-- bottom of 001 for what changed and why).
--
-- WHAT WAS FOUND
--
-- 1. Several tables in the live database already had a broad, pre-
--    existing policy named anon_all_<table> with `cmd = ALL`, from
--    before either RLS SQL file was written. Postgres RLS policies
--    are additive — ANY matching policy grants access, policies don't
--    override each other. So on every table where BOTH an anon_all_*
--    (ALL) policy and the newer, narrower per-operation policies
--    exist side by side, the narrower ones achieve nothing — the
--    broad one already grants everything, DELETE included.
--
--    This silently undid the "no hard-delete" protection on exactly
--    the tables where it mattered most:
--      assessments, attendance, marks, payment_allocations, payments,
--      student_credit_balance, student_fees
--    and undid the "select/update only, no insert" restriction on:
--      school_settings
--
-- 2. Four tables that should have the same "frozen, append-only"
--    protection were never given it in the first place: verifications,
--    receipt_snapshots, report_card_snapshots, transcript_snapshots.
--    Confirmed by grepping every real call site — the app only ever
--    insert()s into these (core/verification-engine.js) and, for
--    verifications, does one specific update to scan_count — it never
--    deletes or rewrites a snapshot once issued. That's the whole
--    point of a "frozen at generation time" document: a report card
--    or receipt someone printed and a parent can still scan must not
--    be alterable or removable after the fact.
--
-- Run this after 001. Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- PART 1 — Drop every leftover anon_all_* (cmd=ALL) policy
-- ───────────────────────────────────────────────────────────────────
-- These are redundant on tables where DELETE is meant to be allowed
-- (the per-operation policies already cover the same ground, more
-- legibly), and actively dangerous on the ones where it isn't.
-- Dropping them everywhere is simpler and safer than trying to keep
-- track of which ones happen to be "harmless" today.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND policyname LIKE 'anon\_all\_%'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;


-- ───────────────────────────────────────────────────────────────────
-- PART 2 — Lock down the 4 frozen-document / audit-trail tables
-- ───────────────────────────────────────────────────────────────────
-- Same append-only pattern as payments/marks/attendance/etc: real
-- SELECT/INSERT/UPDATE for anon (the app needs to create these and,
-- for verifications, bump scan_count), but no DELETE, ever.

ALTER TABLE verifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_snapshots       ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_snapshots    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS verifications_delete ON verifications;
DROP POLICY IF EXISTS receipt_snapshots_delete ON receipt_snapshots;
DROP POLICY IF EXISTS report_card_snapshots_delete ON report_card_snapshots;
DROP POLICY IF EXISTS transcript_snapshots_delete ON transcript_snapshots;

-- Ensure the SELECT/INSERT/UPDATE policies exist too (in case these
-- tables were only ever touched by the ad-hoc named policies visible
-- in the live pg_policies output — "Public can read...",
-- "Authenticated can insert...", etc. — rather than a consistent set).
DROP POLICY IF EXISTS verifications_select ON verifications;
CREATE POLICY verifications_select ON verifications FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS verifications_insert ON verifications;
CREATE POLICY verifications_insert ON verifications FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS verifications_update ON verifications;
CREATE POLICY verifications_update ON verifications FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS receipt_snapshots_select ON receipt_snapshots;
CREATE POLICY receipt_snapshots_select ON receipt_snapshots FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS receipt_snapshots_insert ON receipt_snapshots;
CREATE POLICY receipt_snapshots_insert ON receipt_snapshots FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS receipt_snapshots_update ON receipt_snapshots;
CREATE POLICY receipt_snapshots_update ON receipt_snapshots FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS report_card_snapshots_select ON report_card_snapshots;
CREATE POLICY report_card_snapshots_select ON report_card_snapshots FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS report_card_snapshots_insert ON report_card_snapshots;
CREATE POLICY report_card_snapshots_insert ON report_card_snapshots FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS report_card_snapshots_update ON report_card_snapshots;
CREATE POLICY report_card_snapshots_update ON report_card_snapshots FOR UPDATE TO anon USING (true);

DROP POLICY IF EXISTS transcript_snapshots_select ON transcript_snapshots;
CREATE POLICY transcript_snapshots_select ON transcript_snapshots FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS transcript_snapshots_insert ON transcript_snapshots;
CREATE POLICY transcript_snapshots_insert ON transcript_snapshots FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS transcript_snapshots_update ON transcript_snapshots;
CREATE POLICY transcript_snapshots_update ON transcript_snapshots FOR UPDATE TO anon USING (true);

-- Also drop the extra ad-hoc named policies visible in the live
-- pg_policies output ("Public can read...", "Authenticated can
-- insert...", "Anon can update scan_count..."). They're not wrong,
-- exactly, but having both a named ad-hoc policy AND the standardized
-- one above covering the same operation is the same "which one is
-- actually in effect" confusion that caused Part 1's bug in the first
-- place — better to have exactly one policy per table per operation.
DROP POLICY IF EXISTS "Public can read receipt_snapshots" ON receipt_snapshots;
DROP POLICY IF EXISTS "Authenticated can insert receipt_snapshots" ON receipt_snapshots;
DROP POLICY IF EXISTS "Public can read report_card_snapshots" ON report_card_snapshots;
DROP POLICY IF EXISTS "Authenticated can insert report_card_snapshots" ON report_card_snapshots;
DROP POLICY IF EXISTS "Public can read transcript_snapshots" ON transcript_snapshots;
DROP POLICY IF EXISTS "Authenticated can insert transcript_snapshots" ON transcript_snapshots;
DROP POLICY IF EXISTS "Public can read verifications" ON verifications;
DROP POLICY IF EXISTS "Authenticated can insert verifications" ON verifications;
DROP POLICY IF EXISTS "Anon can update scan_count on verifications" ON verifications;


-- ───────────────────────────────────────────────────────────────────
-- PART 3 — Verification query (run this after, compare against the
-- pg_policies output you already have)
-- ───────────────────────────────────────────────────────────────────
-- Expect: no more `anon_all_*` rows at all, and no DELETE row for any
-- of assessments / attendance / marks / payment_allocations /
-- payments / student_credit_balance / student_fees / verifications /
-- receipt_snapshots / report_card_snapshots / transcript_snapshots.

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;


-- ═══════════════════════════════════════════════════════════════════
-- NOT ADDRESSED HERE (flagging, not touching without confirmation)
-- ═══════════════════════════════════════════════════════════════════
-- 13 tables in the live database aren't referenced anywhere in the
-- current app code: students_old, backups, push_subscriptions,
-- guardians, student_guardians, discount_rules, student_class_history,
-- promotions, promotion_batches, fee_templates, student_fee_history,
-- marks_archive, student_archive. Also student_promotions and
-- student_promotion_records exist and have policies but are never
-- written to by any current code either (student-promotion.js updates
-- students.class_id/status directly, not a separate history table).
--
-- These are left exactly as they are. Could be legacy from an earlier
-- rebuild, or planned features nobody's wired up yet — worth Natso
-- confirming which before doing anything to them (drop, restrict
-- further, or wire up the app to actually use them).
-- ═══════════════════════════════════════════════════════════════════

# docs/sql/

Numbered SQL migrations to run manually in the Supabase SQL editor, in
order. These are not auto-applied by the app — run each file once,
top to bottom, checking for errors before moving to the next.

Every file here should be idempotent where practical (safe to re-run
without duplicating data or erroring on already-applied changes).

## Files

| # | File | What it does |
|---|---|---|
| 001 | `001_enable_rls_baseline.sql` | Enables RLS on every real table, stops plaintext passwords from reaching the client via a secure login function + views, blocks hard-deletion of financial/academic history records. See the file's own header comment for what it deliberately does NOT do yet (password hashing, per-user row scoping — both need a real auth migration first). |

## Before running any file here

1. Run on a staging/copy of the database first if you have one — RLS changes can break the app if a policy is missing for something the client actually calls.
2. After running, test each role's core workflows (login, enroll a student, record a payment, enter marks) before considering it done — RLS failures show up as empty results or 403s, not errors that are always obvious in the UI.
3. Read the file's own header comment — each one explains what it achieves and, just as importantly, what it doesn't.

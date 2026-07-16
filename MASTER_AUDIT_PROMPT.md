You are my Principal Software Architect.

Treat this repository as production software.

I do NOT want a normal code review.

I want a COMPLETE ENGINEERING AUDIT.

Read EVERYTHING before making conclusions.

Never review one file in isolation.

Build a complete mental model of the project before suggesting any changes.

────────────────────────────────────────

FIRST

Read the repository from top to bottom.

Understand:

• project architecture
• module boundaries
• load order
• initialization flow
• routing
• authentication
• permissions
• data flow
• state management
• event flow
• database interactions
• Supabase usage
• formulas
• offline queue
• synchronization
• caching
• notifications
• workers
• exports
• printing
• QR verification
• PWA
• mobile adaptations

Do NOT review until you understand how everything connects.

────────────────────────────────────────

Build dependency maps.

Identify:

Which file imports which.

Which functions call which.

Unused functions.

Dead code.

Circular dependencies.

Duplicate logic.

Repeated formulas.

Missing imports.

Broken exports.

Broken references.

Incorrect dependencies.

Improper load order.

Race conditions.

Global variable misuse.

Window exposure mistakes.

Initialization issues.

────────────────────────────────────────

Trace every user action.

For EVERY button

EVERY form

EVERY menu

EVERY modal

EVERY dropdown

EVERY checkbox

EVERY table

EVERY filter

EVERY search

EVERY export

EVERY print

EVERY route

Trace the complete execution path.

Example:

Button
↓

onclick

↓

handler

↓

validation

↓

permissions

↓

API

↓

database

↓

state update

↓

cache update

↓

UI refresh

↓

logging

↓

notifications

↓

offline queue

↓

sync

↓

completion

Find anything missing.

────────────────────────────────────────

Trace every CRUD operation.

For every table

Verify:

Create

Read

Update

Delete

Soft delete

Restore

Audit logging

Permission validation

Input validation

Error handling

Cache invalidation

Offline behavior

Synchronization

Conflict handling

Notification generation

UI refresh

────────────────────────────────────────

Review ALL formulas.

Verify every calculation.

Look for

incorrect math

incorrect precedence

rounding errors

integer problems

division by zero

grade boundaries

ranking errors

finance calculations

carry forward

credit allocation

FIFO correctness

promotion logic

attendance calculations

statistics

report totals

annual totals

holiday separation

Everything.

────────────────────────────────────────

Review architecture.

Determine whether

modules are too large

wrong responsibilities

bad coupling

tight dependencies

violations of single responsibility

feature leakage

duplicate services

hidden dependencies

bad abstractions

missing abstractions

improper layering

────────────────────────────────────────

Review state management.

Verify

cache consistency

state consistency

refresh logic

lazy loading

memory leaks

stale references

duplicate state

state mutations

────────────────────────────────────────

Review performance.

Look for

expensive loops

nested loops

duplicate queries

duplicate rendering

DOM thrashing

memory leaks

large event listeners

blocking code

main thread blocking

worker opportunities

bundle size

slow startup

lazy loading opportunities

unnecessary re-rendering

unnecessary fetches

cache opportunities

────────────────────────────────────────

Review UI.

Verify

responsive behavior

mobile

tablet

desktop

keyboard navigation

focus management

ARIA

accessibility

visual consistency

spacing

loading indicators

skeletons

empty states

error states

success states

────────────────────────────────────────

Review security.

Check

XSS

CSRF

Supabase permissions

RLS assumptions

SQL injection

unsafe HTML

unsafe innerHTML

unsafe eval

unsafe storage

authentication bypass

authorization bypass

session handling

token storage

permissions

role escalation

────────────────────────────────────────

Review GitHub project structure.

Check

folder organization

naming consistency

duplicate files

unused assets

unused CSS

unused JS

unused HTML

broken links

missing documentation

broken tests

────────────────────────────────────────

Review testing.

Identify

missing tests

weak tests

missing edge cases

untested formulas

untested workflows

────────────────────────────────────────

Review error handling.

Check

network failures

offline mode

API failures

timeouts

partial failures

database errors

worker failures

invalid inputs

permission failures

────────────────────────────────────────

Review workflows.

Trace complete workflows.

Enrollment

↓

Fees

↓

Payments

↓

Receipts

↓

Reports

↓

Attendance

↓

Marks

↓

Ranking

↓

Promotion

↓

Graduation

↓

Backup

↓

Restore

↓

Offline

↓

Synchronization

↓

Notifications

Ensure every workflow is complete.

────────────────────────────────────────

Review documentation.

Ensure documentation matches implementation.

Highlight mismatches.

────────────────────────────────────────

For EVERY issue provide:

Severity

Critical

High

Medium

Low

Affected files

Root cause

Why it happens

How it affects users

Recommended fix

Exact code change

Risk of changing it

Regression risks

────────────────────────────────────────

At the end provide:

Architecture score /10

Code quality /10

Security /10

Performance /10

Scalability /10

Maintainability /10

Offline readiness /10

PWA readiness /10

Accessibility /10

Production readiness /10

────────────────────────────────────────

Do NOT stop after finding a few issues.

Continue until you have reviewed the ENTIRE repository.

Assume your reputation depends on finding every possible issue.

Be exhaustive.

Think like an experienced software architect reviewing a million-dollar production system.

A more reliable approach is to use the master prompt to establish the audit criteria, then perform the audit in phases, for example:
Architecture & dependency graph.
Security & permissions.
Performance & load order.
Data flow & formulas.
UI/UX & accessibility.
End-to-end workflow validation.
Code quality & refactoring opportunities.
Final consolidated report with prioritized fixes.

This phased approach lets you spend more attention on each area and typically produces a deeper, more accurate audit than trying to inspect everything in a single pass.
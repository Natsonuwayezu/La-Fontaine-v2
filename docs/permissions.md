# Permissions

## Roles

Three roles, defined in `config/constants.js`:

```js
const USER_ROLES = ['admin', 'accountant', 'teacher'];
const TEACHER_ROLES = USER_ROLES; // alias — see note below
```

All three live in the same `teachers` table (see `database-schema.md`) — there's no separate "users" or "accountants" table. `state.currentUser.role` holds the current session's role.

> **Note:** `TEACHER_ROLES` didn't exist until it was added as an alias to `USER_ROLES` — `core/validators.js`'s `validateTeacherForm()` referenced it and would have thrown `ReferenceError` on every call before that fix. See `changelog.md`.

## Two permission systems

This codebase currently has **two** separate, overlapping permission modules. Both are real and both are in use — they haven't been reconciled into one yet.

### `config/role-permissions.js` — generic module/entity access

Built around **which modules a role can see**, and generic CRUD-style checks:

- `canAccess(role, moduleId, isHoliday)` — can this role open this nav module at all
- `can(role, entity, action)` / `canEdit` / `canDelete` / `canCreate` / `canRead` — generic entity-level CRUD check
- `canAccessDashboard(role, moduleId)`, `getAccessibleModules(role)`, `getDashboardModules(role)`
- `isAdmin()` / `isTeacher()` / `isAccountant()` / `currentRole()` / `currentUserId()` (all read from `state.currentUser`)
- `isClassTeacher(teacherId, classId)` — true if this teacher is the assigned class-teacher for this class

Module access is driven by three sets: `ADMIN_BLOCKED_MODULES` (empty — admins can reach everything), `ACCOUNTANT_BLOCKED_MODULES`, `TEACHER_BLOCKED_MODULES` — plus `CLASS_TEACHER_EXTRA_ACCESS` for the small set of things a class-teacher can do that ordinary teachers can't.

`js/ui/sidebar.js` calls `canAccess(state.role, item.id)` to filter which nav items render for the current role. (It used to call a function named `canAccessModule`, which never existed anywhere — fixed to call the real `canAccess`. See `changelog.md`.)

### `core/permissions.js` — specific action checks

Built around **one function per specific action**, all reading the current user via `myRole()`/`myId()`/`iAmAdmin()`/`iAmTeacher()`/`iAmAccountant()`:

- Students: `canCreateStudents`, `canEditStudent`, `canArchiveStudent`, `canPromoteStudents`
- Academics: `canEnterMarks(assessment)`, `canLockAssessments`, `canDeleteAssessment(assessment)`, `canViewMarksDB`, `canViewReportCards`, `canViewAnnualRegister`
- Finance: `canRecordPayment`, `canViewPayments`, `canManageFees`, `canGrantWaivers`, `canReversePayment`, `canViewFinanceReports`
- Staff/settings: `canManageStaff`, `canManageSubjects`, `canResetPassword(targetUserId)`, `canManageSettings`, `canManageGrading`, `canBackup`, `canViewLogs`
- Communication: `canCreateAnnouncements`
- Class-teacher scoping: `iAmClassTeacher(classId)`, `myAssignedClassIds()`, `myAssignedSubjectIds()`, `canSeeClass(classId)`
- DOM helpers for conditionally showing/hiding/disabling UI based on any of the above: `showIf`, `hideIf`, `visibleIf`, `disabledIf`, `readonlyIf`, plus page-level appliers `enforceRoleVisibility()`, `enforceFormPermissions()`, `applyHolidayVisibility()`

This is the file to reach for when a specific button or form field needs a specific permission check — `role-permissions.js` is coarser (whole-module access), `permissions.js` is finer (this one action, right now, for this user).

## Holiday mode

`isHolidayMode()` (`core/state.js`) toggles a parallel mode where a different set of tables is used (`holiday_marks`, `holiday_fees`, `holiday_enrollments`, `holiday_subjects` — see `database-schema.md`) and `applyHolidayVisibility()` in `permissions.js` adjusts what's shown accordingly. `canAccess()` in `role-permissions.js` also takes an `isHoliday` parameter for the same reason.

## Login lockout

`core/auth.js` locks out repeated failed login attempts using `APP_CONFIG.maxLoginAttempts` (5) and `APP_CONFIG.lockoutDuration` (15 minutes), tracked in `localStorage` under the key `lf_login_attempts`. Check via the public `checkLoginLockout()` function. (This was silently broken — it checked a field named `maxFailedLogins`, which didn't exist, so lockout never triggered. Fixed; see `changelog.md`. Covered by `tests/auth-tests.js`.)

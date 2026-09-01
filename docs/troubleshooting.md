# École La Fontaine v9.0 — Troubleshooting

---

## Login Issues

**Problem:** Login shows "Invalid credentials"
**Fix:** Verify the admin password was set correctly in Supabase:
```sql
SELECT key, length(value) FROM school_settings WHERE key = 'admin_password';
```
If `length(value)` is less than 60, the password is not hashed. Run:
```sql
UPDATE school_settings SET value = crypt('your_password', gen_salt('bf'))
WHERE key = 'admin_password';
```

**Problem:** Login locked out (too many attempts)
**Fix:** In Supabase SQL Editor:
```sql
DELETE FROM login_attempts WHERE email = 'your_email@example.com';
```

**Problem:** Google Sign-In button not working
**Fix:** Check Supabase Authentication → Providers → Google is enabled.
Verify Client ID and Secret are correct. Check authorized origins include your app URL.

---

## Missing Data

**Problem:** Student list shows no students
**Fix:** Verify `students` table has rows in Supabase Table Editor.
Check that `state.students` is populated: open browser console, type `state.students.length`.

**Problem:** Marks entry shows no students in roster
**Fix:** Check `class_enrollments` table has rows with `is_active = true` for this class/term/year.
If empty, the fallback uses `students.class_id` — verify students have the correct `class_id`.

**Problem:** Report card shows wrong student count
**Fix:** The count is from `getHistoricalRoster()`. Verify `class_enrollments` has the
correct rows for the selected term. If students were enrolled mid-year, their
`enrollment_date` and `term_id` must be set correctly.

---

## RLS Errors

**Problem:** API returns 403 or empty arrays unexpectedly
**Fix:** Check RLS policies in Supabase → Authentication → Policies.
Verify the user is authenticated: `state.currentUser` should have a valid `id`.
Run the relevant migration again if policies are missing.

**Problem:** Insert returns 403
**Fix:** The user's role may not have write permission. Check `role-permissions.js`
and the RLS policy for that table. Verify `state.currentUser.role` is correct.

---

## Offline Sync Issues

**Problem:** Changes not syncing after coming back online
**Fix:** Open browser DevTools → Application → IndexedDB → check `offline_queue` store.
If queue is stuck, clear it and re-enter the data.
Check that the service worker is active: DevTools → Application → Service Workers.

**Problem:** App showing stale data
**Fix:** Force reload: hold Shift and click Reload (bypasses service worker cache).
Or: DevTools → Application → Service Workers → Update → Skip Waiting.

---

## Service Worker Cache

**Problem:** CSS or JS changes not reflected after deploy
**Fix:** The service worker version must be bumped in `sw.js`:
```javascript
const CACHE_VERSION = 'v9.0.2'; // increment this
```
Or force-clear: DevTools → Application → Clear Storage → Clear site data.

---

## Print Issues

**Problem:** Report card print is blank or cuts off
**Fix:** Use Chrome or Edge for printing. Firefox has known issues with complex print layouts.
In print dialog: set margins to None or Minimum. Scale: 90%.

**Problem:** Thermal receipt not fitting on paper
**Fix:** Use `receipts-thermal-print.css` — ensure the printer width is set to 58mm or 80mm
in the printer driver settings.

---

## Supabase Quota

**Problem:** API requests failing after heavy use
**Fix:** Check Supabase project usage in Supabase Dashboard → Reports.
The free tier allows 500MB storage and 2GB bandwidth. Upgrade if needed.
Optimize by reducing `loadAllData()` frequency — increase `settingsCacheTTL` in `constants.js`.

---

## Holiday Mode Issues

**Problem:** App not switching to holiday mode automatically
**Fix:** Verify `holiday_sessions` table has a row with `status = 'active'` and
`start_date ≤ today ≤ end_date`. Check `auto_activate = true` on the session.
The auto-switch runs every 10 minutes — wait or force it: open console and run `_checkAndSwitchMode()`.

**Problem:** Holiday marks saving to wrong table
**Fix:** Verify `isHolidayMode()` returns `true` in the console.
Check that `holiday_session_id` is set in state: `state.activeHolidaySession?.id`.

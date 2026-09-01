# École La Fontaine v9.0 — Setup Guide

---

## First-Run Setup

### Step 1: Supabase project

1. Create a Supabase project at https://supabase.com.
2. Note your Project URL and anon key (Settings → API).
3. In the Supabase SQL Editor, run migrations in order:
   - `docs/sql/001_enable_rls_baseline.sql`
   - `docs/sql/002_tighten_delete_protection.sql`
   - `docs/sql/003_hash_passwords.sql`
   - `docs/sql/004_fix_unexplained_policies.sql`
   - `docs/sql/005_server_side_lockout.sql`
   - `docs/sql/006_google_oauth_login.sql`
   - `docs/sql/007_holiday_sessions.sql`
   - `docs/sql/008_qr_snapshots.sql`
   - `docs/sql/009_second_sitting.sql`

### Step 2: Admin password

In Supabase SQL Editor:
```sql
INSERT INTO school_settings (key, value)
VALUES ('admin_password', crypt('your_password_here', gen_salt('bf')));
```
Replace `your_password_here` with your chosen admin password.
The `crypt()` function is provided by the `pgcrypto` extension (enabled by migration 003).

### Step 3: Open the app

1. Open `index.html` in your browser (via a local server or deployed URL).
2. The Supabase setup screen appears on first load.
3. Enter your Supabase Project URL and anon key.
4. Click "Test Connection" — should show green checkmark.
5. Click "Save & Continue".

### Step 4: Log in

Email: `admin@ecolelafontaine.rw` (or your configured admin email)
Password: the password you set in Step 2.

### Step 5: School settings

Settings → School Settings:
- School name
- Address and phone
- Head teacher name and title
- Promotion mark (default: 50%)
- Currency (RWF)
- School logo

### Step 6: Academic year

Settings → Academic Years → Create Year:
- Year name (e.g. `2025-2026`)
- Set as active year

Settings → Academic Calendar → Add Terms:
- Term 1: start date, end date
- Term 2: start date, end date
- Term 3: start date, end date

### Step 7: Classes and subjects

Settings → Classes:
- Create each class (P1A, P1B, P2A, ... P6D)
- Set sort_order (determines promotion path: P1 → P2 → ... → P6)
- Assign class teacher to each class

Settings → Subjects:
- Create each subject
- Set `is_core = true` for: English, Kinyarwanda, Mathematics, Sciences, SRS, French
- Set `is_core = false` for: Creative Arts, Physical Education
- Set sort_order for report card display order

### Step 8: Grading scale

Settings → Grading Scale:
- Confirm or adjust grade thresholds
- Default: A(80+), B(75-79), C(70-74), D(65-69), E(60-64), S(50-59), F(0-49)

### Step 9: Fee categories

Finance → Fee Structure:
- Create fee categories (Tuition, Registration, Activity fee, etc.)
- Set `default_amount` for each
- Mark `is_core` for categories used in second sitting context

### Step 10: Teachers and users

Staff → Teachers:
- Add each teacher with name, email, subjects
Settings → Users:
- Create login accounts for teachers
- Set role: `teacher` or `accountant`

### Step 11: Enroll students

Students → Enroll Student:
- Use the 4-step wizard
- Step 1: Student details
- Step 2: Guardian information
- Step 3: Class assignment
- Step 4: Fee assignment and initial payment

### Step 12: Google Sign-In (optional)

1. Create a Google Cloud project at https://console.cloud.google.com
2. Enable Google+ API and create OAuth 2.0 credentials
3. Add your app's URL to authorized origins
4. In Supabase: Authentication → Providers → Google → Enable, add Client ID and Secret
5. The Google Sign-In button on the login page becomes active automatically

---

## Deployment

### Local development
```bash
npx serve .
```
Open http://localhost:3000

### Production
Deploy the entire repository to any static hosting:
- Netlify: drag and drop the folder
- Vercel: `vercel deploy`
- GitHub Pages: push to `gh-pages` branch
- Custom server: `nginx` or `caddy` serving the folder

No build step needed. All files are production-ready as-is.

### PWA install
Once deployed to HTTPS, users can install the app:
- Chrome/Android: "Add to Home Screen" prompt
- Safari/iOS: Share → Add to Home Screen
- Chrome Desktop: install icon in address bar

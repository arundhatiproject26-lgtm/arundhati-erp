# Arundhati Hospital ERP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Next.js staff ERP (login, HR, biometric attendance, 4-step leave approval, payslips) for Arundhati hospital, ported from campus-companion.

**Architecture:** Next 16 App Router app. Client pages call `/api/*` routes with a Cognito ID token as Bearer. The routes verify the token locally (JWKS), check `user_roles`, and query Postgres through Kysely. The rules are pure modules, each with a runnable `*.check.ts`: attendance derivation, leave state machine, leave balance.

**Tech Stack:** Next 16.2, React 18, TypeScript, Tailwind 3 + Shadcn UI, TanStack Query 5, Kysely + pg, AWS Cognito SDK v3, jose, xlsx.

**Spec:** `docs/superpowers/specs/2026-10-07-hospital-erp-design.md`

**Source repo (read-only reference):** `C:\Users\aishw\Documents\Trib\ERP\campus-companion` (below: `$SRC`)

## Global Constraints

- Code only. No DB or AWS gets provisioned. `npm run build` and `npm run typecheck` must pass with an empty env.
- Auth = AWS Cognito (env `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_ID`, `COGNITO_REGION`).
- DB = Postgres via `DATABASE_URL`. No RDS-IAM, no Supabase.
- Roles: `staff`, `hod`, `principal`, `dean`, `hr`. `staff_type` ∈ `faculty | non_teaching`.
- Leave status: `pending → hod_approved → principal_approved → approved`, plus `rejected` and `cancelled`.
- No MLRIT data, names, emails, migrations, scripts, or git history.
- Commit to `main` only. **Do not push until the user confirms.**
- Do not add a `Co-Authored-By` trailer to commits (user rule).

## Spec deviation (flag to user)

MLRIT's `leave-rules.ts` encodes MLRIT's 2024 policy (class-work-day caps, 4-month blocks, a hard-coded 2026-09-01 floor), so it is **not** ported.
It is replaced by a generic rule: HR allocates days per leave type per year in `leave_balances`. A request is rejected when its days exceed `allocated − (approved + in-flight days that year)`. Half days are allowed for CL/SL.

## Review Focus

1. Approver acts on a request already moved by someone else → 409, no double transition. Covered by the conditional UPDATE in `decide()` (Task 4).
2. HOD tries to approve leave from another department, or anyone approves their own leave → 403. Covered by the `canDecide` check (Task 4).
3. Biometric sheet with lowercase codes / PM text times / repeated headers → normalised. Covered by `punch-sheet.ts`, ported unchanged (Task 5).
4. Leave crossing the year boundary → each year's days are counted against that year's balance. Covered by `daysByYear` (Task 4).
5. Missing env at build time → build must not throw. Covered by lazy Cognito/DB init (Tasks 2–3).

---

### Task 1: Scaffold

**Files:** `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `components.json`, `eslint.config.js`, `.gitignore`, `.env.example`, `app/layout.tsx`, `app/globals.css`, `app/providers.tsx`, `lib/utils.ts`, `components/ui/{button,card,input,label,table,badge,select,textarea,tabs,alert,dialog}.tsx`

- [ ] Copy the configs from `$SRC`. Strip PostHog, supabase image host, `distDir`. Keep `process.env.TZ='Asia/Kolkata'`.
- [ ] `package.json` deps: the subset actually imported (next, react, react-dom, kysely, pg, jose, xlsx, zod, @tanstack/react-query, @aws-sdk/client-cognito-identity-provider, the radix packages used by the copied ui files, lucide-react, clsx, tailwind-merge, class-variance-authority, tailwindcss-animate). Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `check` (`node lib/leave-flow.check.ts && node lib/hr-attendance.check.ts`).
- [ ] `npm install`, then `npm run build` → PASS (placeholder home page).
- [ ] Commit `chore: scaffold Next app`.

### Task 2: Schema + DB

**Files:** `sql/schema.sql`, `types/db.ts`, `lib/db.ts`

- [ ] `sql/schema.sql` tables:
  - `employees` (id uuid pk, user_id uuid unique null, email unique, full_name, employee_code unique, department, designation, staff_type check in (faculty, non_teaching), employment_type, status check in (active, on-leave, resigned, terminated), date_of_joining, phone, basic_salary, hra, allowances, pf_deduction, tax_deduction, created_at, updated_at)
  - `user_roles` (user_id, role check in 5 roles, department null; pk (user_id, role))
  - `staff_punch` (same columns as `$SRC` `faculty_punch`, `user_id` instead of `faculty_id`, no FK to auth.users; unique (employee_code, punch_date))
  - view `staff_punch_days`
  - `attendance_holidays` (holiday_date pk, name, day_type check in (holiday, reduced_timing))
  - `leave_balances` (employee_id, year int, leave_type, allocated numeric; pk on all three except allocated)
  - `leave_requests` (id, employee_id fk, leave_type, from_date, to_date, is_half_day, session check in (FN, AN) null, days numeric, reason, status check, hod_by/at/remarks, principal_by/at/remarks, dean_by/at/remarks, created_at; check to_date >= from_date)
  - `regularizations` (id, employee_id, punch_date, requested_in, requested_out, reason, status pending/approved/rejected, reviewed_by, reviewed_at, remarks)
  - `payslips` (same columns as `$SRC` payslips; unique (employee_id, pay_year, pay_month))
- [ ] `types/db.ts`: a hand-written Kysely `DB` interface matching the schema (use `Generated<>` for defaults).
- [ ] `lib/db.ts`: lazy singleton `db` via Proxy so build-time import never connects. `DATABASE_URL`, `DATABASE_SSL`, and the date OID 1082 → string parser are kept from `$SRC`.
- [ ] typecheck PASS. Commit `feat: schema and db`.

### Task 3: Auth

**Files:** `lib/cognito-admin.ts` (port: initiateAuth, completeNewPasswordChallengePublic, refreshTokens, adminCreateUserWithTempPassword, getUserByEmail; client created lazily), `lib/auth.ts`, `lib/cognito-client.ts` (copy), `lib/auth-fetch.ts` (copy, plus an `api()` fetch wrapper), `app/api/auth/{signin,refresh,complete-new-password,me}/route.ts`, `app/login/page.tsx`, `components/portal-shell.tsx`, `hooks/use-me.ts`

**Interfaces produced:**
```ts
// lib/auth.ts
export type Role = 'staff' | 'hod' | 'principal' | 'dean' | 'hr';
export interface Me { userId: string; email: string | null; roles: Role[]; hodDepartment: string | null; employee: { id: string; full_name: string; employee_code: string | null; department: string | null; staff_type: string } | null }
export async function getMe(req: NextRequest): Promise<Me>              // 401 on bad token
export async function requireRole(req: NextRequest, role: Role): Promise<Me>  // 403 when missing
export function errorResponse(err: unknown): NextResponse                // { status, message } → JSON
// lib/auth-fetch.ts
export async function api<T>(path: string, init?: RequestInit): Promise<T> // adds Bearer, throws Error(message)
```
- [ ] `getMe` verifies the JWT against the Cognito JWKS (as in `$SRC/lib/auth-core.ts`). It loads `user_roles` and `employees` (by user_id, falling back to email, then backfilling user_id). Every user that has an employees row implicitly has `staff`.
- [ ] `/api/auth/me` GET → `Me`.
- [ ] `/login?portal=<role>`: email+password. On `NEW_PASSWORD_REQUIRED`, a new-password form is shown. After that, `storeSession`, then `/api/auth/me`. If the role is missing → "This account has no <role> access". Otherwise → `/<role>`.
- [ ] `app/page.tsx`: 5 portal cards → `/login?portal=…`.
- [ ] `PortalShell({ role, nav, children })`: a client guard using `useMe()`. With no session → `/login?portal=role`. With the role missing → access denied. Renders a sidebar nav + sign-out.
- [ ] build PASS. Commit `feat: cognito auth and portal shell`.

### Task 4: Leave workflow

**Files:** `lib/leave-flow.ts`, `lib/leave-flow.check.ts`, `lib/leave-service.ts`, `app/api/staff/leave/route.ts`, `app/api/staff/leave/[id]/route.ts` (cancel), `app/api/staff/leave-balances/route.ts`, `app/api/approvals/[role]/route.ts`, `app/api/approvals/[role]/[id]/route.ts`, `app/api/hr/leave/route.ts`, `app/api/hr/leave-balances/route.ts`, pages `app/staff/leave/page.tsx`, `components/approval-queue.tsx`, `app/{hod,principal,dean}/page.tsx`, `app/hr/leave/page.tsx`, `app/hr/leave-balances/page.tsx`

Pure module (the full code lives in the file; the key signatures):
```ts
export const LEAVE_TYPES = { CL: 'Casual Leave', SL: 'Sick Leave', EL: 'Earned Leave', OD: 'On Duty', CCL: 'Compensatory Off', ML: 'Maternity Leave' } as const;
export const HALF_DAY_TYPES = new Set(['CL', 'SL', 'OD', 'CCL']);
export type LeaveStatus = 'pending' | 'hod_approved' | 'principal_approved' | 'approved' | 'rejected' | 'cancelled';
export const IN_FLIGHT: LeaveStatus[] = ['pending', 'hod_approved', 'principal_approved'];
export const STEP: Record<'hod' | 'principal' | 'dean', { from: LeaveStatus; to: LeaveStatus }>;
export function initialStatus(applicantRoles: string[]): LeaveStatus;   // hod→hod_approved, principal|dean→principal_approved (dean's own leave: principal approves it)
export function requestedDays(from: string, to: string, halfDay: boolean): number;
export function daysByYear(from: string, to: string, halfDay: boolean): Map<number, number>;
export function checkRequest(i: { type: string; from: string; to: string; halfDay: boolean; available: Map<number, number | null> }): string | null;
export function canDecide(i: { approverRole: 'hod' | 'principal' | 'dean'; approverUserId: string; approverDept: string | null; applicantUserId: string | null; applicantDept: string | null; applicantIsDean: boolean; status: LeaveStatus }): string | null;
export function nextStatus(role, decision: 'approved' | 'rejected', applicantIsDean: boolean): LeaveStatus; // principal approving a dean's leave → 'approved'
```
- [ ] Write `leave-flow.check.ts` asserts first: the chain transitions, HOD self-start, dean's own leave finalised by the principal, cross-dept HOD rejected, self-approval rejected, half-day = 0.5, Dec 30 → Jan 2 split 2 / 2, insufficient balance message, `to < from` rejected. Run `node lib/leave-flow.check.ts` → FAIL (module missing).
- [ ] Implement `leave-flow.ts` → check PASS.
- [ ] `leave-service.ts`: `availableFor(employeeId, type, years)` = allocated − sum(days of approved+in-flight requests in that year). Returns null when there's no allocation row. Ponytail: types with no row are uncapped (OD/CCL).
- [ ] The decide route runs one `UPDATE … SET status, <role>_by/_at/_remarks WHERE id AND status = STEP.from RETURNING`. Zero rows → 409.
- [ ] Pages: staff apply form + my requests (status chain badges, cancel while in-flight); approval queue (approve/reject with remarks) reused by the 3 approver portals; HR leave register (approved, filter by month/dept); HR balances (allocate per employee/type/year).
- [ ] build PASS. Commit `feat: four-step leave approval`.

### Task 5: Attendance (biometric)

**Files:** `lib/hr-attendance.ts` (copy; doc mentions of college/faculty become hospital/staff; constants unchanged; `isSunday` kept), `lib/hr-attendance.check.ts` (copy, import paths fixed), `lib/punch-sheet.ts` (copy), `lib/attendance-service.ts`, `app/api/hr/attendance/upload/route.ts`, `app/api/hr/attendance/route.ts`, `app/api/hr/holidays/route.ts`, `app/api/staff/attendance/route.ts`, `components/attendance-table.tsx`, pages `app/hr/attendance/page.tsx`, `app/hr/attendance/upload/page.tsx`, `app/hr/holidays/page.tsx`, `app/staff/attendance/page.tsx`

- [ ] `node lib/hr-attendance.check.ts` → PASS after the copy.
- [ ] `attendance-service.ts`: `employeeAttendance(code, from, to)` loads punches, holidays, and approved-leave coverage (whole/0.5 by date), then calls `deriveAttendance`.
- [ ] The upload route is a port of `$SRC/app/api/attendance-office/upload/route.ts` minus the auth.users FK retry. Auth = hr. The page parses client-side with `parsePunchSheet`, previews, then POSTs.
- [ ] Staff attendance: the month picker shows a summary tile row + derived table.
- [ ] HR attendance: pick an employee + month → same table; day list of imports.
- [ ] build PASS. Commit `feat: biometric attendance`.

### Task 6: Regularizations

**Files:** `app/api/staff/regularizations/route.ts`, `app/api/hr/regularizations/route.ts`, pages `app/staff/regularizations/page.tsx`, `app/hr/regularizations/page.tsx`

- [ ] Staff: request for a past date (with punch times + reason). One pending per date is enforced in the route.
- [ ] HR approve → upsert `staff_punch` for (code, date) with status `Present (Regularized)` and the requested times. Conditional update on `status='pending'`.
- [ ] build PASS. Commit `feat: regularizations`.

### Task 7: HR employees + logins

**Files:** `app/api/hr/employees/route.ts`, `app/api/hr/employees/[id]/route.ts`, `app/api/hr/employees/[id]/login/route.ts`, `app/api/hr/overview/route.ts`, pages `app/hr/page.tsx` (overview counts), `app/hr/employees/page.tsx`, `app/hr/employees/[id]/page.tsx`

- [ ] CRUD with zod validation. Code is uppercased and email lowercased.
- [ ] "Create login": `adminCreateUserWithTempPassword(email, temp)` → set employees.user_id. Roles editor: staff is implicit; hod (+department), principal, dean, hr.
- [ ] Overview: active headcount by staff_type and department, pending approvals per stage, today's present/absent from staff_punch.
- [ ] build PASS. Commit `feat: hr employees and logins`.

### Task 8: Payroll (view-only, as source)

**Files:** `app/api/staff/payslips/route.ts`, `app/api/hr/payslips/route.ts`, pages `app/staff/payslips/page.tsx`, `app/hr/payslips/page.tsx`

- [ ] Staff: own payslips newest first, printable card (`window.print`).
- [ ] HR: list by month/year with employee name. Read-only, since rows are loaded by DB import as in the source.
- [ ] build PASS. Commit `feat: payslips`.

### Task 9: Staff home + profile, README, final verification

- [ ] `app/staff/page.tsx`: this month's attendance summary, leave balances, latest request statuses.
- [ ] `README.md`: env setup, Cognito pool requirements (USER_PASSWORD_AUTH enabled, no client secret), applying `sql/schema.sql`, bootstrapping the first HR user (SQL snippet), the leave chain.
- [ ] `npm run check && npm run typecheck && npm run lint && npm run build` → all PASS.
- [ ] `grep -ri "mlrit\|supabase" .` (excluding node_modules/.next/docs) → none.
- [ ] Commit, add remote `origin` = arundhati-erp, **ask the user**, then `git push -u origin main`.

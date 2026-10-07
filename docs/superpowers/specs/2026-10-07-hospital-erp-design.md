# Arundhati Hospital ERP — Design

Date: 2026-10-07
Source codebase: `campus-companion` (MLRIT college ERP)
Target repo: https://github.com/arundhatiproject26-lgtm/arundhati-erp.git (branch `main`)

## Goal

A standalone staff ERP for Arundhati hospital / medical college covering login, HR,
attendance (biometric punch), leave, and payroll. It is built by porting the matching
modules out of campus-companion. College-only features (students, grades, timetable,
hostel, transport, feedback, …) are left behind.

Success means:
- `npm run build` and `npm run typecheck` pass with no DB connected.
- The code runs once someone fills in `.env.local` (Postgres + Cognito) and applies `sql/schema.sql`.
- No MLRIT data, people, migrations, or git history are present in the repo.

## Scope decisions (agreed)

| Topic | Decision |
|---|---|
| Backend | Code only. No DB or AWS gets provisioned. `.env.example` + `sql/schema.sql` are shipped. |
| Auth | AWS Cognito, same as campus-companion (`auth-core`, `cognito-client`, `cognito-admin`). |
| Data access | Postgres via Kysely (`lib/db.ts`), same as the source. |
| Punch | HR uploads the biometric machine Excel export. Staff get a read-only view. No web punch button. |
| Payroll | Same as the source. Staff view their own payslips, read from `payslips` + `hr_employees`. The repo has no payroll generator, and none is built. |
| Stack | Next.js App Router (the version from the source), Shadcn UI, TanStack Query, Tailwind. |

## Roles and portals

Every role has its own login page and route tree. Role membership comes from the `user_roles` table.

| Role | Route | Can do |
|---|---|---|
| staff (faculty + non-teaching; `staff_type` column) | `/staff` | dashboard, my attendance (punch view), apply leave and track it, leave balances, regularization requests, payslips, profile |
| hod (per department) | `/hod` | approve or reject `pending` leave from own-department staff |
| principal | `/principal` | approve or reject `hod_approved` leave |
| dean | `/dean` | approve or reject `principal_approved` leave (this is the final step) |
| hr | `/hr` | employees CRUD, biometric Excel upload, attendance view, holidays, leave register (approved only), leave balances, regularizations, payslips list |

A user can hold several roles. For example, a HOD is also staff and applies for their own leave.

## Leave workflow

```
pending ──HOD──▶ hod_approved ──Principal──▶ principal_approved ──Dean──▶ approved
   │                 │                            │
   └──────── rejected (any approver, with remarks) ┘
```

- Each transition is one conditional `UPDATE … WHERE id = $1 AND status = <expected>`. If zero rows
  come back, the API returns 409 ("already actioned"). This is the race guard the source already uses.
- Each step records `<role>_remarks`, `<role>_by`, and `<role>_at`.
- A HOD who applies for their own leave skips the HOD step: the request is created as `hod_approved`.
- HR sees only `approved` requests. They count in attendance as leave days, the same way
  `approvedLeaveDatesForCode` works today.
- Balance and leave-type rules come from `lib/leave-rules.ts` and `lib/faculty-leave-account.ts`, renamed to `staff-*`.

## Attendance

- `lib/hr-attendance.ts` is ported unchanged. It turns punch in/out times into
  present / late / half-day / absent.
- The attendance-office Excel upload moves to `/hr/attendance/upload`. Rows are keyed by `employee_code`.
- Staff resolve to their biometric code through `hr_employees.user_id` (email fallback).
  The MLRIT name-matching heuristics in `faculty-code.ts` are dropped.
- Regularizations (staff request → HR approve) are ported.
- Holidays: `attendance_holidays` table, managed by HR.

## Data model (`sql/schema.sql`)

`hr_employees` (code, name, email, user_id, department, designation, staff_type, joining_date,
salary fields), `user_roles` (user_id, role, department), `staff_punch`, `attendance_holidays`,
`leave_requests` (status machine above), `leave_balances`, `regularizations`, `payslips`.
These are column-compatible with the source tables, renamed only where the name was `faculty_*`.

## Code layout

```
app/{page.tsx (portal picker), staff, hod, principal, dean, hr}/…
app/api/{auth, staff, hod, principal, dean, hr}/…
lib/{auth-core, cognito-*, db, require-role, hr-attendance, leave-rules, staff-leave-*}.ts
components/ui/ (Shadcn, copied)   sql/schema.sql   .env.example
```

The source has about 15 per-portal auth files (`hod-auth`, `dean-auth`, `hr-auth`, …). They are replaced by one
`requireRole(request, role)` that verifies the Cognito token and checks `user_roles`.

## Testing

- The existing `*.check.ts` self-checks for `leave-rules` and `hr-attendance` are ported, plus one new
  check for the leave state machine (valid and invalid transitions).
- `npm run build` and `npm run typecheck` must be clean.

## Out of scope

Payroll generation, the web punch button, notifications/SMS/push, PostHog, and any MLRIT data or scripts.
Each of these can be added later as its own change.

-- Arundhati ERP schema. Apply once to an empty Postgres database:
--   psql "$DATABASE_URL" -f sql/schema.sql
-- Logins live in AWS Cognito; user_id columns hold the Cognito `sub`.

create extension if not exists pgcrypto;

-- Employees (faculty + non-teaching) ----------------------------------------
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,                       -- Cognito sub, set when HR creates the login
  email text not null unique,                -- stored lowercase
  full_name text not null,
  employee_code text unique,                 -- biometric code, stored uppercase
  department text,
  designation text,
  staff_type text not null default 'faculty' check (staff_type in ('faculty', 'non_teaching')),
  employment_type text not null default 'full-time' check (employment_type in ('full-time', 'part-time', 'contract', 'visiting')),
  status text not null default 'active' check (status in ('active', 'on-leave', 'resigned', 'terminated')),
  date_of_joining date,
  phone text,
  -- Salary structure, shown on payslips
  basic_salary numeric(12,2) not null default 0,
  hra numeric(12,2) not null default 0,
  allowances numeric(12,2) not null default 0,
  pf_deduction numeric(12,2) not null default 0,
  tax_deduction numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employees_department_idx on employees (department);

-- Portal access. Anyone with an employees row is implicitly "staff".
-- department is required for hod (the department whose leave they approve).
create table if not exists user_roles (
  user_id uuid not null,
  role text not null check (role in ('staff', 'hod', 'principal', 'dean', 'hr')),
  department text,
  primary key (user_id, role),
  check (role <> 'hod' or department is not null)
);

-- Biometric punches, imported by HR from the device's Excel export.
-- Times are "HH:MM" text exactly as the device reports them.
create table if not exists staff_punch (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  employee_code text not null,
  employee_name text,
  punch_date date not null,
  punch_in text,
  punch_out text,
  status text,               -- Present | Absent | Present (No OutPunch) | ½Present | WeeklyOff… | Present (Regularized)
  department text,
  work_duration text,
  overtime text,
  total_duration text,
  created_at timestamptz not null default now(),
  unique (employee_code, punch_date)
);
create index if not exists staff_punch_date_idx on staff_punch (punch_date);

create or replace view staff_punch_days as
select punch_date, count(*)::int as rows, max(created_at) as last_upload
from staff_punch
group by punch_date;

-- Declared holidays. reduced_timing days still count as working days.
create table if not exists attendance_holidays (
  holiday_date date primary key,
  name text not null,
  day_type text not null default 'holiday' check (day_type in ('holiday', 'reduced_timing'))
);

-- Leave ----------------------------------------------------------------------
-- Days HR allocates per employee, leave type and calendar year. A type with no
-- row for that year is uncapped (e.g. OD).
create table if not exists leave_balances (
  employee_id uuid not null references employees(id) on delete cascade,
  year int not null,
  leave_type text not null,
  allocated numeric(5,1) not null check (allocated >= 0),
  primary key (employee_id, year, leave_type)
);

-- Chain: pending -> hod_approved -> principal_approved -> approved (Dean final).
create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  leave_type text not null,
  from_date date not null,
  to_date date not null,
  is_half_day boolean not null default false,
  session text check (session in ('FN', 'AN')),
  days numeric(5,1) not null,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'hod_approved', 'principal_approved', 'approved', 'rejected', 'cancelled')),
  hod_by uuid, hod_at timestamptz, hod_remarks text,
  principal_by uuid, principal_at timestamptz, principal_remarks text,
  dean_by uuid, dean_at timestamptz, dean_remarks text,
  created_at timestamptz not null default now(),
  check (to_date >= from_date),
  check (not is_half_day or (from_date = to_date and session is not null))
);
create index if not exists leave_requests_status_idx on leave_requests (status);
create index if not exists leave_requests_employee_idx on leave_requests (employee_id, from_date);

-- Attendance regularization: staff ask, HR approves (rewrites the punch row).
create table if not exists regularizations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  punch_date date not null,
  requested_in text not null,
  requested_out text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  remarks text,
  created_at timestamptz not null default now()
);
create unique index if not exists regularizations_one_pending
  on regularizations (employee_id, punch_date) where status = 'pending';

-- Payslips (loaded by HR / finance import; staff view them).
create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  pay_month int not null check (pay_month between 1 and 12),
  pay_year int not null,
  basic_salary numeric(12,2) not null default 0,
  hra numeric(12,2) not null default 0,
  allowances numeric(12,2) not null default 0,
  incentive_total numeric(12,2) not null default 0,
  pf_deduction numeric(12,2) not null default 0,
  tax_deduction numeric(12,2) not null default 0,
  other_deductions numeric(12,2) not null default 0,
  net_pay numeric(12,2) not null default 0,
  status text not null default 'generated' check (status in ('draft', 'generated', 'paid')),
  generated_at timestamptz not null default now(),
  paid_at timestamptz,
  remarks text,
  unique (employee_id, pay_year, pay_month)
);

-- Bootstrapping the first HR login -------------------------------------------
-- 1. Create the user in the Cognito console (email + temporary password).
-- 2. Copy its `sub`, then:
--   insert into employees (email, full_name, user_id, staff_type)
--     values ('hr@example.com', 'HR Office', '<sub>', 'non_teaching');
--   insert into user_roles (user_id, role) values ('<sub>', 'hr');
-- 3. Sign in at /login?portal=hr — every other login is created from the HR portal.

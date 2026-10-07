// Kysely table types for sql/schema.sql. Keep in sync by hand.
import type { ColumnType, Generated } from 'kysely';

type Numeric = ColumnType<string, string | number, string | number>;
type Timestamp = ColumnType<Date, Date | string, Date | string>;
// Columns with a DB default: optional on insert. (Generated<ColumnType<…>> does
// not compose in Kysely, so these are spelled out.)
type NumericDefault = ColumnType<string, string | number | undefined, string | number>;
type TimestampDefault = ColumnType<Date, Date | string | undefined, Date | string>;

export interface Employees {
  id: Generated<string>;
  user_id: string | null;
  email: string;
  full_name: string;
  employee_code: string | null;
  department: string | null;
  designation: string | null;
  staff_type: Generated<string>;
  employment_type: Generated<string>;
  status: Generated<string>;
  date_of_joining: string | null;
  phone: string | null;
  basic_salary: NumericDefault;
  hra: NumericDefault;
  allowances: NumericDefault;
  pf_deduction: NumericDefault;
  tax_deduction: NumericDefault;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

export interface UserRoles {
  user_id: string;
  role: string;
  department: string | null;
}

export interface StaffPunch {
  id: Generated<string>;
  user_id: string | null;
  employee_code: string;
  employee_name: string | null;
  punch_date: string;
  punch_in: string | null;
  punch_out: string | null;
  status: string | null;
  department: string | null;
  work_duration: string | null;
  overtime: string | null;
  total_duration: string | null;
  created_at: TimestampDefault;
}

export interface StaffPunchDays {
  punch_date: string;
  rows: number;
  last_upload: Date;
}

export interface AttendanceHolidays {
  holiday_date: string;
  name: string;
  day_type: Generated<string>;
}

export interface LeaveBalances {
  employee_id: string;
  year: number;
  leave_type: string;
  allocated: Numeric;
}

export interface LeaveRequests {
  id: Generated<string>;
  employee_id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  is_half_day: Generated<boolean>;
  session: string | null;
  days: Numeric;
  reason: string;
  status: Generated<string>;
  hod_by: string | null;
  hod_at: Timestamp | null;
  hod_remarks: string | null;
  principal_by: string | null;
  principal_at: Timestamp | null;
  principal_remarks: string | null;
  dean_by: string | null;
  dean_at: Timestamp | null;
  dean_remarks: string | null;
  created_at: TimestampDefault;
}

export interface Regularizations {
  id: Generated<string>;
  employee_id: string;
  punch_date: string;
  requested_in: string;
  requested_out: string;
  reason: string;
  status: Generated<string>;
  reviewed_by: string | null;
  reviewed_at: Timestamp | null;
  remarks: string | null;
  created_at: TimestampDefault;
}

export interface Payslips {
  id: Generated<string>;
  employee_id: string;
  pay_month: number;
  pay_year: number;
  basic_salary: NumericDefault;
  hra: NumericDefault;
  allowances: NumericDefault;
  incentive_total: NumericDefault;
  pf_deduction: NumericDefault;
  tax_deduction: NumericDefault;
  other_deductions: NumericDefault;
  net_pay: NumericDefault;
  status: Generated<string>;
  generated_at: TimestampDefault;
  paid_at: Timestamp | null;
  remarks: string | null;
}

export interface DB {
  employees: Employees;
  user_roles: UserRoles;
  staff_punch: StaffPunch;
  staff_punch_days: StaffPunchDays;
  attendance_holidays: AttendanceHolidays;
  leave_balances: LeaveBalances;
  leave_requests: LeaveRequests;
  regularizations: Regularizations;
  payslips: Payslips;
}

// DB-backed leave queries shared by the staff, approver, HR and attendance routes.
import { db } from '@/lib/db';
import { COUNTED, daysByYear, LEAVE_TYPES, type LeaveStatus } from '@/lib/leave-flow';

const yearStart = (y: number) => `${y}-01-01`;
const yearEnd = (y: number) => `${y}-12-31`;

interface DayRow {
  leave_type: string;
  from_date: string;
  to_date: string;
  is_half_day: boolean;
  status: string;
}

async function countedRows(employeeId: string, years: number[], excludeId?: string): Promise<DayRow[]> {
  if (years.length === 0) return [];
  let q = db
    .selectFrom('leave_requests')
    .select(['leave_type', 'from_date', 'to_date', 'is_half_day', 'status'])
    .where('employee_id', '=', employeeId)
    .where('status', 'in', COUNTED)
    .where('to_date', '>=', yearStart(Math.min(...years)))
    .where('from_date', '<=', yearEnd(Math.max(...years)));
  if (excludeId) q = q.where('id', '!=', excludeId);
  return q.execute();
}

export interface BalanceLine {
  leave_type: string;
  label: string;
  allocated: number | null; // null = no allocation row: uncapped
  approved: number;
  in_flight: number;
  left: number | null;
}

/** Per-type balance for one employee and year. Pending requests reserve days too. */
export async function balancesFor(employeeId: string, year: number): Promise<BalanceLine[]> {
  const [alloc, rows] = await Promise.all([
    db.selectFrom('leave_balances').select(['leave_type', 'allocated'])
      .where('employee_id', '=', employeeId).where('year', '=', year).execute(),
    countedRows(employeeId, [year]),
  ]);
  const allocated = new Map(alloc.map((a) => [a.leave_type, Number(a.allocated)]));
  return Object.entries(LEAVE_TYPES).map(([type, label]) => {
    let approved = 0;
    let inFlight = 0;
    for (const r of rows) {
      if (r.leave_type !== type) continue;
      const d = daysByYear(r.from_date, r.to_date, r.is_half_day).get(year) ?? 0;
      if (r.status === 'approved') approved += d;
      else inFlight += d;
    }
    const a = allocated.has(type) ? allocated.get(type)! : null;
    return { leave_type: type, label, allocated: a, approved, in_flight: inFlight, left: a === null ? null : a - approved - inFlight };
  });
}

/** Days left of `type` for each year, as checkRequest() wants them. */
export async function availableFor(employeeId: string, type: string, years: number[]): Promise<Map<number, number | null>> {
  const [alloc, rows] = await Promise.all([
    db.selectFrom('leave_balances').select(['year', 'allocated'])
      .where('employee_id', '=', employeeId).where('leave_type', '=', type).where('year', 'in', years).execute(),
    countedRows(employeeId, years),
  ]);
  const out = new Map<number, number | null>();
  for (const y of years) {
    const row = alloc.find((a) => a.year === y);
    if (!row) {
      out.set(y, null);
      continue;
    }
    const used = rows
      .filter((r) => r.leave_type === type)
      .reduce((n, r) => n + (daysByYear(r.from_date, r.to_date, r.is_half_day).get(y) ?? 0), 0);
    out.set(y, Number(row.allocated) - used);
  }
  return out;
}

/** True when any counted request of this employee overlaps [from, to]. */
export async function overlapsExisting(employeeId: string, from: string, to: string): Promise<boolean> {
  const hit = await db
    .selectFrom('leave_requests')
    .select('id')
    .where('employee_id', '=', employeeId)
    .where('status', 'in', COUNTED)
    .where('from_date', '<=', to)
    .where('to_date', '>=', from)
    .executeTakeFirst();
  return Boolean(hit);
}

/**
 * Approved leave coverage by date for attendance: 1 for a whole day, 0.5 for
 * a half day (two half days on one date add up to 1).
 */
export async function approvedLeaveCoverage(employeeId: string, from: string, to: string): Promise<Map<string, number>> {
  const rows = await db
    .selectFrom('leave_requests')
    .select(['from_date', 'to_date', 'is_half_day'])
    .where('employee_id', '=', employeeId)
    .where('status', '=', 'approved' satisfies LeaveStatus)
    .where('from_date', '<=', to)
    .where('to_date', '>=', from)
    .execute();
  const out = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(`${r.from_date}T00:00:00Z`);
    const end = new Date(`${r.to_date}T00:00:00Z`);
    for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      if (key < from || key > to) continue;
      out.set(key, Math.min(1, (out.get(key) ?? 0) + (r.is_half_day ? 0.5 : 1)));
    }
  }
  return out;
}

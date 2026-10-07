// Leave approval chain and request rules. Pure — no DB, no I/O — so the same
// checks run in the apply form and in the API route, and in leave-flow.check.ts.
//
//   pending ──HOD──▶ hod_approved ──Principal──▶ principal_approved ──Dean──▶ approved
//   any approver may reject instead; the applicant may cancel while in flight.
//
// A HOD's own leave starts at hod_approved. A principal's starts at
// principal_approved (Dean decides). A dean's own leave starts at hod_approved
// and the Principal's approval is final, since nobody approves their own leave.

export const LEAVE_TYPES = {
  CL: 'Casual Leave',
  SL: 'Sick Leave',
  EL: 'Earned Leave',
  OD: 'On Duty',
  CCL: 'Compensatory Off',
  ML: 'Maternity Leave',
} as const;
export type LeaveType = keyof typeof LEAVE_TYPES;

export const HALF_DAY_TYPES = new Set<string>(['CL', 'SL', 'OD', 'CCL']);

export type LeaveStatus = 'pending' | 'hod_approved' | 'principal_approved' | 'approved' | 'rejected' | 'cancelled';
export type ApproverRole = 'hod' | 'principal' | 'dean';

export const IN_FLIGHT: LeaveStatus[] = ['pending', 'hod_approved', 'principal_approved'];
/** Statuses whose days count against the balance. */
export const COUNTED: LeaveStatus[] = [...IN_FLIGHT, 'approved'];

export const STEP: Record<ApproverRole, { from: LeaveStatus; to: LeaveStatus }> = {
  hod: { from: 'pending', to: 'hod_approved' },
  principal: { from: 'hod_approved', to: 'principal_approved' },
  dean: { from: 'principal_approved', to: 'approved' },
};

export const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: 'Awaiting HOD',
  hod_approved: 'Awaiting Principal',
  principal_approved: 'Awaiting Dean',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

export function initialStatus(applicantRoles: string[]): LeaveStatus {
  if (applicantRoles.includes('principal')) return 'principal_approved';
  if (applicantRoles.includes('hod') || applicantRoles.includes('dean')) return 'hod_approved';
  return 'pending';
}

export function nextStatus(role: ApproverRole, decision: 'approved' | 'rejected', applicantIsDean: boolean): LeaveStatus {
  if (decision === 'rejected') return 'rejected';
  if (role === 'principal' && applicantIsDean) return 'approved';
  return STEP[role].to;
}

export interface DecideInput {
  approverRole: ApproverRole;
  approverUserId: string;
  /** The HOD's department; ignored for principal/dean. */
  approverDept: string | null;
  applicantUserId: string | null;
  applicantDept: string | null;
  applicantIsDean: boolean;
  status: LeaveStatus;
}

/** Why this approver may not act on this request, or null when they may. */
export function canDecide(i: DecideInput): string | null {
  if (i.applicantUserId && i.applicantUserId === i.approverUserId) return 'You cannot decide your own leave.';
  if (i.status !== STEP[i.approverRole].from) {
    if (!IN_FLIGHT.includes(i.status)) return `This request is already ${i.status}.`;
    return IN_FLIGHT.indexOf(i.status) > IN_FLIGHT.indexOf(STEP[i.approverRole].from)
      ? 'This request has already been actioned at your step.'
      : 'This request has not reached your step yet.';
  }
  if (i.approverRole === 'dean' && i.applicantIsDean) return 'You cannot decide your own leave.';
  if (i.approverRole === 'hod' && norm(i.approverDept) !== norm(i.applicantDept)) {
    return 'This request is from another department.';
  }
  return null;
}

const norm = (s: string | null) => (s ?? '').trim().toLowerCase();

const DAY_MS = 86_400_000;

/** YYYY-MM-DD that exists on the calendar (rejects 2026-02-31, 2026-13-01). */
export function isRealDate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = Date.parse(`${d}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d;
}
const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Calendar days a request covers; a half day is 0.5. */
export function requestedDays(from: string, to: string, halfDay: boolean): number {
  if (halfDay) return 0.5;
  const a = parse(from);
  const b = parse(to);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.round((b - a) / DAY_MS) + 1;
}

/** Days per calendar year, so a Dec→Jan request draws on both years' balances. */
export function daysByYear(from: string, to: string, halfDay: boolean): Map<number, number> {
  const out = new Map<number, number>();
  if (halfDay) return out.set(Number(from.slice(0, 4)), 0.5);
  const a = parse(from);
  const b = parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return out;
  for (let t = a; t <= b; t += DAY_MS) {
    const y = new Date(t).getUTCFullYear();
    out.set(y, (out.get(y) ?? 0) + 1);
  }
  return out;
}

export interface RequestInput {
  type: string;
  from: string;
  to: string;
  halfDay: boolean;
  /** Days left per year this request touches; null = no allocation, uncapped. */
  available: Map<number, number | null>;
}

/** Why this request cannot be filed, or null when it can. Runs on form and server. */
export function checkRequest(r: RequestInput): string | null {
  if (!(r.type in LEAVE_TYPES)) return 'Choose a valid leave type.';
  if (!isRealDate(r.from) || !isRealDate(r.to)) return 'Choose a valid date.';
  if (r.to < r.from) return 'The end date is before the start date.';
  if (r.halfDay) {
    if (!HALF_DAY_TYPES.has(r.type)) return `A half day cannot be taken as ${LEAVE_TYPES[r.type as LeaveType]}.`;
    if (r.from !== r.to) return 'A half day must be a single day.';
  }
  const label = LEAVE_TYPES[r.type as LeaveType];
  for (const [year, days] of daysByYear(r.from, r.to, r.halfDay)) {
    const left = r.available.get(year) ?? null;
    if (left === null) continue;
    if (left <= 0) return `You have no ${label} left for ${year}.`;
    if (days > left) return `You have ${left} ${label} left for ${year} — this request needs ${days}.`;
  }
  return null;
}

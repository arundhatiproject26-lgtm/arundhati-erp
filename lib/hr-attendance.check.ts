// Self-check for the Late/LOP rule (Revised Staff Leave Rules 2024).
// Run: node lib/hr-attendance.check.ts
import assert from 'node:assert/strict';
import { deriveAttendance, isLopEvent, HOD_PUNCTUALITY_ALLOWANCE, type AttendanceSummary } from './hr-attendance.ts';

// 1st, 2nd punctuality event of a month are free; past that the charge
// alternates — 3rd, 5th, 7th … cost half a day, 4th, 6th, 8th … ride free on
// the one before. It keeps alternating for as long as the month does, so the
// 11th and 13th are charged too and there is no escalation to a full day.
assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => isLopEvent(n)),
  [false, false, true, false, true, false, true, false, true, false, true, false, true]);
// An HOD gets 5 free; the 6th is the first charge, then it alternates as usual.
assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => isLopEvent(n, HOD_PUNCTUALITY_ALLOWANCE)),
  [false, false, false, false, false, true, false, true, false]);

const late = (day: number) => ({
  id: `d${day}`, punch_date: `2026-07-${String(day).padStart(2, '0')}`,
  punch_in: '09:35', punch_out: '17:00', status: 'Present',
  work_duration: null, overtime: null, total_duration: null,
});

/**
 * The day-counting fields, for whole-summary assertions. Named explicitly so
 * adding a field to AttendanceSummary does not silently change what these
 * assert — a new figure has to be added here (and reasoned about) to be checked.
 */
const CORE = ['total_days', 'present', 'absent', 'on_leave', 'half_day', 'no_out_punch',
  'late', 'early', 'single_punch', 'lop', 'lop_days', 'weekly_off_worked', 'holidays',
  'holiday_worked'] as const;
const core = (s: AttendanceSummary) =>
  Object.fromEntries(CORE.map((k) => [k, s[k]]));
/** Every buckets figure at zero, so a case need only state what it expects to move. */
const NONE = { total_days: 0, present: 0, absent: 0, on_leave: 0, half_day: 0, no_out_punch: 0,
  late: 0, early: 0, single_punch: 0, lop: 0, lop_days: 0, weekly_off_worked: 0, holidays: 0,
  holiday_worked: 0 };

// Seven late days in one month (skipping Sunday the 5th), fed in reverse order — order must not matter.
const { rows, summary } = deriveAttendance([1, 2, 3, 4, 6, 7, 8].map(late).reverse());
const byDay = new Map(rows.map((r) => [r.id, r.display_status]));
assert.deepEqual([1, 2, 3, 4, 6, 7, 8].map((d) => byDay.get(`d${d}`)),
  ['Late', 'Late', 'Late (LOP)', 'Late', 'Late (LOP)', 'Late', 'Late (LOP)']);
assert.equal(summary.late, 7);
assert.equal(summary.lop, 3);          // the 3rd, 5th and 7th only
assert.equal(summary.lop_days, 1.5);   // each LOP is a half day: 3 LOPs = 1.5 days

// Grace resets per calendar month: one late in July, one in August, neither is LOP.
const twoMonths = deriveAttendance([
  { ...late(3), id: 'jul' },
  { ...late(3), id: 'aug', punch_date: '2026-08-03' },
]);
assert.equal(twoMonths.summary.lop, 0);

// 09:20 sharp is still on time (grace ends just AFTER 09:20, per LATE_START_MIN);
// 09:51 is past the 30-minute window, so it's a half day, not a Late.
const edges = deriveAttendance([
  { ...late(10), id: 'ontime', punch_in: '09:20' },
  { ...late(11), id: 'verylate', punch_in: '09:51' },
]);
const edgeStatus = new Map(edges.rows.map((r) => [r.id, r.display_status]));
assert.equal(edgeStatus.get('ontime'), 'Present');
assert.equal(edges.summary.late, 0);
assert.equal(edges.summary.half_day, 1);

// Week offs (Sundays) are shown but never counted — not present, not absent,
// not half day, not no-out-punch, not late, and not in total_days.
const sundays = deriveAttendance([
  { ...late(19), id: 'off-idle', status: 'WeeklyOff', punch_in: null, punch_out: null },
  { ...late(26), id: 'off-worked', status: 'WeeklyOff Present' },
  { ...late(12), id: 'off-half', status: 'WeeklyOff ½Present' },
  { ...late(5), id: 'off-noout', status: 'WeeklyOff Present (No OutPunch)', punch_out: null },
  { ...late(20), id: 'workday', status: 'Present' },
]);
assert.deepEqual(core(sundays.summary),
  { ...NONE, total_days: 1, present: 1, late: 1, weekly_off_worked: 3 });
assert.equal(sundays.rows.length, 5); // every row still returned for display

// A Sunday is a week off even when the device says "Absent" or it was marked
// a holiday (2026-07-19 is a Sunday).
const sunAbsent = deriveAttendance([
  { ...late(19), id: 'sun-absent', status: 'Absent', punch_in: null, punch_out: null },
], ['2026-07-19']);
assert.deepEqual(core(sunAbsent.summary), { ...NONE, total_days: 0 });
assert.equal(sunAbsent.rows[0].is_weekly_off, true);
assert.equal(sunAbsent.rows[0].is_holiday, false);
assert.equal(sunAbsent.rows[0].display_status, 'WeeklyOff');

// Declared holidays read like week offs. The biometric reports non-punchers
// "Absent" on them — that absence must not survive, and the one person who did
// come in must still show, with a late that no longer counts as a late.
const holiday = deriveAttendance([
  { ...late(14), id: 'hol-idle', status: 'Absent', punch_in: null, punch_out: null },
  { ...late(14), id: 'hol-worked' },        // punched in at 09:35 on the holiday
  { ...late(15), id: 'workday', status: 'Present' },
], ['2026-07-14']);
assert.deepEqual(core(holiday.summary),
  { ...NONE, total_days: 1, present: 1, late: 1, holidays: 2, holiday_worked: 1 });
const holStatus = new Map(holiday.rows.map((r) => [r.id, r.display_status]));
assert.equal(holStatus.get('hol-idle'), 'Holiday');          // not "Absent"
assert.equal(holStatus.get('hol-worked'), 'Holiday (worked)'); // came in anyway
assert.equal(holiday.rows.length, 3); // every row still returned for display

// Approved leave counts as present, not absent. The device reports "Absent" for
// the day nobody punched; the approval overrides it, the day stays a working day,
// and it must not also show up as a half day or a no-out-punch.
const leave = deriveAttendance([
  { ...late(6), id: 'leave-idle', status: 'Absent', punch_in: null, punch_out: null },
  { ...late(7), id: 'leave-half', status: '\u00bdPresent' },
  { ...late(8), id: 'leave-noout', status: 'Present (No OutPunch)', punch_out: null },
  { ...late(9), id: 'absent-no-leave', status: 'Absent', punch_in: null, punch_out: null },
], [], [], ['2026-07-06', '2026-07-07', '2026-07-08']);
// The one real absence costs a full day's pay; the three leave days cost nothing.
assert.deepEqual(core(leave.summary),
  { ...NONE, total_days: 4, present: 3, absent: 1, on_leave: 3, lop_days: 1 });
const leaveStatus = new Map(leave.rows.map((r) => [r.id, r.display_status]));
assert.equal(leaveStatus.get('leave-idle'), 'On Leave');            // not "Absent"
assert.equal(leaveStatus.get('leave-half'), 'On Leave (worked)');   // punched anyway
assert.equal(leaveStatus.get('absent-no-leave'), 'Absent');         // no leave, still absent

// A late punch on a leave day is not a late, so it can never become an LOP —
// nine lates that would otherwise include three LOPs all fall away.
const leaveLates = deriveAttendance(
  [1, 2, 3, 4, 6, 7, 8, 9, 10].map(late),
  [],
  [],
  [1, 2, 3, 4, 6, 7, 8, 9, 10].map((d) => `2026-07-${String(d).padStart(2, '0')}`),
);
// Approving leave after the fact is how a staff wins the pay back, and it
// moves the queue as well as the day: with five lates the 3rd and 5th are
// charged, but approve leave for the 3rd and it stops being an event at all —
// the remaining four lates are events 1-4 and only one charge is left.
const fiveLates = [1, 2, 3, 4, 6].map(late);
assert.equal(deriveAttendance(fiveLates).summary.lop_days, 1);
// The same five lates cost an HOD nothing.
const hodFive = deriveAttendance(fiveLates, [], [], [], HOD_PUNCTUALITY_ALLOWANCE).summary;
assert.equal(hodFive.lop_days, 0);
assert.equal(hodFive.punctuality_allowance, 5);
const leaveOnThird = deriveAttendance(fiveLates, [], [], ['2026-07-03']);
assert.equal(leaveOnThird.summary.late, 4);
assert.equal(leaveOnThird.summary.on_leave, 1);
assert.equal(leaveOnThird.summary.lop_days, 0.5);
assert.equal(leaveOnThird.rows[2].display_status, 'On Leave (worked)');

assert.equal(leaveLates.summary.late, 0);
assert.equal(leaveLates.summary.lop, 0);
assert.equal(leaveLates.summary.on_leave, 9);
assert.equal(leaveLates.summary.present, 9);

// A holiday outranks leave: leave taken on a day the hospital was shut is not a
// working day at all, so it is neither counted nor relabelled "On Leave".
const both = deriveAttendance(
  [{ ...late(14), id: 'shut', status: 'Absent', punch_in: null, punch_out: null }],
  ['2026-07-14'],
  [],
  ['2026-07-14'],
);
assert.equal(both.summary.total_days, 0);
assert.equal(both.summary.on_leave, 0);
assert.equal(both.summary.holidays, 1);
assert.equal(both.rows[0].display_status, 'Holiday');
assert.equal(both.rows[0].is_on_leave, false);

// Approved leave outranks a reduced-timing day: that day reads "did they punch
// at all", but an approval means they were not due in, so it is still present.
const leaveOnReduced = deriveAttendance(
  [{ ...late(15), id: 'reduced-leave', status: 'Absent', punch_in: null, punch_out: null }],
  [],
  ['2026-07-15'],
  ['2026-07-15'],
);
assert.equal(leaveOnReduced.summary.total_days, 1);   // still a working day
assert.equal(leaveOnReduced.summary.present, 1);
assert.equal(leaveOnReduced.summary.absent, 0);
assert.equal(leaveOnReduced.summary.on_leave, 1);
assert.equal(leaveOnReduced.rows[0].display_status, 'On Leave');

// A reduced-timing day with no leave is unaffected by any of the above.
const reducedOnly = deriveAttendance(
  [{ ...late(16), id: 'reduced-absent', status: 'Absent', punch_in: null, punch_out: null }],
  [],
  ['2026-07-16'],
);
assert.equal(reducedOnly.summary.absent, 1);
assert.equal(reducedOnly.summary.on_leave, 0);
assert.equal(reducedOnly.rows[0].display_status, 'Absent (Reduced Timing)');

// ── Shared punctuality allowance: 2 Late/Early events a month, in any mix ────
const early = (day: number) => ({ ...late(day), punch_in: '09:00', punch_out: '16:00' });

// Two lates then an early: the lates spend the allowance, so the early is the LOP.
const twoLatesThenEarly = deriveAttendance([late(1), late(2), early(3)]);
assert.equal(twoLatesThenEarly.summary.late, 2);
assert.equal(twoLatesThenEarly.summary.early, 1);
assert.equal(twoLatesThenEarly.summary.lop_late, 0);
assert.equal(twoLatesThenEarly.summary.lop_early, 1);
assert.equal(twoLatesThenEarly.summary.lop_days, 0.5);
assert.equal(twoLatesThenEarly.rows[2].display_status, 'Early (LOP)');

// Two earlies then a late: mirror image — the late is the one charged.
const twoEarliesThenLate = deriveAttendance([early(1), early(2), late(3)]);
assert.equal(twoEarliesThenLate.summary.lop_early, 0);
assert.equal(twoEarliesThenLate.summary.lop_late, 1);
assert.equal(twoEarliesThenLate.rows[2].display_status, 'Late (LOP)');

// One of each is free — that is the "1 early, 1 late" the policy allows.
const oneEach = deriveAttendance([late(1), early(2)]);
assert.equal(oneEach.summary.lop, 0);
assert.equal(oneEach.summary.lop_days, 0);
assert.deepEqual(oneEach.rows.map((r) => r.display_status), ['Late', 'Early']);

// The allowance is one shared pool, not two: 1 late + 1 early + 1 late means
// the third event is charged, even though neither kind reached 2 on its own.
const mixed = deriveAttendance([late(1), early(2), late(3)]);
assert.equal(mixed.summary.lop, 1);
assert.equal(mixed.summary.lop_late, 1);
assert.equal(mixed.rows[2].display_status, 'Late (LOP)');

// Order of the input must not change which events are charged.
assert.deepEqual(
  deriveAttendance([late(3), early(2), late(1)]).rows.map((r) => [r.id, r.display_status]).sort(),
  mixed.rows.map((r) => [r.id, r.display_status]).sort(),
);

// The allowance resets on the calendar month, same as the old late grace.
const acrossMonths = deriveAttendance([
  late(1), early(2),
  { ...late(1), id: 'aug-late', punch_date: '2026-08-01' },
  { ...early(2), id: 'aug-early', punch_date: '2026-08-02' },
]);
assert.equal(acrossMonths.summary.lop, 0);

// A day both late AND early spends two slots. Here they land on events 3 and 4,
// and the alternation charges only the odd one — the arrival, counted first.
const lateAndEarly = { ...late(4), punch_in: '09:35', punch_out: '16:00' };
const bothInOneDay = deriveAttendance([late(1), late(2), lateAndEarly]);
assert.equal(bothInOneDay.summary.lop_late, 1);
assert.equal(bothInOneDay.summary.lop_early, 0);
assert.equal(bothInOneDay.summary.lop_days, 0.5);
assert.equal(bothInOneDay.rows[2].display_status, 'Late + Early (LOP)');

// A consequence of the alternation worth pinning down: the two events of a
// late+early day are consecutive, so at most one of them is odd. Such a day can
// therefore never cost more than half a day, wherever in the month it falls —
// under the old "everything past the allowance" rule it cost a full one.
const straddler = { ...late(9), id: 'straddle', punch_in: '09:35', punch_out: '16:00' };
for (const before of [0, 1, 2, 3, 4, 5]) {
  const run = deriveAttendance([...[1, 2, 3, 4, 6].slice(0, before).map(late), straddler]);
  const day = run.rows.find((r) => r.id === 'straddle')!;
  assert.ok(!(day.late_is_lop && day.early_is_lop), `both halves charged after ${before} lates`);
}

// Only ONE of a late+early day's two events can fall past the allowance, and a
// per-bucket figure has to know which — hence the split flags rather than one.
const straddle = deriveAttendance([late(1), lateAndEarly]);
assert.deepEqual(
  [straddle.rows[1].is_lop, straddle.rows[1].late_is_lop, straddle.rows[1].early_is_lop],
  [true, false, true],   // late was event #2 (free), early was #3 (charged)
);
assert.equal(straddle.summary.lop_days, 0.5);
// Inside the allowance the same day is free, and says so.
assert.equal(deriveAttendance([lateAndEarly]).rows[0].display_status, 'Late + Early');

// 16:15 sharp is not early — the window closes just before it.
assert.equal(deriveAttendance([{ ...late(6), punch_in: '09:00', punch_out: '16:15' }]).summary.early, 0);
assert.equal(deriveAttendance([{ ...late(6), punch_in: '09:00', punch_out: '16:14' }]).summary.early, 1);

// ── Half day: (09:50, 12:50], always LOP, never spends a slot ────────────────
const halfDays = deriveAttendance([
  { ...late(1), id: 'h1', punch_in: '09:51' },
  { ...late(2), id: 'h2', punch_in: '12:50' },
  { ...late(3), id: 'h3', punch_in: '11:00' },
]);
assert.equal(halfDays.summary.half_day, 3);
assert.equal(halfDays.summary.lop_half_day, 3);
assert.equal(halfDays.summary.lop_days, 1.5);   // 0.5 each, no grace
assert.equal(halfDays.summary.lop, 0);          // spent no punctuality slots
assert.equal(halfDays.summary.late, 0);
assert.deepEqual(halfDays.rows.map((r) => r.display_status),
  ['Half Day (Late)', 'Half Day (Late)', 'Half Day (Late)']);

// Half day outranks Early: arriving at 11:00 is already charged, so leaving at
// 16:00 the same day adds no second penalty and spends no slot.
// A device ½Present day is a half day too — counted AND charged. It used to show
// in the Half Day tile while costing nothing (3 absent + 6 ½Present = 3 days lost).
const deviceHalf = deriveAttendance([
  { ...late(1), id: 'd1', status: '½Present', punch_in: '09:17', punch_out: '13:04' },
  { ...late(2), id: 'd2', status: '½Present', punch_in: '09:10', punch_out: '13:00' },
]);
assert.equal(deviceHalf.summary.half_day, 2);
assert.equal(deviceHalf.summary.lop_half_day, 2);
assert.equal(deviceHalf.summary.lop_days, 1);
assert.deepEqual(deviceHalf.rows.map((r) => r.is_half_day), [true, true]);

const halfAndEarly = deriveAttendance([{ ...late(6), punch_in: '11:00', punch_out: '16:00' }]);
assert.equal(halfAndEarly.summary.early, 0);
assert.equal(halfAndEarly.summary.lop_days, 0.5);

// Early going is allowed only 15:30–16:15; leaving before 15:30 is a half day,
// not an Early: 13:20 out costs half a day and spends no punctuality slot.
const earlyHalf = deriveAttendance([
  { ...late(7), id: 'e1', punch_in: '08:54', punch_out: '13:20' },
  { ...late(8), id: 'e2', punch_in: '08:54', punch_out: '15:30' },
  { ...late(9), id: 'e3', punch_in: '08:54', punch_out: '15:29' },
]);
assert.deepEqual(earlyHalf.rows.map((r) => r.display_status), ['Half Day (Early)', 'Early', 'Half Day (Early)']);
assert.equal(earlyHalf.summary.half_day, 2);
assert.equal(earlyHalf.summary.early, 1);
assert.equal(earlyHalf.summary.lop_days, 1);   // two half days; the one Early is free

// In after 09:50 AND out before 15:30 misses both halves: a full-day absence,
// even when the device called it ½Present (12-09-2026: 11:18–13:55).
const bothHalves = deriveAttendance([
  { ...late(10), id: 'b1', status: '½Present', punch_in: '11:18', punch_out: '13:55' },
  { ...late(11), id: 'b2', punch_in: '10:05', punch_out: '15:00' },
  { ...late(13), id: 'b3', status: '½Present', punch_in: '09:17', punch_out: '13:04' }, // one half only
]);
assert.deepEqual(bothHalves.rows.map((r) => r.display_status),
  ['Absent (Late In + Early Out)', 'Absent (Late In + Early Out)', '½Present']);
assert.equal(bothHalves.summary.absent, 2);
assert.equal(bothHalves.summary.half_day, 1);
assert.equal(bothHalves.summary.lop_days, 2.5);

// Two free lates do not buy a cheap half day — the half day is charged anyway.
const latesThenHalf = deriveAttendance([late(1), late(2), { ...late(3), punch_in: '10:30' }]);
assert.equal(latesThenHalf.summary.lop_days, 0.5);

// ── One punch is a full-day absence ──────────────────────────────────────────
const singles = deriveAttendance([
  { ...late(1), id: 'in-only', punch_out: null },
  { ...late(2), id: 'out-only', punch_in: null },
  { ...late(3), id: 'in-only-noout-status', punch_out: null, status: 'Present (No OutPunch)' },
  { ...late(4), id: 'both', punch_in: '09:00', status: 'Present' },
]);
assert.equal(singles.summary.single_punch, 3);
assert.equal(singles.summary.absent, 3);
assert.equal(singles.summary.present, 1);
assert.equal(singles.summary.lop_absent, 3);
assert.equal(singles.summary.lop_days, 3);      // a full day each
assert.equal(singles.summary.late, 0);          // an absence is not also a late
assert.equal(singles.summary.lop, 0);
assert.deepEqual(singles.rows.slice(0, 3).map((r) => r.display_status),
  ['Absent (Single Punch)', 'Absent (Single Punch)', 'Absent (Single Punch)']);

// A day with NO punches is already the device's own "Absent" — the single-punch
// rule must not claim it, though it still costs the full day.
const noPunches = deriveAttendance([{ ...late(1), punch_in: null, punch_out: null, status: 'Absent' }]);
assert.equal(noPunches.summary.single_punch, 0);
assert.equal(noPunches.summary.absent, 1);
assert.equal(noPunches.summary.lop_days, 1);
assert.equal(noPunches.rows[0].display_status, 'Absent');

// A lone punch on a day that is not an ordinary working day is not an absence.
const loneOnNonWorkingDays = deriveAttendance(
  [
    { ...late(19), id: 'off', status: 'WeeklyOff Present', punch_out: null },
    { ...late(14), id: 'hol', punch_out: null },
    { ...late(6), id: 'leave', punch_out: null },
    { ...late(16), id: 'reduced', punch_out: null },
  ],
  ['2026-07-14'], ['2026-07-16'], ['2026-07-06'],
);
assert.equal(loneOnNonWorkingDays.summary.single_punch, 0);
assert.equal(loneOnNonWorkingDays.summary.absent, 0);
assert.equal(loneOnNonWorkingDays.summary.lop_days, 0);

// An approved regularization wins the day's pay back. The row keeps its lone
// punch, so without the exemption the next read would silently undo HR's call.
const regularized = deriveAttendance([
  { ...late(1), id: 'before', punch_out: null, status: 'Absent' },
  { ...late(2), id: 'after', punch_out: null, status: 'Present (Regularized)' },
  { ...late(3), id: 'after-nopunch', punch_in: null, punch_out: null, status: 'Present (Regularized)' },
]);
assert.equal(regularized.summary.absent, 1);      // only the un-regularized day
assert.equal(regularized.summary.present, 2);
assert.equal(regularized.summary.lop_days, 1);
assert.equal(regularized.summary.late, 0);        // 09:35 on a regularized row is not a late

// ── The four buckets are the whole of lop_days ───────────────────────────────
const everything = deriveAttendance([
  { ...late(1), id: 'absent', punch_in: null, punch_out: null, status: 'Absent' },
  { ...late(2), id: 'single', punch_out: null },
  { ...late(3), id: 'half', punch_in: '11:00' },
  late(6), late(7), late(8),                                  // events 1, 2, 3 — the 3rd charged
  { ...early(9), id: 'e1' }, { ...early(10), id: 'e2' },      // events 4 (free) and 5 (charged)
]);
const s = everything.summary;
assert.deepEqual(
  [s.lop_absent, s.lop_late, s.lop_early, s.lop_half_day],
  [2, 1, 1, 1],
);
assert.deepEqual(
  [s.lop_days_absent, s.lop_days_late, s.lop_days_early, s.lop_days_half_day],
  [2, 0.5, 0.5, 0.5],
);
assert.equal(s.lop_days, s.lop_days_absent + s.lop_days_late + s.lop_days_early + s.lop_days_half_day);
assert.equal(s.lop_days, 3.5);

// --- LOP decimal preservation: 0, 0.5, 1, 1.5 days, multi-employee aggregation ---
// Each LOP incident costs exactly half a day (LOP_DAY_FRACTION = 0.5), applied
// via float multiplication (`lop * LOP_DAY_FRACTION`) — never integer division
// or rounding — so 0.5 must survive all the way through to summary.lop_days.

// 0 LOP -> 0 lop_days (grace covers the only occurrence).
assert.equal(deriveAttendance([1].map(late)).summary.lop, 0);
assert.equal(deriveAttendance([1].map(late)).summary.lop_days, 0);

// 0.5 LOP: exactly 1 LOP incident (the 3rd occurrence, grace 2) -> 0.5, not
// rounded down to 0 or up to 1.
const oneLop = deriveAttendance([1, 2, 3].map(late));
assert.equal(oneLop.summary.lop, 1);
assert.equal(oneLop.summary.lop_days, 0.5);

// 1 day: exactly 2 LOP incidents (3rd and 5th; the 4th rides free).
const twoLop = deriveAttendance([1, 2, 3, 4, 6].map(late));
assert.equal(twoLop.summary.lop, 2);
assert.equal(twoLop.summary.lop_days, 1);

// 1.5 LOP: exactly 3 LOP incidents (3rd, 5th, 7th).
const threeLop = deriveAttendance([1, 2, 3, 4, 6, 7, 8].map(late));
assert.equal(threeLop.summary.lop, 3);
assert.equal(threeLop.summary.lop_days, 1.5);

// Multiple employees: two staff each with exactly 1 LOP incident (0.5 days).
// The total across both must land on exactly 1, and the average on exactly
// 0.5 — not floored to 0 or rounded up to 1 by stray integer arithmetic.
const empA = deriveAttendance([1, 2, 3].map(late));
const empB = deriveAttendance([1, 2, 3].map(late));
const totalLopDays = empA.summary.lop_days + empB.summary.lop_days;
const avgLopDays = totalLopDays / 2;
assert.equal(totalLopDays, 1);
assert.equal(avgLopDays, 0.5);

// ── ½ CL on the LOP day cancels that LOP ─────────────────────────────────────
// Three lates: the 3rd is LOP. The staff then takes a half-day CL for the
// 3rd day — the CL draws 0.5 and that day stops being a late at all, so only
// 2 lates remain, both inside the free allowance, and the LOP is gone.
const threeLates = deriveAttendance([late(1), late(2), late(3)]);
assert.equal(threeLates.summary.lop_days_late, 0.5);
const halfClOnLopDay = deriveAttendance([late(1), late(2), late(3)], [], [], ['2026-07-03']);
assert.equal(halfClOnLopDay.summary.late, 2);
assert.equal(halfClOnLopDay.summary.lop_days, 0);
assert.equal(halfClOnLopDay.summary.on_leave, 1);

// ── Half-day leave only excuses its own half (Dr Aruna, Sept 2026) ───────────
// 24th: ½ CL afternoon, worked the forenoon late → covered, late waived.
// 28th: 1 ML, no punch → on leave.  29th: ½ CL forenoon, NO punch → the
// afternoon was neither worked nor on leave → half day, 0.5 LOP.
{
  const row = (day: number, punch_in: string | null, punch_out: string | null, status: string) => ({
    id: `a${day}`, punch_date: `2026-09-${String(day).padStart(2, '0')}`,
    punch_in, punch_out, status, work_duration: null, overtime: null, total_duration: null,
  });
  const aruna = deriveAttendance(
    [row(24, '09:24', '13:22', 'Present'), row(28, null, null, 'Absent'), row(29, null, null, 'Absent')],
    [], [], new Map([['2026-09-24', 0.5], ['2026-09-28', 1], ['2026-09-29', 0.5]]),
  );
  const by = Object.fromEntries(aruna.rows.map((r) => [r.punch_date.slice(8), r]));
  assert.equal(by['24'].is_late, false);
  assert.equal(by['24'].is_present, true);
  assert.equal(by['28'].is_present, true);
  assert.equal(by['29'].is_half_day, true);
  assert.equal(by['29'].is_present, false);
  assert.equal(by['29'].display_status, 'Half Day (½ Leave)');
  assert.equal(aruna.summary.on_leave, 2);          // ½ + 1 + ½
  assert.equal(aruna.summary.lop_days_half_day, 0.5);
  assert.equal(aruna.summary.lop_days, 0.5);
  // A plain list of dates still reads as whole-day leave.
  assert.equal(deriveAttendance([row(29, null, null, 'Absent')], [], [], ['2026-09-29']).summary.lop_days, 0);
}

console.log('hr-attendance: all checks passed');

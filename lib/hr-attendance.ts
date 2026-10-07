// HR attendance policy — derived at read time from raw biometric punches.
// The biometric import stays the source of truth for punch times + base status;
// "Late", "Late (LOP)" and worked-hours are HR policy computed on top, so the
// rule can change without re-importing or mutating staff_punch.
//
// Rule (applies to every staff in the HR module) — per the Revised Staff
// Leave Rules 2024, "Concessions and Penalties for Late Reporting":
//   - exactly ONE biometric punch on a working day               -> Absent (full day)
//     One timestamp is not a day's attendance, whichever end it sits at: a lone
//     morning punch means nobody recorded leaving, a lone afternoon one means
//     nobody recorded arriving. This outranks every other reading below, so
//     punching in at 10:30 and never punching out is a full absence, not a half
//     day. A day with NO punches is already "Absent" from the device and needs
//     no help. An approved regularization is exempt — see below.
//   - punch-in in (09:20, 09:50] on an otherwise-Present day     -> Late
//     (09:20 sharp is still on time — grace ends just after 09:20; the window
//     itself caps at 30 minutes late, matching "late reporting limited to 30 minutes")
//   - punch-out in [15:30, 16:15) on an otherwise-Present day    -> Early
//   - punch-out before 15:30 on an otherwise-Present day         -> Half Day
//     (early going is allowed only 15:30–16:15; a punch-out from 12:50 to
//     15:30 is a half day, not a grace-eligible Early, and takes no slot)
//   - punch-in after 09:50 AND punch-out before 15:30             -> Absent
//     Both halves were missed, so it is a full-day LOP, not one half day. This
//     is read off the clock times even when the device itself said ½Present.
//     (16:15 is the staff duty-end time — punching out at or after it is
//     not early, whatever the device's own status says)
//   - punch-in in (09:50, 12:50] on an otherwise-Present day     -> Half Day
//     (too late to be a grace-eligible Late at all — straight half-day, and
//     it does not consume one of the month's punctuality slots). A punch-in
//     after 12:50 does not arise in practice: a single afternoon timestamp is
//     recorded as a punch-out, so the single-punch rule above has the day.
//   - Late and Early share ONE allowance of 2 events per calendar month (5 for
//     an HOD — pass HOD_PUNCTUALITY_ALLOWANCE), so a
//     month may hold 2 lates, or 2 earlies, or
//     one of each, for free. Past the
//     allowance the charge alternates: every SECOND event costs half a day, and
//     the one between it and the last charge is free. So the 3rd, 5th, 7th, 9th,
//     11th … are half-day LOP and the 4th, 6th, 8th … are not — two events buy
//     one 0.5, forever, with no escalation to a full day. A month of seven lates
//     is 1.5 days of pay, not 2.5. A day that is both late and early spends two
//     slots, and the two penalties are independent and deliberately not capped
//     per day, so such a day can carry a charge on either half or on both.
//   - Loss of pay is reported in four separate buckets, because HR needs to see
//     WHY the pay was lost, not just how much:
//         absent    1.0 day each   — every absent working day
//         late      0.5 day each   — lates past the monthly allowance
//         early     0.5 day each   — earlies past the same allowance
//         half day  0.5 day each   — every half day (device ½Present or
//                                    half-day-late or -early), no grace
//     summary.lop_days is their sum.
//   - An approved regularization rewrites the day's status to
//     "Present (Regularized)" (see app/api/hr/regularizations), which is how a
//     staff wins back the day's pay. The single-punch rule skips those rows —
//     the original lone punch is still on the row, so without the exemption the
//     next read would silently undo what HR just approved.
//   - Worked column = punch_out - punch_in, shown as "7h 24m"
//   - Sundays arrive from the biometric as "WeeklyOff…" statuses. A week off is
//     not a working day, so those rows are excluded from every count — present,
//     absent, half day, no out-punch, late, LOP. Punches made on a week off are
//     still kept and shown; they just don't move attendance either way.
//   - A declared holiday (attendance_holidays, set from the HR portal) reads exactly like a week off. The device has no idea the hospital
//     was closed and reports every non-puncher "Absent"; the holiday flag
//     overrides that, so nobody is marked absent for a day off. Anyone who did
//     punch on a holiday still shows, with their times.
//   - A "reduced timing" day (attendance_holidays.day_type = 'reduced_timing' —
//     e.g. Independence Day, when the hospital runs a shortened schedule) IS
//     still a working day: present/absent still count. It just gets none of the
//     late-window, LOP or half-day-from-device-status treatment — status is
//     read purely off whether the person punched at all.
//   - An APPROVED leave day (leave_requests, status 'approved') counts as
//     PRESENT, not absent. The device only knows nobody touched the scanner, so it
//     reports "Absent"; the approval is the authority and overrides it. Like a
//     reduced-timing day and unlike a holiday the day IS a working day — it stays
//     in total_days — but it lands in `present`, because sanctioned leave is not
//     an absence. A leave day never produces a Late, an Early or a punctuality
//     LOP, and never counts as a missing out-punch, whatever the device reported
//     — so a half-day leave on a late day cancels that day's late. A HALF-day
//     leave only excuses the half it was taken for, though: with no punch at all
//     that day, the other half was neither worked nor on leave, so the day is a
//     half day (0.5 LOP) rather than present. `summary.on_leave` sums the
//     coverage, so two half-day leaves read as 1, not 2.
//     Precedence is holiday > approved leave > reduced timing: leave taken on a
//     day the hospital was shut is not a working day at all, while leave on a
//     reduced-timing day still reads as leave, the approval outranking "did they
//     punch at all". `summary.on_leave` keeps the count visible so `present` can
//     always be split back apart.

export const LATE_START_MIN = 9 * 60 + 20; // 09:20 exclusive — late starts just after 09:20
export const LATE_END_MIN = 9 * 60 + 50;   // 09:50 inclusive — later than this is a half day, not a Late
export const HALF_DAY_END_MIN = 12 * 60 + 50; // 12:50 inclusive — the half-day window closes here
export const EARLY_OUT_MIN = 16 * 60 + 15; // 16:15 exclusive — punching out before this is an Early
export const EARLY_HALF_DAY_MIN = 15 * 60 + 30; // 15:30 exclusive — punching out before this is a half day
/** Lates and Earlies share this many free events per calendar month. */
export const PUNCTUALITY_ALLOWANCE = 2;
/** The same allowance for an HOD (pass it to deriveAttendance). */
export const HOD_PUNCTUALITY_ALLOWANCE = 5;

export const LOP_DAY_FRACTION = 0.5;       // one punctuality/half-day LOP = half a day's pay
export const LOP_ABSENT_DAYS = 1;          // an absent working day costs the whole day

/** A week off (Sunday) — "WeeklyOff", "WeeklyOff Present", "WeeklyOff ½Present"… */
export const isWeeklyOff = (status: string | null) => (status || '').toLowerCase().includes('weeklyoff');

/** Every Sunday is a week off — never a holiday, whatever the device or the holiday list says. */
export const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/** HR has already accepted this day — it must not be re-judged as an absence. */
export const isRegularized = (status: string | null) => (status || '').toLowerCase().includes('regulariz');

/**
 * Is the n-th punctuality event (Late or Early) of a month loss-of-pay?
 * Past the free allowance the charge alternates — every second event costs half
 * a day, so 3, 5, 7, 9 … are charged and 4, 6, 8 … ride free on the one before.
 * The oddness is measured on the count past the allowance (the 1st event past it
 * is charged), so it keeps running for as long as the month does. With the
 * default allowance of 2 that is the same as n being odd.
 */
export const isLopEvent = (n: number, allowance: number = PUNCTUALITY_ALLOWANCE) =>
  n > allowance && (n - allowance) % 2 === 1;

export interface RawPunch {
  id: string;
  punch_date: string; // YYYY-MM-DD
  punch_in: string | null;
  punch_out: string | null;
  status: string | null;
  work_duration: string | null;
  overtime: string | null;
  total_duration: string | null;
}

export interface DerivedPunch extends RawPunch {
  display_status: string;      // Present / Late / Late (LOP) / ½Present / ...
  is_weekly_off: boolean;      // Sunday — shown, but not counted as attendance
  is_holiday: boolean;         // hospital closed — shown, but not counted either
  is_reduced_timing: boolean;  // shortened schedule — still counted, no late/half-day
  is_on_leave: boolean;        // approved leave — still counted, and counted present
  is_late: boolean;
  is_early: boolean;           // punched out before 16:15 — shares the Late allowance
  // Which of the day's punctuality events fell past the monthly allowance.
  // Split rather than a single flag because a day can be both late AND early
  // with only one of the two charged, and a per-bucket figure cannot attribute
  // that day's cost without knowing which.
  late_is_lop: boolean;
  early_is_lop: boolean;
  is_lop: boolean;             // either of the two above — the day cost something
  is_half_day_late: boolean;   // punched in after 09:50 — half day, not a grace-eligible Late
  is_half_day_early: boolean;  // punched out before 15:30 — half day, not a grace-eligible Early
  is_half_day: boolean;        // costs half a day: device ½Present, half-day-late or half-day-early
  is_single_punch: boolean;    // only one biometric timestamp — a full-day absence
  is_absent: boolean;          // absent working day, whatever made it one
  is_present: boolean;         // counted present — the exact rule summary.present sums
  worked: string | null;       // "7h 24m", or null when a punch is missing
}

export interface AttendanceSummary {
  total_days: number;          // working days on record — week offs excluded
  present: number;             // physically present (includes Late + Late LOP) + approved leave
  absent: number;
  on_leave: number;            // approved-leave days, half days as 0.5
  half_day: number;            // device ½Present days, half-day-lates and -earlies
  no_out_punch: number;
  late: number;                // days flagged Late (incl. LOP)
  early: number;               // days flagged Early (incl. LOP)
  single_punch: number;        // absences caused by a lone punch — a subset of `absent`
  lop: number;                 // punctuality events (Late/Early) charged as loss-of-pay
  // Loss of pay, split by cause. Counts of days…
  lop_absent: number;
  lop_late: number;
  lop_early: number;
  lop_half_day: number;
  // …and what each bucket costs in days of pay.
  lop_days_absent: number;
  lop_days_late: number;
  lop_days_early: number;
  lop_days_half_day: number;
  lop_days: number;            // total pay deducted, in days — the four buckets summed
  weekly_off_worked: number;   // week offs with a punch — informational only
  holidays: number;            // declared holidays on record — not working days
  holiday_worked: number;      // holidays with a punch — informational only
  last_punch_date: string | null;
  punctuality_allowance: number; // free Late/Early events per month this person gets
}

function toMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function workedLabel(inMin: number | null, outMin: number | null): string | null {
  if (inMin == null || outMin == null) return null;
  const diff = outMin - inMin;
  if (diff <= 0) return null; // overnight / bad data — don't invent hours
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

/**
 * Derive HR status + worked-hours for one staff's punches.
 * Pass the whole fetched window (any order); the punctuality allowance is spent
 * per calendar month, so give it as many days as you can — a truncated oldest
 * month can undercount that month's events.
 * ponytail: allowance resets on YYYY-MM, no cross-month carry.
 */
export function deriveAttendance(
  punches: RawPunch[],
  holidayDates: Iterable<string> = [],
  reducedTimingDates: Iterable<string> = [],
  /** Leave dates, or date -> coverage (1 whole day, 0.5 half day) — see leaveCoverage(). */
  approvedLeaveDates: Iterable<string> | ReadonlyMap<string, number> = [],
  /** Free Late/Early events per month — HOD_PUNCTUALITY_ALLOWANCE for an HOD. */
  allowance: number = PUNCTUALITY_ALLOWANCE,
): {
  rows: DerivedPunch[];
  summary: AttendanceSummary;
} {
  const holidays = holidayDates instanceof Set ? holidayDates : new Set(holidayDates);
  const reduced = reducedTimingDates instanceof Set ? reducedTimingDates : new Set(reducedTimingDates);
  const leaveCover: ReadonlyMap<string, number> = approvedLeaveDates instanceof Map
    ? approvedLeaveDates
    : new Map([...(approvedLeaveDates as Iterable<string>)].map((d) => [d, 1]));

  /**
   * How a single day reads, before the month's allowance is applied. Pulled out
   * so the chronological pre-pass and the row mapping below cannot disagree
   * about what a day is — they used to each re-derive it.
   */
  const classify = (p: RawPunch) => {
    // A Sunday is a week off even when the device says "Absent" or someone
    // marked it a holiday — it must never read as either.
    const is_weekly_off = isWeeklyOff(p.status) || isSunday(p.punch_date);
    const is_holiday = !is_weekly_off && holidays.has(p.punch_date);
    // A holiday outranks leave — leave on a day the hospital was shut is not a
    // working day, so it must not be relabelled as present-by-leave.
    const is_on_leave = !is_holiday && !is_weekly_off && leaveCover.has(p.punch_date);
    const is_reduced_timing = !is_holiday && !is_weekly_off && !is_on_leave && reduced.has(p.punch_date);
    // None of these are an ordinary working day, so no punctuality rule and no
    // single-punch rule applies: turning up at 09:40 is not a late on any of
    // them, and a leave day can therefore never escalate into an LOP.
    const ordinary = !is_holiday && !is_on_leave && !is_reduced_timing && !is_weekly_off;

    const base = (p.status || '').trim().toLowerCase();
    const inMin = toMinutes(p.punch_in);
    const outMin = toMinutes(p.punch_out);

    // Exactly one timestamp is not a day's attendance. An approved
    // regularization is exempt: it rewrites the status but leaves the original
    // lone punch on the row, so judging it again would undo HR's decision.
    const is_single_punch =
      ordinary && !isRegularized(p.status) && Boolean(p.punch_in) !== Boolean(p.punch_out);

    // Everything below reads the device's own "Present" — a regularized,
    // ½Present or Absent day is not judged on its clock times.
    // In after 09:50 and out before 15:30: neither half was worked — a full
    // day's LOP. Judged on ½Present days too, since the device only knows it
    // was short, not that both halves were.
    const is_full_day_lop =
      ordinary && !is_single_punch && (base === 'present' || base.startsWith('½present')) &&
      inMin != null && outMin != null && inMin > LATE_END_MIN && outMin < EARLY_HALF_DAY_MIN;
    const timed = ordinary && !is_single_punch && !is_full_day_lop && base === 'present';
    // Arrived inside the half-day window: already charged for the late
    // arrival, so it takes no punctuality slot and no separate Early charge.
    const is_half_day_late = timed && inMin != null && inMin > LATE_END_MIN;
    const is_late = timed && !is_half_day_late && inMin != null && inMin > LATE_START_MIN;
    // Left before 15:30: a half day, not an Early.
    // A day already a half-day-late isn't charged a second half.
    const is_half_day_early = timed && !is_half_day_late && outMin != null && outMin < EARLY_HALF_DAY_MIN;
    const is_early = timed && !is_half_day_late && !is_half_day_early && outMin != null && outMin < EARLY_OUT_MIN;

    return { is_holiday, is_on_leave, is_reduced_timing, is_weekly_off, is_single_punch, is_full_day_lop, is_half_day_late, is_half_day_early, is_late, is_early };
  };

  // Spend the month's punctuality allowance in chronological order, so which
  // events fall past it is stable regardless of the input order. A day that is
  // both late and early spends two slots — the arrival is counted first.
  const chrono = [...punches].sort((a, b) => a.punch_date.localeCompare(b.punch_date));
  const eventsSeenInMonth = new Map<string, number>();
  const lopLateById = new Set<string>();
  const lopEarlyById = new Set<string>();

  for (const p of chrono) {
    const c = classify(p);
    if (!c.is_late && !c.is_early) continue;
    const month = p.punch_date.slice(0, 7); // YYYY-MM
    const spend = () => {
      const n = (eventsSeenInMonth.get(month) ?? 0) + 1;
      eventsSeenInMonth.set(month, n);
      return isLopEvent(n, allowance);
    };
    if (c.is_late && spend()) lopLateById.add(p.id);
    if (c.is_early && spend()) lopEarlyById.add(p.id);
  }

  const rows: DerivedPunch[] = punches.map((p) => {
    const c = classify(p);
    const late_is_lop = lopLateById.has(p.id);
    const early_is_lop = lopEarlyById.has(p.id);
    const is_lop = late_is_lop || early_is_lop;
    const hasPunch = Boolean(p.punch_in || p.punch_out);
    // A half-day leave with no punch at all: the other half was not worked.
    const half_leave_unworked = c.is_on_leave && (leaveCover.get(p.punch_date) ?? 1) < 1 && !hasPunch;
    // A working day the person was not at work for: a lone punch, or the
    // device's own "Absent". Leave and reduced timing read differently — see
    // the precedence note at the top of the file.
    const is_absent =
      !c.is_holiday && !c.is_weekly_off && !c.is_on_leave &&
      (c.is_reduced_timing
        ? !hasPunch
        : c.is_single_punch || c.is_full_day_lop || (p.status || '').trim().toLowerCase().startsWith('absent'));

    // Present reads off the device's own status text — except on a
    // reduced-timing day, where only "did they punch at all" decides it.
    // Approved leave outranks that reading: the approval, not the scanner,
    // decides the day. Anything the rules above made an absence is never also a
    // present, and a half day is neither. Carried per row, not just summed into
    // the summary, so a caller showing one month out of a longer window counts
    // it the same way this file does instead of re-deriving it.
    const is_present =
      c.is_holiday || c.is_weekly_off ? false
      : c.is_on_leave ? !half_leave_unworked
      : is_absent ? false
      : c.is_reduced_timing ? hasPunch
      : c.is_half_day_late || c.is_half_day_early ? false
      : (p.status || '').toLowerCase().startsWith('present');

    // On a holiday the imported "Absent" is an artefact of the device, so the
    // day is relabelled outright rather than shown as an absence. On a
    // reduced-timing day the device's own status (late window, ½Present, no
    // outpunch…) doesn't apply — only whether they punched at all does.
    const display_status = c.is_holiday
      ? (hasPunch ? 'Holiday (worked)' : 'Holiday')
      : c.is_weekly_off && !isWeeklyOff(p.status)
      ? (hasPunch ? 'WeeklyOff Present' : 'WeeklyOff')
      : c.is_on_leave
      ? (hasPunch ? 'On Leave (worked)' : half_leave_unworked ? 'Half Day (½ Leave)' : 'On Leave')
      : c.is_reduced_timing
      ? (hasPunch ? 'Present (Reduced Timing)' : 'Absent (Reduced Timing)')
      : c.is_single_punch ? 'Absent (Single Punch)'
      : c.is_full_day_lop ? 'Absent (Late In + Early Out)'
      : c.is_half_day_late ? 'Half Day (Late)'
      : c.is_half_day_early ? 'Half Day (Early)'
      : c.is_late && c.is_early ? (is_lop ? 'Late + Early (LOP)' : 'Late + Early')
      : c.is_late ? (late_is_lop ? 'Late (LOP)' : 'Late')
      : c.is_early ? (early_is_lop ? 'Early (LOP)' : 'Early')
      : (p.status || '—');
    return {
      ...p,
      is_weekly_off: c.is_weekly_off,
      is_holiday: c.is_holiday,
      is_reduced_timing: c.is_reduced_timing,
      is_on_leave: c.is_on_leave,
      is_late: c.is_late,
      is_early: c.is_early,
      late_is_lop,
      early_is_lop,
      is_lop,
      is_half_day_late: c.is_half_day_late,
      is_half_day_early: c.is_half_day_early,
      // The top "Half Day" tile and the half-day LOP bucket both read this, so
      // a device ½Present day can no longer be counted without being charged.
      is_half_day: half_leave_unworked || (
        !c.is_holiday && !c.is_weekly_off && !c.is_on_leave && !c.is_reduced_timing && !is_absent &&
        ((p.status || '').includes('½') || c.is_half_day_late || c.is_half_day_early)),
      is_single_punch: c.is_single_punch,
      is_absent,
      is_present,
      display_status,
      worked: workedLabel(toMinutes(p.punch_in), toMinutes(p.punch_out)),
    };
  });

  // Week offs and holidays are shown but never counted — every figure below is
  // working days. A reduced-timing day IS a working day (present/absent still
  // count), so it stays in `working`; only its late/half-day reading is off.
  const working = rows.filter((p) => !p.is_weekly_off && !p.is_holiday);

  // Loss of pay, split by cause. An absent day costs the whole day; every other
  // bucket costs half a day each.
  const lop_absent = working.filter((p) => p.is_absent).length;
  const lop_late = working.filter((p) => lopLateById.has(p.id)).length;
  const lop_early = working.filter((p) => lopEarlyById.has(p.id)).length;
  const lop_half_day = working.filter((p) => p.is_half_day).length;
  const lop_days_absent = lop_absent * LOP_ABSENT_DAYS;
  const lop_days_late = lop_late * LOP_DAY_FRACTION;
  const lop_days_early = lop_early * LOP_DAY_FRACTION;
  const lop_days_half_day = lop_half_day * LOP_DAY_FRACTION;

  const summary: AttendanceSummary = {
    total_days: working.length,
    present: working.filter((p) => p.is_present).length,
    absent: lop_absent,
    on_leave: working.filter((p) => p.is_on_leave).reduce((n, p) => n + (leaveCover.get(p.punch_date) ?? 1), 0),
    half_day: lop_half_day,
    no_out_punch: working.filter((p) => !p.is_on_leave && !p.is_reduced_timing && (p.status || '').toLowerCase().includes('no outpunch')).length,
    late: working.filter((p) => p.is_late).length,
    early: working.filter((p) => p.is_early).length,
    single_punch: working.filter((p) => p.is_single_punch).length,
    lop: lop_late + lop_early,
    lop_absent,
    lop_late,
    lop_early,
    lop_half_day,
    lop_days_absent,
    lop_days_late,
    lop_days_early,
    lop_days_half_day,
    lop_days: lop_days_absent + lop_days_late + lop_days_early + lop_days_half_day,
    weekly_off_worked: rows.filter((p) => p.is_weekly_off && !p.is_holiday && (p.punch_in || p.punch_out)).length,
    holidays: rows.filter((p) => p.is_holiday).length,
    holiday_worked: rows.filter((p) => p.is_holiday && (p.punch_in || p.punch_out)).length,
    last_punch_date: chrono[chrono.length - 1]?.punch_date ?? null,
    punctuality_allowance: allowance,
  };

  return { rows, summary };
}

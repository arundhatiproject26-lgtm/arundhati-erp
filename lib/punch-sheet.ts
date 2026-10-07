import * as XLSX from 'xlsx';

export interface PunchRow {
  employee_code: string;
  employee_name: string | null;
  punch_date: string;
  punch_in: string | null;
  punch_out: string | null;
  status: string | null;
  department: string | null;
}

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const pad = (n: number) => String(n).padStart(2, '0');

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Cells arrive as Date (cellDates), or text like "14-Jul-2026" / "28/07/2026". */
export const asDate = (v: unknown): string | null => {
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const dMonY = s.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,})[-/\s](\d{4})$/);   // 14-Jul-2026
  if (dMonY) {
    const m = MONTHS.indexOf(dMonY[2].slice(0, 3).toLowerCase());
    if (m >= 0) return `${dMonY[3]}-${pad(m + 1)}-${pad(Number(dMonY[1]))}`;
  }

  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);            // 28/07/2026
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${pad(Number(dmy[2]))}-${pad(Number(dmy[1]))}`;
  }
  return null;
};

/**
 * A punch time as "HH:MM", 24-hour.
 *
 * The report is not consistent about how it stores one. Cells Excel typed as a
 * time arrive here as a Date; cells it left as text arrive as a string, and
 * those carry a meridiem ("07:11 PM"). Reading only the HH:MM prefix dropped
 * that PM and turned a 19:11 departure into 07:11 — which then reads as a
 * punch-out before 16:15, so the day was charged as an Early that never
 * happened. Both spellings have to be understood, because one file holds both.
 */
export const asTime = (v: unknown): string | null => {
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:([AaPp])\.?\s*[Mm]\.?)?\s*$/)
    ?? s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;

  let h = Number(m[1]);
  const meridiem = m[3]?.toLowerCase();
  // 12 is the hour a plain "+12 for PM" gets wrong at both ends of the day:
  // 12:30 AM is 00:30 and 12:30 PM is already 12:30.
  if (meridiem === 'p') h = h === 12 ? 12 : h + 12;
  if (meridiem === 'a') h = h === 12 ? 0 : h;
  if (h > 23) return null;

  const out = `${pad(h)}:${m[2]}`;
  // "00:00" is how the device writes "no punch here" — dropped after the
  // conversion, so "12:00 AM" is caught too and not stored as a midnight punch.
  return out === '00:00' ? null : out;
};

/** "Present  (No OutPunch)" → "Present (No OutPunch)" */
const cleanStatus = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim() || null;

type Grid = unknown[][];

/**
 * The biometric "Daily Attendance Report" is a banded report, not a flat table:
 * a title block, then `Attendance Date` and `Department` label rows, a repeated
 * `SNo / E. Code / Name / InTime / OutTime / Status` header per department, and
 * data rows under each. Columns shift between exports, so every header row
 * re-maps the column indices for the block that follows it.
 */
function parseGrid(grid: Grid): PunchRow[] {
  const rows: PunchRow[] = [];
  let date: string | null = null;
  let department: string | null = null;
  let cols: Record<string, number> | null = null;

  const labelValue = (row: unknown[], from: number) => {
    for (let i = from + 1; i < row.length; i++) {
      const v = row[i];
      if (v !== null && v !== undefined && String(v).trim() !== '') return v;
    }
    return null;
  };

  for (const row of grid) {
    const labels = row.map(norm);

    const dateIdx = labels.indexOf('attendancedate');
    if (dateIdx !== -1) {
      date = asDate(labelValue(row, dateIdx)) ?? date;
      continue;
    }

    // A header row is checked before label rows: some exports put a
    // Department column in the header, which must not read as a label row.
    const codeIdx = labels.findIndex((l) => l === 'ecode' || l === 'empcode' || l === 'employeecode');
    if (codeIdx !== -1 && labels.includes('name')) {
      cols = {
        sno: labels.indexOf('sno'),
        code: codeIdx,
        name: labels.indexOf('name'),
        in: labels.findIndex((l) => l === 'intime' || l === 'punchin'),
        out: labels.findIndex((l) => l === 'outtime' || l === 'punchout'),
        status: labels.indexOf('status'),
        dept: labels.indexOf('department'),
      };
      continue;
    }

    const deptIdx = labels.indexOf('department');
    if (deptIdx !== -1) {
      department = String(labelValue(row, deptIdx) ?? '').trim() || null;
      continue;
    }

    if (!cols || !date) continue;

    const code = String(row[cols.code] ?? '').trim();
    if (!code) continue;
    // Data rows are numbered; anything else in the band is a spacer or footer.
    if (cols.sno !== -1 && !Number.isFinite(Number(row[cols.sno]))) continue;

    rows.push({
      employee_code: code,
      employee_name: cols.name === -1 ? null : String(row[cols.name] ?? '').trim() || null,
      punch_date: date,
      punch_in: cols.in === -1 ? null : asTime(row[cols.in]),
      punch_out: cols.out === -1 ? null : asTime(row[cols.out]),
      status: cols.status === -1 ? null : cleanStatus(row[cols.status]),
      department: cols.dept !== -1 ? String(row[cols.dept] ?? '').trim() || department : department,
    });
  }

  return rows;
}

/**
 * Parse the biometric export. The device may bundle several sheets (one per
 * company/unit); pass `sheet` to pick one, otherwise the first sheet that
 * yields punch rows is used. `sheets` lists them all so the UI can offer a choice.
 */
export function parsePunchSheet(buf: ArrayBuffer, sheet?: string): { rows: PunchRow[]; sheet: string; sheets: string[] } {
  const wb = XLSX.read(buf, { cellDates: true });
  const parse = (name: string) =>
    parseGrid(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: null, blankrows: false }));

  if (sheet && wb.SheetNames.includes(sheet)) return { rows: parse(sheet), sheet, sheets: wb.SheetNames };
  for (const name of wb.SheetNames) {
    const rows = parse(name);
    if (rows.length) return { rows, sheet: name, sheets: wb.SheetNames };
  }
  return { rows: [], sheet: wb.SheetNames[0] ?? '', sheets: wb.SheetNames };
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireRole } from '@/lib/auth';

interface IncomingRow {
  employee_code: string;
  employee_name?: string | null;
  punch_date: string; // YYYY-MM-DD
  punch_in?: string | null; // HH:MM
  punch_out?: string | null; // HH:MM
  status?: string | null;
  department?: string | null;
}

const isDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown) => v == null || v === '' || (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v));
const MAX_ROWS = 20000;

// POST { rows } → upsert parsed biometric rows (the browser parses the Excel
// with lib/punch-sheet.ts). Re-uploading a day overwrites it.
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const { rows } = (await request.json()) as { rows?: IncomingRow[] };
    if (!Array.isArray(rows) || rows.length === 0) throw new HttpError(400, 'No rows to import');
    if (rows.length > MAX_ROWS) throw new HttpError(400, `Upload at most ${MAX_ROWS} rows at a time`);

    const clean: Required<IncomingRow>[] = [];
    const skipped: string[] = [];
    rows.forEach((r, i) => {
      // The device is inconsistent about case ("ABC12" vs "abc12"); employee
      // codes are stored uppercase so every match downstream is exact.
      const code = String(r?.employee_code ?? '').trim().toUpperCase();
      if (!code) return skipped.push(`Row ${i + 1}: missing employee code`);
      if (!isDate(r?.punch_date)) return skipped.push(`Row ${i + 1}: bad or missing date`);
      if (!isTime(r.punch_in) || !isTime(r.punch_out)) return skipped.push(`Row ${i + 1}: bad punch time`);
      // An Absent row has no times but is still worth showing; drop only empty rows.
      if (!r.punch_in && !r.punch_out && !r.status) return skipped.push(`Row ${i + 1}: no punch times and no status`);
      clean.push({
        employee_code: code,
        employee_name: r.employee_name?.toString().trim() || null,
        punch_date: r.punch_date,
        punch_in: r.punch_in || null,
        punch_out: r.punch_out || null,
        status: r.status?.toString().trim() || null,
        department: r.department?.toString().trim() || null,
      });
    });
    if (clean.length === 0) return NextResponse.json({ error: 'No usable rows', skipped }, { status: 400 });

    // The same code+date twice in one file would make the upsert fail
    // ("cannot affect row a second time"); the later row wins.
    const byKey = new Map(clean.map((r) => [`${r.employee_code}|${r.punch_date}`, r]));
    const unique = [...byKey.values()];

    const codes = [...new Set(unique.map((r) => r.employee_code))];
    const emps = await db.selectFrom('employees').select(['employee_code', 'user_id']).where('employee_code', 'in', codes).execute();
    const userByCode = new Map(emps.map((e) => [String(e.employee_code), e.user_id]));
    const unmatched = codes.filter((c) => !userByCode.has(c));

    const payload = unique.map((r) => ({ ...r, user_id: userByCode.get(r.employee_code) ?? null }));
    // Postgres caps bind parameters at 65535; 8 columns × 2000 rows stays well under.
    for (let i = 0; i < payload.length; i += 2000) {
      await db
        .insertInto('staff_punch')
        .values(payload.slice(i, i + 2000))
        .onConflict((oc) =>
          oc.columns(['employee_code', 'punch_date']).doUpdateSet((eb) => ({
            employee_name: eb.ref('excluded.employee_name'),
            punch_in: eb.ref('excluded.punch_in'),
            punch_out: eb.ref('excluded.punch_out'),
            status: eb.ref('excluded.status'),
            department: eb.ref('excluded.department'),
            user_id: eb.ref('excluded.user_id'),
          })),
        )
        .execute();
    }

    return NextResponse.json({ imported: payload.length, skipped, unmatched });
  } catch (err) {
    return errorResponse(err);
  }
}

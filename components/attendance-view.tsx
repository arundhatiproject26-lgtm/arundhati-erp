'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtDate } from '@/lib/format';
import type { AttendanceSummary, DerivedPunch } from '@/lib/hr-attendance';

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function statusVariant(p: DerivedPunch): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (p.is_weekly_off || p.is_holiday) return 'outline';
  if (p.is_absent) return 'destructive';
  if (p.is_lop || p.is_half_day) return 'destructive';
  if (p.is_late || p.is_early) return 'secondary';
  return 'default';
}

/** Summary tiles + day table for one employee's derived month. */
export function AttendanceView({ rows, summary }: { rows: DerivedPunch[]; summary: AttendanceSummary | null }) {
  if (!summary) {
    return <p className="text-sm text-muted-foreground">No biometric code is set for this employee, so there is no attendance to show.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile label="Working days" value={summary.total_days} />
        <Tile label="Present" value={summary.present} hint={summary.on_leave ? `incl. ${summary.on_leave} on leave` : undefined} />
        <Tile label="Absent" value={summary.absent} />
        <Tile label="Half days" value={summary.half_day} />
        <Tile label="Late / Early" value={`${summary.late} / ${summary.early}`} hint={`${summary.punctuality_allowance} free per month`} />
        <Tile label="Loss of pay" value={`${summary.lop_days} d`} />
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead>Worked</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(p.punch_date)}</TableCell>
                  <TableCell>{p.punch_in ?? '—'}</TableCell>
                  <TableCell>{p.punch_out ?? '—'}</TableCell>
                  <TableCell>{p.worked ?? '—'}</TableCell>
                  <TableCell><Badge variant={statusVariant(p)}>{p.display_status}</Badge></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">No punches imported for this month yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

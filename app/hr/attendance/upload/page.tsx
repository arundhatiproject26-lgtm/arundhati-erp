'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { SimpleSelect } from '@/components/simple-select';
import { postJson } from '@/lib/auth-fetch';
import { fmtDate } from '@/lib/format';
import { parsePunchSheet, type PunchRow } from '@/lib/punch-sheet';

interface UploadResult { imported: number; skipped: string[]; unmatched: string[] }

export default function UploadPunches() {
  const qc = useQueryClient();
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [sheet, setSheet] = useState('');
  const [rows, setRows] = useState<PunchRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  const parse = (data: ArrayBuffer, name?: string) => {
    try {
      const res = parsePunchSheet(data, name);
      setSheets(res.sheets);
      setSheet(res.sheet);
      setRows(res.rows);
      setParseError(res.rows.length ? null : 'No punch rows found in this sheet. Is it the Daily Attendance Report?');
    } catch (e) {
      setParseError(`Could not read the file: ${(e as Error).message}`);
      setRows([]);
    }
  };

  const upload = useMutation({
    mutationFn: () => postJson<UploadResult>('/api/hr/attendance/upload', { rows }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-punch-days'] }),
  });

  const dates = [...new Set(rows.map((r) => r.punch_date))].sort();

  return (
    <div className="space-y-6">
      <PageHeader title="Upload punches" description="Upload the biometric device's Daily Attendance Report (.xlsx / .xls). Re-uploading a day replaces it." />
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="max-w-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              upload.reset();
              if (!f) return;
              const data = await f.arrayBuffer();
              setBuf(data);
              parse(data);
            }}
          />
          {sheets.length > 1 && buf && (
            <SimpleSelect className="w-56" value={sheet} onChange={(s) => parse(buf, s)} options={sheets.map((s) => ({ value: s, label: `Sheet: ${s}` }))} />
          )}
          {rows.length > 0 && (
            <Button disabled={upload.isPending} onClick={() => upload.mutate()}>
              {upload.isPending ? 'Uploading…' : `Import ${rows.length} rows`}
            </Button>
          )}
        </CardContent>
      </Card>

      {parseError && <Alert variant="destructive"><AlertDescription>{parseError}</AlertDescription></Alert>}
      {upload.error && <Alert variant="destructive"><AlertDescription>{(upload.error as Error).message}</AlertDescription></Alert>}
      {upload.data && (
        <Alert>
          <AlertDescription>
            Imported {upload.data.imported} rows.
            {upload.data.unmatched.length > 0 && ` ${upload.data.unmatched.length} codes are not on the staff list: ${upload.data.unmatched.slice(0, 20).join(', ')}${upload.data.unmatched.length > 20 ? '…' : ''}.`}
            {upload.data.skipped.length > 0 && ` Skipped ${upload.data.skipped.length}: ${upload.data.skipped.slice(0, 5).join('; ')}.`}
          </AlertDescription>
        </Alert>
      )}

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="border-b p-3 text-sm text-muted-foreground">
              Preview · {dates.length === 1 ? fmtDate(dates[0]) : `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}`} · first 50 of {rows.length}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>In</TableHead>
                    <TableHead>Out</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.employee_code}</TableCell>
                      <TableCell>{r.employee_name ?? '—'}</TableCell>
                      <TableCell>{fmtDate(r.punch_date)}</TableCell>
                      <TableCell>{r.punch_in ?? '—'}</TableCell>
                      <TableCell>{r.punch_out ?? '—'}</TableCell>
                      <TableCell>{r.status ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

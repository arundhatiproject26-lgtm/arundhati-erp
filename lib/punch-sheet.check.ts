// Self-check for the biometric sheet parser. Run: npm run check
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parsePunchSheet } from './punch-sheet.ts';

function book(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Report');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

// Plain banded report: label rows, then header, then numbered data rows.
{
  const { rows } = parsePunchSheet(book([
    ['Attendance Date', '07-Oct-2026'],
    ['Department', 'Cardiology'],
    ['SNo', 'E. Code', 'Name', 'InTime', 'OutTime', 'Status'],
    [1, 'abc12', 'Asha', '09:05', '05:10 PM', 'Present'],
  ]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employee_code, 'abc12'); // uppercased by the upload route, not here
  assert.equal(rows[0].punch_out, '17:10');
  assert.equal(rows[0].department, 'Cardiology');
}

// Header that itself carries a Department column must be read as a header,
// not as a "Department <value>" label row (review Important #4).
{
  const { rows } = parsePunchSheet(book([
    ['Attendance Date', '07-Oct-2026'],
    ['SNo', 'E. Code', 'Name', 'Department', 'InTime', 'OutTime', 'Status'],
    [1, 'N01', 'Ravi', 'Nursing', '08:58', '17:02', 'Present'],
    [2, 'N02', 'Meena', 'Nursing', '', '', 'Absent'],
  ]));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].punch_in, '08:58');
  assert.equal(rows[0].department, 'Nursing');
  assert.equal(rows[1].status, 'Absent');
}

console.log('punch-sheet: all checks passed');

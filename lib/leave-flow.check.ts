// Self-check for the leave state machine. Run: npm run check
import assert from 'node:assert/strict';
import {
  initialStatus, nextStatus, canDecide, requestedDays, daysByYear, checkRequest, STEP,
} from './leave-flow.ts';

// Chain: pending -> hod -> principal -> dean (final)
assert.deepEqual(STEP.hod, { from: 'pending', to: 'hod_approved' });
assert.deepEqual(STEP.principal, { from: 'hod_approved', to: 'principal_approved' });
assert.deepEqual(STEP.dean, { from: 'principal_approved', to: 'approved' });
assert.equal(nextStatus('hod', 'approved', false), 'hod_approved');
assert.equal(nextStatus('principal', 'approved', false), 'principal_approved');
assert.equal(nextStatus('dean', 'approved', false), 'approved');
assert.equal(nextStatus('principal', 'rejected', false), 'rejected');

// Who starts where
assert.equal(initialStatus(['staff']), 'pending');
assert.equal(initialStatus(['staff', 'hod']), 'hod_approved');      // HOD skips own step
assert.equal(initialStatus(['staff', 'principal']), 'principal_approved');
assert.equal(initialStatus(['staff', 'dean']), 'hod_approved');      // principal finalises a dean's leave
assert.equal(nextStatus('principal', 'approved', true), 'approved');

const base = {
  approverUserId: 'u-hod', approverDept: 'Cardiology',
  applicantUserId: 'u-staff', applicantDept: 'Cardiology', applicantIsDean: false,
} as const;
assert.equal(canDecide({ ...base, approverRole: 'hod', status: 'pending' }), null);
assert.match(canDecide({ ...base, approverRole: 'hod', status: 'pending', applicantDept: 'Neurology' })!, /department/i);
assert.match(canDecide({ ...base, approverRole: 'hod', status: 'pending', applicantUserId: 'u-hod' })!, /own/i);
assert.match(canDecide({ ...base, approverRole: 'hod', status: 'hod_approved' })!, /already/i);
assert.equal(canDecide({ ...base, approverRole: 'principal', approverDept: null, applicantDept: 'Neurology', status: 'hod_approved' }), null);
assert.equal(canDecide({ ...base, approverRole: 'dean', status: 'principal_approved' }), null);
// A dean's own request never reaches the dean queue as actionable
assert.match(canDecide({ ...base, approverRole: 'dean', applicantUserId: 'u-hod', status: 'principal_approved' })!, /own/i);

// Days
assert.equal(requestedDays('2026-10-07', '2026-10-07', true), 0.5);
assert.equal(requestedDays('2026-10-07', '2026-10-09', false), 3);
assert.deepEqual([...daysByYear('2026-12-30', '2027-01-02', false)], [[2026, 2], [2027, 2]]);
assert.deepEqual([...daysByYear('2026-03-01', '2026-03-01', true)], [[2026, 0.5]]);

// Request checks
const ok = { type: 'CL', from: '2026-10-07', to: '2026-10-08', halfDay: false, available: new Map([[2026, 5]]) };
assert.equal(checkRequest(ok), null);
assert.match(checkRequest({ ...ok, to: '2026-10-06' })!, /end date/i);
assert.match(checkRequest({ ...ok, type: 'XX' })!, /leave type/i);
assert.match(checkRequest({ ...ok, available: new Map([[2026, 1]]) })!, /1 Casual Leave left/);
assert.match(checkRequest({ ...ok, available: new Map([[2026, 0]]) })!, /no Casual Leave left/);
assert.equal(checkRequest({ ...ok, available: new Map([[2026, null]]) }), null);          // uncapped
assert.match(checkRequest({ ...ok, type: 'EL', halfDay: true, to: ok.from })!, /half day/i);
assert.match(checkRequest({ ...ok, halfDay: true })!, /single day/i);
// Year boundary: each year's share checked against its own balance
assert.match(
  checkRequest({ ...ok, from: '2026-12-30', to: '2027-01-02', available: new Map([[2026, 5], [2027, 1]]) })!,
  /2027/,
);

// Impossible calendar dates are a 400, never reach the DB (review Important #3)
assert.match(checkRequest({ ...ok, from: '2026-02-31', to: '2026-02-31' })!, /valid date/i);
assert.match(checkRequest({ ...ok, from: '2026-13-01', to: '2026-13-02' })!, /valid date/i);
assert.match(checkRequest({ ...ok, available: new Map() , to: '2026-10-01' })!, /end date/i);

console.log('leave-flow: all checks passed');

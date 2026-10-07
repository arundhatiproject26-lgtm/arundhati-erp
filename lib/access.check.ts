// Self-check for login → access resolution. Run: npm run check
import assert from 'node:assert/strict';
import { effectiveAccess, canAutoLink } from './access.ts';

const emp = (status: string) => ({ id: 'e1', full_name: 'A', email: 'a@x.in', employee_code: 'A1', department: 'Cardiology', designation: null, staff_type: 'faculty', status });

// Current employee: implicit staff + stored roles, in canonical order
let a = effectiveAccess([{ role: 'hod', department: 'Cardiology' }], emp('active'));
assert.deepEqual(a.roles, ['staff', 'hod']);
assert.equal(a.hodDepartment, 'Cardiology');
assert.ok(a.employee);
assert.deepEqual(effectiveAccess([], emp('on-leave')).roles, ['staff']);

// Resigned/terminated: no staff access and every approver/HR role dropped (review Important #2)
a = effectiveAccess([{ role: 'dean', department: null }, { role: 'hr', department: null }], emp('resigned'));
assert.deepEqual(a.roles, []);
assert.equal(a.employee, null);
assert.equal(a.hodDepartment, null);
assert.deepEqual(effectiveAccess([{ role: 'hod', department: 'X' }], emp('terminated')).roles, []);

// No employee row (e.g. a pure HR account): stored roles still apply
assert.deepEqual(effectiveAccess([{ role: 'hr', department: null }], null).roles, ['hr']);

// Email auto-link only with a verified email (review Important #1)
assert.equal(canAutoLink('a@x.in', true), true);
assert.equal(canAutoLink('a@x.in', false), false);
assert.equal(canAutoLink(null, true), false);

console.log('access: all checks passed');

import type { Role } from '@/lib/roles';

export interface NavItem {
  href: string;
  label: string;
}

export const PORTALS: Record<Role, { title: string; blurb: string; nav: NavItem[] }> = {
  staff: {
    title: 'Staff',
    blurb: 'Faculty and non-teaching staff — attendance, leave, payslips',
    nav: [
      { href: '/staff', label: 'Dashboard' },
      { href: '/staff/attendance', label: 'My attendance' },
      { href: '/staff/leave', label: 'Leave' },
      { href: '/staff/regularizations', label: 'Regularization' },
      { href: '/staff/payslips', label: 'Payslips' },
    ],
  },
  hod: {
    title: 'HOD',
    blurb: 'Approve leave for your department',
    nav: [{ href: '/hod', label: 'Leave approvals' }],
  },
  principal: {
    title: 'Principal',
    blurb: 'Approve HOD-approved leave',
    nav: [{ href: '/principal', label: 'Leave approvals' }],
  },
  dean: {
    title: 'Dean',
    blurb: 'Final leave approval',
    nav: [{ href: '/dean', label: 'Leave approvals' }],
  },
  hr: {
    title: 'HR',
    blurb: 'Employees, biometric attendance, leave register, payroll',
    nav: [
      { href: '/hr', label: 'Overview' },
      { href: '/hr/employees', label: 'Employees' },
      { href: '/hr/attendance', label: 'Attendance' },
      { href: '/hr/attendance/upload', label: 'Upload punches' },
      { href: '/hr/holidays', label: 'Holidays' },
      { href: '/hr/leave', label: 'Leave register' },
      { href: '/hr/leave-balances', label: 'Leave balances' },
      { href: '/hr/regularizations', label: 'Regularizations' },
      { href: '/hr/payslips', label: 'Payslips' },
    ],
  },
};

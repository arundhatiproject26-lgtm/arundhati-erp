import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fmtMoney } from '@/lib/format';

export interface Payslip {
  id: string;
  pay_month: number;
  pay_year: number;
  basic_salary: string;
  hra: string;
  allowances: string;
  incentive_total: string;
  pf_deduction: string;
  tax_deduction: string;
  other_deductions: string;
  net_pay: string;
  status: string;
  remarks: string | null;
}

export const monthName = (m: number, y: number) =>
  new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{fmtMoney(value)}</span>
    </div>
  );
}

export function PayslipCard({ p, who }: { p: Payslip; who: { full_name: string; employee_code: string | null; department: string | null; designation?: string | null } }) {
  const earnings = Number(p.basic_salary) + Number(p.hra) + Number(p.allowances) + Number(p.incentive_total);
  const deductions = Number(p.pf_deduction) + Number(p.tax_deduction) + Number(p.other_deductions);
  return (
    <Card className="break-inside-avoid">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Payslip — {monthName(p.pay_month, p.pay_year)}</CardTitle>
          <div className="mt-1 text-sm text-muted-foreground">
            {who.full_name}{who.employee_code ? ` · ${who.employee_code}` : ''}{who.department ? ` · ${who.department}` : ''}
          </div>
        </div>
        <Badge variant={p.status === 'paid' ? 'default' : 'secondary'}>{p.status}</Badge>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="text-sm font-medium">Earnings</div>
          <Line label="Basic" value={p.basic_salary} />
          <Line label="HRA" value={p.hra} />
          <Line label="Allowances" value={p.allowances} />
          {Number(p.incentive_total) > 0 && <Line label="Incentives" value={p.incentive_total} />}
          <Line label="Gross" value={String(earnings)} />
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium">Deductions</div>
          <Line label="PF" value={p.pf_deduction} />
          <Line label="Tax" value={p.tax_deduction} />
          <Line label="Other (incl. loss of pay)" value={p.other_deductions} />
          <Line label="Total" value={String(deductions)} />
        </div>
        <div className="flex justify-between border-t pt-3 font-semibold sm:col-span-2">
          <span>Net pay</span>
          <span>{fmtMoney(p.net_pay)}</span>
        </div>
        {p.remarks && <p className="text-sm text-muted-foreground sm:col-span-2">{p.remarks}</p>}
      </CardContent>
    </Card>
  );
}

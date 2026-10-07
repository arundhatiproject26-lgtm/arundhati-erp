import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, type LeaveStatus } from '@/lib/leave-flow';

const VARIANT: Record<LeaveStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  hod_approved: 'secondary',
  principal_approved: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  cancelled: 'outline',
};

export function LeaveStatusBadge({ status }: { status: string }) {
  const s = status as LeaveStatus;
  return <Badge variant={VARIANT[s] ?? 'outline'}>{STATUS_LABEL[s] ?? status}</Badge>;
}

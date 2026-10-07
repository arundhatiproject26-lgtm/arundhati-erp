import { PortalShell } from '@/components/portal-shell';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell role="hr">{children}</PortalShell>;
}

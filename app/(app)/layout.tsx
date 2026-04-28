import { PrivateAppShell } from "@/components/app-shell/private-shell";
import { requireAdmin } from "@/lib/auth/admin";
import { logoutAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await requireAdmin();

  return (
    <PrivateAppShell logoutAction={logoutAction} viewerEmail={admin.email}>
      {children}
    </PrivateAppShell>
  );
}

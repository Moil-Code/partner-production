import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isMoilAdmin } from '@/lib/licenseIssuePolicy';

/**
 * Server-side gate for the entire /moil-admin route tree.
 *
 * Everything under here — including the plan add-on grant UI
 * (GrantAddonModal, mounted on /moil-admin/dashboard and /moil-admin/licenses)
 * — is Moil-internal. The add-on grant feature spends Moil's own premium AI
 * budget on a licensee's behalf and is documented as `moil_admin`-only at the
 * write endpoint (app/api/licenses/grant-addon/route.ts) and invisible to
 * partners in the data layer (lib/addonLicense.ts writes team_id/admin_id as
 * null so it never appears in a partner's own license views).
 *
 * Those two gates are real, but nothing server-side stopped a partner_admin
 * from actually LOADING this page before now — /moil-admin/dashboard and
 * /moil-admin/licenses only checked `isMoilAdmin` client-side, via the
 * Zustand auth store, and redirected AFTER the bundle (including this UI)
 * was already delivered and rendered for a beat. This layout runs before any
 * page under it, using the same DB-backed check the write endpoint uses, so a
 * partner_admin is redirected before the moil-admin UI — grant controls
 * included — ever reaches their browser.
 */
export default async function MoilAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect('/login');
  }

  const { data: adminData, error: adminError } = await supabase
    .from('admins')
    .select('global_role, email')
    .eq('id', user.id)
    .single();

  if (adminError || !adminData || !isMoilAdmin(adminData)) {
    redirect('/admin');
  }

  return <>{children}</>;
}

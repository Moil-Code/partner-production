import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve the authenticated caller's ownership context for content items.
 * Returns the user id and their primary team id (if any), matching how the
 * license import/list routes scope rows. Returns null when unauthenticated.
 */
export async function resolveContentOwner(supabase: SupabaseClient) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  // Confirm the user is an admin (partner_admin / member / moil_admin).
  const { data: admin } = await supabase
    .from('admins')
    .select('id, partner_id')
    .eq('id', user.id)
    .single();

  if (!admin) {
    return null;
  }

  const { data: teamMember } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('admin_id', user.id)
    .single();

  return {
    userId: user.id,
    partnerId: (admin.partner_id as string | null) ?? null,
    teamId: (teamMember?.team_id as string | null) ?? null,
  };
}

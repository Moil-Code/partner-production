/**
 * Deprecated alias for `/api/licenses/delete`.
 *
 * This route used to carry its own copy of the ownership checks, which drifted
 * from the ones in `delete` (it never granted Moil admins cross-partner access,
 * and it allowed activated licenses to be removed). It now delegates so the two
 * endpoints cannot diverge again. New callers should use `/api/licenses/delete`.
 *
 * POST is accepted alongside DELETE because older clients call it that way.
 */
import { DELETE as deleteLicense } from '../delete/route';

export const DELETE = deleteLicense;
export const POST = deleteLicense;

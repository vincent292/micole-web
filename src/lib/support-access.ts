import type { Identity } from "./types";

/** A server-verified owner session retains the selected role and institution. */
export function ownerPaymentAccess(identity: Identity | null | undefined, schoolId?: string, now = Date.now()) {
  const context = identity?.support;
  return !!(identity?.canSupport && context?.paymentBypass === true &&
    schoolId && context.schoolId === schoolId && identity.roles.includes(context.role) &&
    new Date(context.expiresAt).getTime() > now);
}

import type { ActivityParticipation } from "./types";

export type AuthorizationState = "pending" | "authorized" | "declined";

/** Automatic participation and payment never establish a family's decision. */
export function authorizationState(participation?: Partial<ActivityParticipation>): AuthorizationState {
  if (!participation?.authorizationAt || !participation.authorizationBy)
    return "pending";
  if (participation.authorizationResponse === true) return "authorized";
  if (participation.authorizationResponse === false) return "declined";
  return "pending";
}

export const authorizationLabels: Record<AuthorizationState, string> = {
  pending: "Autorización pendiente",
  authorized: "Autorizado por la familia",
  declined: "No autorizado por la familia",
};

export function authorizationCounts(rows: (Partial<ActivityParticipation> | undefined)[]) {
  const states = rows.map(authorizationState);
  const authorized = states.filter(state => state === "authorized").length;
  const declined = states.filter(state => state === "declined").length;
  return { pending: rows.length - authorized - declined, responded: authorized + declined, authorized, declined };
}

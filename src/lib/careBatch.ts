import type { CareRecord } from "./school";

export type GroupCareKind = Exclude<CareRecord["kind"], "incident">;
export type GroupCareValues = { kind: GroupCareKind; occurred_at: string; ended_at: string; food: string; amount: string; hygiene: string; mood: string; note: string };
export type CareBatchPayload = { p_school_id: string; p_classroom_id: string; p_day: string; p_request_id: string; p_records: (GroupCareValues & { student_id: string })[] };
export type CareBatchAttempt = { payload: CareBatchPayload; values: GroupCareValues; roomName: string; children: { id: string; name: string }[] };

// Keep uncertain submissions for this session only; never store pupil care data on disk.
const attempts = new Map<string, CareBatchAttempt>();
export function readCareBatchAttempt(scope: string) {
  const value = attempts.get(scope);
  return value ? structuredClone(value) : undefined;
}
export function rememberCareBatchAttempt(scope: string, attempt: CareBatchAttempt) {
  attempts.set(scope, structuredClone(attempt));
}
export function clearCareBatchAttempt(scope: string) { attempts.delete(scope); }
export function clearCareBatchAttempts() { attempts.clear(); }

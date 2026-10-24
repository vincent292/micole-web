import { readDraft, writeDraft, removeDraft } from "./sessionDraft";
/** The same draft/revision reuses its request ID after a lost network response. */
export function attendanceSubmissionId(
  context: string,
  payload: object,
  uuid: () => string,
) {
  const key = `attendance-send:${context}`,
    signature = JSON.stringify(payload);
  const saved = readDraft<{ signature: string; requestId: string }>(key);
  if (saved?.signature === signature) return saved.requestId;
  const requestId = uuid();
  writeDraft(key, { signature, requestId });
  return requestId;
}
export function clearAttendanceSubmission(context: string) {
  removeDraft(`attendance-send:${context}`);
}

/** Session memory only: sensitive pupil data never goes to browser/disk storage. */
const drafts = new Map<
  string,
  { updated: number; value: Record<string, unknown> }
>();
const ttl = 2 * 60 * 60 * 1000;
export function draftKey(
  user: string,
  role: string,
  school: string,
  context: string,
  form: string,
) {
  return JSON.stringify([user, role, school, context, form]);
}
export function readDraft<T extends Record<string, unknown>>(
  key: string,
): T | undefined {
  const entry = drafts.get(key);
  if (!entry) return;
  if (Date.now() - entry.updated > ttl) {
    drafts.delete(key);
    return;
  }
  return JSON.parse(JSON.stringify(entry.value)) as T;
}
export function writeDraft(key: string, value: Record<string, unknown>) {
  if (!key) return;
  const safe = Object.fromEntries(
    Object.entries(value).filter(
      ([k, v]) =>
        !/(password|secret|api.?key|token|credential|file|image|photo)/i.test(
          k,
        ) &&
        (typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean" ||
          (Array.isArray(v) && v.every((s) => typeof s === "string"))),
    ),
  );
  if (drafts.size >= 30 && !drafts.has(key))
    drafts.delete(drafts.keys().next().value!);
  drafts.set(key, {
    updated: Date.now(),
    value: JSON.parse(JSON.stringify(safe)),
  });
}
export function removeDraft(key: string) {
  drafts.delete(key);
}
export function clearDrafts() {
  drafts.clear();
}

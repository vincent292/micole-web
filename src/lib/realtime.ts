import type { Collection } from "./types";
const lightChanges: Record<string, Collection[]> = {
 messages: ["messages"], daily_entries: ["dailyEntries"], announcements: ["announcements"],
 calendar_events: ["events"], grades: ["grades"], family_requests: ["requests"],
 media_assets: ["media"], student_documents: ["studentDocuments"], notifications: ["notifications"],
};
/** Cambios de permisos, personas o pagos requieren reconstruir todo el acceso. */
export function realtimeCollections(tables: Iterable<string>): Collection[] | undefined {
 const selected = new Set<Collection>(["notifications", "auditEvents"]);
 let hasChanges = false;
 for (const table of tables) {
  hasChanges = true;
  if (!lightChanges[table]) return undefined;
  for (const collection of lightChanges[table]) selected.add(collection);
 }
 return hasChanges ? [...selected] : undefined;
}

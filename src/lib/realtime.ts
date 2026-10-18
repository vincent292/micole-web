import type { Collection } from "./types";
const lightChanges: Record<string, Collection[]> = {
  school_subjects: ["subjects", "classSubjects", "subjectTeachers", "assignments", "submissions", "assignmentFiles"],
  class_subjects: ["subjects", "classSubjects", "subjectTeachers", "assignments", "submissions", "assignmentFiles"],
  subject_teachers: ["subjects", "classSubjects", "subjectTeachers", "assignments", "submissions", "assignmentFiles"],
  assignments: ["subjects", "classSubjects", "subjectTeachers", "assignments", "submissions", "assignmentFiles"],
  assignment_submissions: ["subjects", "classSubjects", "subjectTeachers", "assignments", "submissions", "assignmentFiles"],
  assignment_files: ["subjects", "classSubjects", "subjectTeachers", "assignments", "submissions", "assignmentFiles"],

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

import type { Collection } from "./types";
const learning: Collection[] = ["subjects", "classSubjects", "subjectTeachers", "assignments", "submissions", "assignmentFiles"];
const finance: Collection[] = ["charges", "schoolReceipts", "invoiceRequests", "students"];
const changes: Record<string, Collection[]> = {
  bolivia_school_profiles: [], bolivia_pedagogical_documents: [],
  timetable_versions: [], academic_class_policies: [], academic_reinforcements: [], academic_reinforcement_changes: [], promotion_batches: [],
  classroom_interviews: [], interview_responses: [], classroom_staff_messages: [],
  messages: ["messages"], daily_entries: ["dailyEntries"], announcements: ["announcements"],
  announcement_receipts: ["announcements"], calendar_events: ["events"], grades: ["grades"],
  family_requests: ["requests"], media_assets: ["media"], student_documents: ["studentDocuments"],
  notifications: ["notifications"], demo_requests: ["demoRequests"],
  school_subjects: learning, class_subjects: learning, subject_teachers: learning,
  assignments: learning, assignment_submissions: learning, assignment_files: learning,
  academic_requests: ["academicRequests", "events", ...finance],
  activity_participations: ["activityParticipations", ...finance],
  school_charges: finance, school_payments: finance, school_receipts: finance,
  invoice_requests: ["invoiceRequests", "schoolReceipts"],
  financial_files: ["invoiceRequests", "schoolReceipts"], payment_submissions: finance,
  payment_plans: ["paymentPlans", ...finance],
  family_intake_forms: ["familyIntakes", "students"],
  platform_charges: ["platformCharges", "schools", "students", ...learning, "events", "dailyEntries", "media", "grades", "announcements"],
  platform_payments: ["platformCharges", "schools", "students", ...learning, "events", "dailyEntries", "media", "grades", "announcements"],
  institution_requests: ["institutionRequests"], invitations: ["invitations"],
  school_operation_settings: ["operationSettings"],
  // These modules read their own permission checked RPC through workspaceEvents.
  gradebook_rules: [], gradebook_settings: [], assessment_score_changes: [],
  assessment_scores: [], assessments: [], academic_terms: [], report_cards: [], care_records: [],
  student_attendance_sessions: [],
  staff_attendance_settings: [], staff_work_profiles: [], staff_attendance_records: [],
  staff_attendance_changes: [], staff_payrolls: [],
  admission_templates: [], document_imports: [], content_view_events: [],
  bank_qr_intents: [], bank_connections: [], platform_credit_accounts: [], platform_credit_ledger: [],
  platform_tariffs: [], notification_test_runs: [],
};
/** Unknown/access changes reload the authorized workspace; routine content reads only its dependencies. */
export function realtimeCollections(tables: Iterable<string>): Collection[] | undefined {
  const selected = new Set<Collection>();
  let any = false;
  for (const table of tables) {
    any = true;
    if (["school_charges", "school_payments", "platform_charges", "platform_payments", "platform_credit_accounts", "platform_credit_ledger"].includes(table) || !(table in changes)) return undefined;
    for (const collection of changes[table]) selected.add(collection);
  }
  if (!any) return [];
  if (selected.size) { selected.add("notifications"); selected.add("auditEvents"); }
  return [...selected];
}

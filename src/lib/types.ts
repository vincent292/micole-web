export type Role = "superadmin" | "director" | "teacher" | "guardian" | "student";
export type Status = "active" | "pending" | "inactive";
export type ChargeStatus = "pending" | "paid" | "overdue" | "cancelled";
export interface School {
  platformEnabled?: boolean;
  activationEnabled?: boolean;
  id: string;
  name: string;
  slug: string;
  initials: string;
  city: string;
  director: string;
  color: string;
  status: Status;
  createdAt: string;
  logoUrl?: string;
  bannerUrl?: string;
  mapsUrl?: string;
  directorIdentity?: string;
  directorPhone?: string;
  phone?: string;
  nit?: string;
  address?: string;
  website?: string;
  showOnLanding?: boolean;
  activeStudentCount?: number;
}
export interface Classroom {
  subjectsEnabled?: boolean;
  id: string;
  schoolId: string;
  name: string;
  level: string;
  schedule: string;
  teacherIds: string[];
  startTime?: string;
  endTime?: string;
  weekdays?: number[];
  capacity?: number;
  monthlyFee?: number;
  academicYear?: number;
  active?: boolean;
}
export interface Teacher {
  id: string;
  schoolId: string;
  name: string;
  email: string;
  specialty: string;
  status: Status;
  userId?: string;
}
export interface Student {
  id: string;
  schoolId: string;
  classroomId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  guardianName: string;
  guardianEmail: string;
  allergies: string;
  monthlyFee: number;
  status: Status;
  enrolledAt: string;
  withdrawnAt?: string;
  withdrawalReason?: string;
  foodRestrictions?: string;
  emergencyPhone?: string;
  emergencyContact?: string;
  accessUntil?: string;
  snackFee?: number;
  enrollmentFee?: number;
  profileComplete?: boolean;
  rude?: string;
  identityNumber?: string;
  motherName?: string;
  motherEmail?: string;
  motherPhone?: string;
  fatherName?: string;
  fatherEmail?: string;
  fatherPhone?: string;
  hasInsurance?: boolean;
  insuranceProvider?: string;
  insuranceNumber?: string;
  medicalConditions?: string;
  careInstructions?: string;
  secondEmergencyContact?: string;
  secondEmergencyPhone?: string;
}
export interface Charge {
  id: string;
  schoolId: string;
  studentId: string;
  concept: string;
  dueDate: string;
  amount: number;
  status: ChargeStatus;
  paidAt?: string;
  period?: string;
  planId?: string;
  baseAmount?: number;
  snackAmount?: number;
  licenseAmount?: number;
  discountAmount?: number;
  invoiceName?: string;
  invoiceNit?: string;
  invoicePhone?: string;
  paidAmount?: number;
  minimumAccessRatio?: number;
  academicRequestId?: string;
}
export interface PlatformCharge {
  kind?: "activation" | "license" | "credit_topup";
  creditApplied?: number;
  licenseCount?: number;
  unitAmount?: number;
  id: string;
  schoolId: string;
  studentId?: string;
  concept: string;
  period: string;
  amount: number;
  status: ChargeStatus;
}
export interface Announcement {
  id: string;
  schoolId: string;
  title: string;
  content: string;
  audience: "all" | "staff" | "families";
  createdAt: string;
  classroomId?: string;
}
export interface DailyEntry {
  id: string;
  schoolId: string;
  studentId: string;
  category: "actividad" | "alimentación" | "descanso" | "observación" | "tarea";
  note: string;
  date: string;
}
export interface PaymentPlan {
  licenseFee?: number;
  id: string;
  schoolId: string;
  studentId: string;
  startDate: string;
  months: number;
  monthlyFee: number;
  snackFee: number;
  enrollmentFee: number;
  dueDay: number;
  discount: number;
  discountFrom: string;
  discountTo: string;
  prorate: boolean;
  createdAt: string;
}
export interface FamilyRequest {
  pickupFileId?: string;
  pickupFileUrl?: string;
  pickupVerifiedAt?: string;
  pickupVerifiedBy?: string;
  pickupVerificationNote?: string;
  id: string;
  schoolId: string;
  studentId: string;
  type: "absence" | "pickup";
  date: string;
  reason: string;
  pickupName: string;
  pickupId: string;
  vehiclePlate: string;
  status: "pending" | "approved" | "rejected";
  response: string;
  createdAt: string;
}
export interface CalendarEvent {
  id: string;
  schoolId: string;
  classroomId: string;
  title: string;
  date: string;
  description: string;
  type: "event" | "homework" | "materials";
}
export interface Message {
  id: string;
  schoolId: string;
  studentId: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
}
export interface Grade {
  classSubjectId?: string;
  id: string;
  schoolId: string;
  studentId: string;
  subject: string;
  period: string;
  score: string;
  recommendation: string;
  createdAt: string;
}
export interface Invitation {
  id: string;
  schoolId: string;
  studentId?: string;
  teacherId?: string;
  email: string;
  role: Exclude<Role, "superadmin">;
  relationship: string;
  expiresAt: string;
  status: "pending" | "accepted" | "revoked";
  token?: string;
}
export interface MediaAsset {
  id: string;
  schoolId: string;
  studentId: string;
  caption: string;
  objectKey: string;
  mimeType: string;
  createdAt: string;
  localUrl?: string;
}
export interface InstitutionRequest {
  id: string;
  userId: string;
  email: string;
  schoolName: string;
  city: string;
  contactName: string;
  phone: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  schoolId?: string;
  response: string;
  createdAt: string;
}
export interface Notification {
  id: string;
  userId: string;
  schoolId?: string;
  studentId?: string;
  classroomId?: string;
  kind: string;
  sourceId: string;
  title: string;
  body: string;
  target: string;
  readAt?: string;
  createdAt: string;
}
export interface AuditEvent {
  id: string;
  schoolId?: string;
  actorId?: string;
  actorName: string;
  entity: string;
  entityId: string;
  action: string;
  summary: {
    name?: string;
    status?: string;
    previousStatus?: string;
    amount?: string;
    supportSessionId?: string;
    supportRole?: string;
    targetUserId?: string;
    role?: string;
    reason?: string;
  };
  createdAt: string;
}
export interface CareProfile {
  allergies: string;
  foodRestrictions: string;
  emergencyContact: string;
  emergencyPhone: string;
  secondEmergencyContact: string;
  secondEmergencyPhone: string;
  hasInsurance: boolean;
  insuranceProvider: string;
  insuranceNumber: string;
  medicalConditions: string;
  careInstructions: string;
}
export interface FamilyIntake {
  id: string;
  schoolId: string;
  studentId: string;
  recipient: "mother" | "father";
  recipientEmail: string;
  status: "open" | "submitted" | "approved" | "revoked";
  profile?: CareProfile;
  token?: string;
  createdAt: string;
  expiresAt: string;
  submittedAt?: string;
}
export interface StudentDocument {
  id: string;
  schoolId: string;
  studentId: string;
  category: "ci" | "birth_certificate" | "insurance" | "other";
  fileName: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
  localUrl?: string;
}
export interface StudentLoginAccount {
  studentId: string;
  email: string;
  enabled: boolean;
}
export interface StudentPortalAccess {
  allowed: boolean;
  message: string;
}
export interface AcademicRequest {
 id: string; schoolId: string; classroomId: string;
 kind: "annual_materials" | "monthly_materials" | "specific_materials" | "activity";
 academicYear: number; title: string; details: string; eventDate: string;
 amount: number; dueDate?: string; blocksAccess: boolean;
 status: "pending" | "approved" | "rejected"; createdBy: string;
 reviewedBy?: string; reviewNote: string; createdAt: string;
}
export interface ActivityParticipation {
 id: string; requestId: string; studentId: string; schoolId: string;
 participating: boolean; reason: string;
}
export interface SchoolReceipt {
 id: string; schoolId: string; studentId: string; total: number;
 paymentMethod: "cash" | "transfer" | "qr"; reference: string;
 items?: { chargeId: string; concept: string; amount: number }[];
 verificationSource: "manual" | "provider"; recordedBy: string; createdAt: string;
}
export interface InvoiceRequest {
 id: string; schoolId: string; studentId: string; receiptId: string;
 legalName: string; nitCi: string; phone: string; amount: number;
 status: "pending" | "issued"; invoiceNumber: string; issuedAt?: string; createdAt: string;
}
export interface OperationSettings {
 familyPolicy?: 'both'|'mother'|'father'; childCiRequired?: boolean;
 id: string; schoolId: string; finalFullInstallments: number; requireAnnualMaterials: boolean;
}
export interface SubjectCatalogItem { id: string; name: string; normalizedName?: string }
export interface SchoolSubject extends SubjectCatalogItem { schoolId: string }
export interface ClassSubject { id: string; schoolId: string; classroomId: string; subjectId: string; active: boolean }
export interface SubjectTeacher { id: string; schoolId: string; classSubjectId: string; teacherId: string }
export interface Assignment { id: string; schoolId: string; classroomId: string; classSubjectId?: string; title: string; instructions: string; dueAt?: string; allowLate: boolean; maxScore: number; status: 'draft' | 'published' | 'closed'; createdBy: string; createdAt: string; updatedAt: string }
export interface AssignmentSubmission { id: string; schoolId: string; assignmentId: string; studentId: string; body: string; status: 'draft' | 'submitted' | 'returned' | 'reviewed'; score?: number; feedback: string; submittedBy: string; submittedAt?: string; reviewedAt?: string; updatedAt: string; revision: number }
export interface AssignmentFile { id: string; schoolId: string; submissionId: string; fileName: string; mimeType: string; sizeBytes: number; status: 'pending' | 'ready'; uploadedBy: string; createdAt: string }
export interface DemoRequest {id:string;schoolName:string;contactName:string;email:string;phone:string;city:string;message:string;status:'pending'|'contacted'|'closed';notes:string;createdAt:string;reviewedAt?:string}
export interface AppData {
  demoRequests: DemoRequest[];
  subjectCatalog: SubjectCatalogItem[];
  subjects: SchoolSubject[];
  classSubjects: ClassSubject[];
  subjectTeachers: SubjectTeacher[];
  assignments: Assignment[];
  submissions: AssignmentSubmission[];
  assignmentFiles: AssignmentFile[];

  academicRequests: AcademicRequest[];
  activityParticipations: ActivityParticipation[];
  schoolReceipts: SchoolReceipt[];
  invoiceRequests: InvoiceRequest[];
  operationSettings: OperationSettings[];
  studentPortalAccess?: StudentPortalAccess;
  familyIntakes: FamilyIntake[];
  studentDocuments: StudentDocument[];
  institutionRequests: InstitutionRequest[];
  notifications: Notification[];
  auditEvents: AuditEvent[];
  schools: School[];
  classrooms: Classroom[];
  teachers: Teacher[];
  students: Student[];
  charges: Charge[];
  platformCharges: PlatformCharge[];
  announcements: Announcement[];
  dailyEntries: DailyEntry[];
  paymentPlans: PaymentPlan[];
  requests: FamilyRequest[];
  events: CalendarEvent[];
  messages: Message[];
  grades: Grade[];
  invitations: Invitation[];
  media: MediaAsset[];
}
export type Collection = Exclude<keyof AppData, "studentPortalAccess">;
export interface Membership {
  schoolId: string;
  role: Exclude<Role, "superadmin">;
}
export interface SupportSession {
  mode?: "support" | "test";
  id: string;
  schoolId: string;
  role: Exclude<Role, "superadmin">;
  reason: string;
  expiresAt: string;
  adminId: string;
}
export interface SupportAccount {
  id: string;
  name: string;
  email: string;
  role: Exclude<Role, "superadmin">;
}
export interface Identity {
  canSupport?: boolean;
  support?: SupportSession;
  id: string;
  email: string;
  name: string;
  roles: Role[];
  memberships: Membership[];
  teacherIds: string[];
  guardianStudentIds: string[];
  studentIds?: string[];
}

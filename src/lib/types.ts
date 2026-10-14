export type Role = "superadmin" | "director" | "teacher" | "guardian";
export type Status = "active" | "pending" | "inactive";
export type ChargeStatus = "pending" | "paid" | "overdue" | "cancelled";
export interface School {
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
  phone?: string;
  nit?: string;
  address?: string;
  website?: string;
  showOnLanding?: boolean;
  activeStudentCount?: number;
}
export interface Classroom {
  id: string;
  schoolId: string;
  name: string;
  level: string;
  schedule: string;
  teacherIds: string[];
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
}
export interface PlatformCharge {
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
export interface AppData {
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
export type Collection = keyof AppData;
export interface Membership {
  schoolId: string;
  role: Exclude<Role, "superadmin">;
}
export interface SupportSession {
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
}

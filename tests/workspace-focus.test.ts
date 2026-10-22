import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AppData } from "../src/lib/types";
const emptyData = () =>
  Object.fromEntries(
    [
      "classrooms",
      "students",
      "teachers",
      "grades",
      "dailyEntries",
      "requests",
      "media",
      "messages",
      "studentDocuments",
      "charges",
      "paymentPlans",
      "schoolReceipts",
      "invoiceRequests",
      "events",
      "announcements",
      "academicRequests",
      "classSubjects",
      "subjectTeachers",
      "assignments",
      "submissions",
      "assignmentFiles",
      "familyIntakes",
      "platformCharges",
      "notifications",
    ].map((k) => [k, []]),
  ) as unknown as AppData;
import {
  canReadRecord,
  focusData,
  recordTabs,
  schoolRooms,
  dayActions,
  recordAcademicAccess,
} from "../src/lib/workspaceFocus";
import {
  clearDrafts,
  draftKey,
  readDraft,
  writeDraft,
} from "../src/lib/sessionDraft";
import type { Identity, Student, Classroom } from "../src/lib/types";
const room = {
  id: "r1",
  schoolId: "s1",
  teacherIds: ["t1"],
  name: "Primero",
  level: "Primaria",
  schedule: "08:00",
} as Classroom;
const child = {
  id: "a1",
  schoolId: "s1",
  classroomId: "r1",
  firstName: "Uno",
  lastName: "Prueba",
  status: "active",
  profileComplete: true,
} as Student;
const identity = {
  id: "u1",
  roles: ["teacher"],
  memberships: [{ schoolId: "s1", role: "teacher" }],
  teacherIds: ["t1"],
  guardianStudentIds: [],
} as unknown as Identity;
function data() {
  const d = emptyData();
  d.classrooms = [
    room,
    { ...room, id: "r2", teacherIds: ["t2"] },
    { ...room, id: "r3", schoolId: "s2" },
  ];
  d.students = [
    child,
    { ...child, id: "a2" },
    { ...child, id: "a3", classroomId: "r2" },
    { ...child, id: "a4", schoolId: "s2" },
  ];
  for (const key of [
    "grades",
    "dailyEntries",
    "requests",
    "media",
    "messages",
    "studentDocuments",
    "charges",
    "paymentPlans",
    "schoolReceipts",
    "invoiceRequests",
  ] as const)
    (d[key] as unknown[]) = [
      { id: "own", schoolId: "s1", studentId: "a1" },
      { id: "sibling", schoolId: "s1", studentId: "a2" },
      { id: "foreign", schoolId: "s2", studentId: "a4" },
    ];
  d.events = [
    { id: "global", schoolId: "s1", classroomId: "" },
    { id: "room", schoolId: "s1", classroomId: "r1" },
    { id: "other", schoolId: "s1", classroomId: "r2" },
    { id: "foreign", schoolId: "s2" },
  ] as typeof d.events;
  return d;
}
describe("espacios por aula y expediente", () => {
  it("limita aulas del docente e impide leer expedientes ajenos o de otra sede", () => {
    const d = data();
    expect(schoolRooms(d, "s1", "teacher", identity).map((r) => r.id)).toEqual([
      "r1",
    ]);
    expect(canReadRecord(child, "teacher", identity, d, "s1")).toBe(true);
    expect(canReadRecord(d.students[2], "teacher", identity, d, "s1")).toBe(
      false,
    );
    expect(
      canReadRecord(
        d.students[3],
        "director",
        { ...identity, memberships: [{ schoolId: "s1", role: "director" }] },
        d,
        "s1",
      ),
    ).toBe(false);
    expect(
      canReadRecord(
        child,
        "guardian",
        { ...identity, guardianStudentIds: ["a2"] },
        d,
        "s1",
      ),
    ).toBe(false);
  });
  it("el expediente mantiene un solo alumno y excluye datos financieros y documentos para docentes", () => {
    const d = data(),
      teacher = focusData(d, room, [child], "teacher"),
      parent = focusData(d, room, [child], "guardian");
    expect(teacher.students.map((s) => s.id)).toEqual(["a1"]);
    expect(teacher.grades.map((s) => s.id)).toEqual(["own"]);
    expect(teacher.studentDocuments).toEqual([]);
    expect(teacher.charges).toEqual([]);
    expect(teacher.paymentPlans).toEqual([]);
    expect(teacher.invoiceRequests).toEqual([]);
    expect(recordTabs("teacher")).not.toContain("account");
    expect(parent.studentDocuments.map((s) => s.id)).toEqual(["own"]);
    expect(parent.charges.map((s) => s.id)).toEqual(["own"]);
    expect(parent.events.map((e) => e.id)).toEqual(["global", "room"]);
  });
  it("una familia con ficha incompleta conserva el expediente pero no el contenido académico", () => {
    expect(
      recordAcademicAccess(
        { ...child, profileComplete: false },
        "guardian",
        data(),
        identity,
      ),
    ).toBe(false);
    expect(recordTabs("guardian")).toContain("health");
    expect(recordTabs("guardian")).toContain("attendance");
  });
  it("el inicio usa pendientes reales del rol y no ofrece cobros al docente", () => {
    const d = data();
    d.requests = [
      { id: "1", schoolId: "s1", studentId: "a1", status: "pending" },
      { id: "2", schoolId: "s2", studentId: "a4", status: "pending" },
    ] as typeof d.requests;
    const actions = dayActions(d, "s1", "teacher", [child]);
    expect(actions.find((a) => a.key === "requests")?.count).toBe(1);
    expect(
      actions.some((a) => ["payments", "cash", "invoices"].includes(a.page)),
    ).toBe(false);
    expect(
      dayActions(d, "s1", "guardian", [child], child).some(
        (a) => a.page === "studentRecord",
      ),
    ).toBe(true);
  });
});
beforeEach(() => clearDrafts());
afterEach(() => {
  vi.useRealTimers();
  clearDrafts();
});
it("aísla borradores por persona, rol, sede y soporte; evita guardar claves o archivos", () => {
  const k = draftKey("u", "director", "s", "support1", "student:new");
  writeDraft(k, {
    firstName: "Prueba",
    password: "NO",
    apiKey: "NO",
    photo: "NO",
    _id: "fixed",
    months: 3,
  });
  expect(readDraft(k)).toEqual({
    firstName: "Prueba",
    _id: "fixed",
    months: 3,
  });
  for (const other of [
    draftKey("u2", "director", "s", "support1", "student:new"),
    draftKey("u", "teacher", "s", "support1", "student:new"),
    draftKey("u", "director", "other", "support1", "student:new"),
    draftKey("u", "director", "s", "support2", "student:new"),
  ])
    expect(readDraft(other)).toBeUndefined();
  clearDrafts();
  expect(readDraft(k)).toBeUndefined();
});
it("los borradores caducan y no comparten referencias mutables", () => {
  vi.useFakeTimers();
  const k = "test";
  writeDraft(k, { names: ["Uno"] });
  const value = readDraft<{ names: string[] }>(k)!;
  value.names.push("Otro");
  expect(readDraft(k)).toEqual({ names: ["Uno"] });
  vi.advanceTimersByTime(2 * 60 * 60 * 1000 + 1);
  expect(readDraft(k)).toBeUndefined();
});

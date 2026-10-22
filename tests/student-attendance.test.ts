import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  attendanceCounts,
  attendanceMarks,
  attendanceCsv,
  type AttendanceWorkspace,
} from "../src/lib/studentAttendance";
import { demoStudentAttendanceRpc } from "../src/lib/demo-student-attendance";
import { setDemoRole } from "../src/lib/demo-config";
import { readDemoData, resetDemo } from "../src/lib/demo";
import { today } from "../src/lib/billing";
it("distingue sin marcar, falta, presente, tardanza y permiso", () => {
  expect(
    attendanceCounts([
      { status: "" },
      { status: null },
      { status: "absent" },
      { status: "present" },
      { status: "late" },
      { status: "excused" },
    ]),
  ).toEqual({ pending: 2, absent: 1, present: 1, late: 1, excused: 1 });
  const data = {
    roster: [{ student_id: "one", student_name: "Alumno" }],
    records: [],
  } as unknown as AttendanceWorkspace;
  expect(attendanceMarks(data, "2026-10-21")).toEqual([
    { studentId: "one", status: "", note: "" },
  ]);
});
it("exporta solo registros confirmados y neutraliza fórmulas CSV", () => {
  const csv = attendanceCsv([
    {
      id: "1",
      studentId: "one",
      studentName: "=FORMULA()",
      date: "2026-10-21",
      status: "present",
      note: '"nota"',
      confirmed: true,
      revision: 1,
      sessionId: "s",
    },
    {
      id: "2",
      studentId: "two",
      studentName: "Oculto",
      date: "2026-10-21",
      status: "absent",
      note: "",
      confirmed: false,
      revision: 1,
      sessionId: "s",
    },
  ]);
  expect(csv).toContain("'=FORMULA()");
  expect(csv).toContain("Presente");
  expect(csv).not.toContain("Oculto");
});
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Sin servicios externos en demo");
    }),
  );
  setDemoRole("director");
});
afterEach(() => vi.unstubAllGlobals());
it("la demo guarda borradores, confirma, notifica una vez y permite consultar al familiar sin red", async () => {
  const data = readDemoData(),
    room = data.students.find((s) => s.id === "a1")!.classroomId;
  const p = {
    p_classroom_id: room,
    p_day: today(),
    p_month: today().slice(0, 7) + "-01",
  };
  const workspace = (await demoStudentAttendanceRpc(
    "student_attendance_workspace",
    p,
  )) as AttendanceWorkspace;
  const marks = attendanceMarks(workspace, today()).map((m) => ({
    ...m,
    status: m.studentId === "a1" ? "absent" : "present",
  }));
  await demoStudentAttendanceRpc("save_student_attendance", {
    ...p,
    p_records: marks,
    p_revision: 0,
    p_confirm: false,
  });
  expect(
    readDemoData().notifications.filter((n) => n.kind === "attendance_absent"),
  ).toHaveLength(0);
  await demoStudentAttendanceRpc("save_student_attendance", {
    ...p,
    p_records: marks,
    p_revision: 1,
    p_confirm: true,
  });
  expect(
    readDemoData().notifications.filter((n) => n.kind === "attendance_absent"),
  ).toHaveLength(1);
  await expect(
    demoStudentAttendanceRpc("save_student_attendance", {
      ...p,
      p_records: marks,
      p_revision: 1,
      p_confirm: true,
    }),
  ).rejects.toThrow("Otra persona");
  await demoStudentAttendanceRpc("save_student_attendance", {
    ...p,
    p_records: marks,
    p_revision: 2,
    p_confirm: true,
    p_reason: "Revisado otra vez",
  });
  expect(
    readDemoData().notifications.filter((n) => n.kind === "attendance_absent"),
  ).toHaveLength(1);
  setDemoRole("guardian");
  const family = (await demoStudentAttendanceRpc(
    "student_attendance_workspace",
    { ...p, p_student_id: "a1" },
  )) as AttendanceWorkspace;
  expect(family.canManage).toBe(false);
  expect(family.records).toHaveLength(1);
  expect(family.records[0].status).toBe("absent");
  await expect(
    demoStudentAttendanceRpc("save_student_attendance", {
      ...p,
      p_records: marks,
      p_revision: 3,
      p_confirm: true,
    }),
  ).rejects.toThrow("pasar lista");
  expect(fetch).not.toHaveBeenCalled();
  resetDemo();
  expect(
    localStorage.getItem("micole_public_demo_student_attendance_v1"),
  ).toBeNull();
});

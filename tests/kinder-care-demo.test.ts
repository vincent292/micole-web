import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoDataKey, demoRpc, readDemoData, readDemoWorkspace, writeDemoData } from "../src/lib/demo";
import { setDemoRole } from "../src/lib/demo-config";
import { today } from "../src/lib/billing";

function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, String(value)), removeItem: (key: string) => values.delete(key), clear: () => values.clear() };
}
beforeEach(() => {
  vi.stubGlobal("localStorage", storage()); vi.stubGlobal("sessionStorage", storage()); vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("La demo no debe consultar servicios externos."); }));
  setDemoRole("director");
});
afterEach(() => { vi.unstubAllGlobals(); });

function payload() {
  const data = readDemoData();
  const room = data.classrooms.find(row => row.id === "c1")!;
  const children = data.students.filter(row => row.classroomId === room.id).slice(0, 2);
  for (const child of children) child.status = "active";
  writeDemoData(data);
  const records = children.map((child, index) => ({ student_id: child.id, kind: "meal", occurred_at: "10:00", food: "Merienda", amount: index ? "little" : "all", note: index ? "Comió poco." : "" }));
  return { p_school_id: room.schoolId, p_classroom_id: room.id, p_day: today(), p_request_id: crypto.randomUUID(), p_records: records };
}

describe("cuidados rápidos de demostración", () => {
  it("conserva excepciones por niño y no duplica un reintento con el mismo identificador", async () => {
    const request = payload(), before = readDemoWorkspace().care.length;
    expect(request.p_records).toHaveLength(2);
    expect(await demoRpc("save_care_batch", request)).toEqual({ saved: 2 });
    expect(await demoRpc("save_care_batch", request)).toEqual({ saved: 2 });
    const rows = readDemoWorkspace().care.slice(before);
    expect(rows).toHaveLength(2);
    expect(rows.map(row => [row.amount, row.note])).toEqual([["all", ""], ["little", "Comió poco."]]);
    await expect(demoRpc("save_care_batch", { ...request, p_records: request.p_records.map(row => ({ ...row, amount: "none" })) })).rejects.toThrow(/otros datos/);
    expect(readDemoWorkspace().care).toHaveLength(before + 2);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("valida todo antes de guardar y permite corregir una solicitud que nunca se guardó", async () => {
    const request = payload(), before = readDemoWorkspace().care.length;
    await expect(demoRpc("save_care_batch", { ...request, p_records: [request.p_records[0], { ...request.p_records[1], amount: "invalid" }] })).rejects.toThrow();
    expect(readDemoWorkspace().care).toHaveLength(before);
    expect(await demoRpc("save_care_batch", request)).toEqual({ saved: 2 });
  });
  it("respeta roles, aula docente, niños activos, fecha y registro individual de incidentes", async () => {
    const request = payload();
    setDemoRole("guardian");
    await expect(demoRpc("save_care_batch", request)).rejects.toThrow(/Dirección o Docente/);
    setDemoRole("teacher");
    const data = readDemoData(), other = data.classrooms.find(room => !room.teacherIds.includes("t1"))!;
    await expect(demoRpc("save_care_batch", { ...request, p_classroom_id: other.id })).rejects.toThrow(/docente del aula/);
    await expect(demoRpc("save_care_batch", { ...request, p_day: "2100-01-01" })).rejects.toThrow(/día actual/);
    await expect(demoRpc("save_care_batch", { ...request, p_records: [{ ...request.p_records[0], kind: "incident" }] })).rejects.toThrow(/individualmente/);
    await expect(demoRpc("save_care_batch", { ...request, p_records: [request.p_records[0], request.p_records[0]] })).rejects.toThrow(/una sola vez/);
    data.students.find(student => student.id === request.p_records[0].student_id)!.status = "pending";
    writeDemoData(data);
    await expect(demoRpc("save_care_batch", request)).rejects.toThrow(/niños activos/);
  });
  it("usa el contexto del modo local sin copiar su información al almacenamiento de la demo pública", async () => {
    const data = readDemoData();
    const school = { ...data.schools[0], id: "local-school", name: "Kínder local" };
    const room = { ...data.classrooms[0], id: "local-room", schoolId: school.id, teacherIds: ["t1"] };
    const student = { ...data.students[0], id: "local-child", schoolId: school.id, classroomId: room.id, status: "active" as const };
    const local = { ...data, schools: [school], classrooms: [room], students: [student], teachers: data.teachers.map(row => ({ ...row, schoolId: school.id })) };
    localStorage.setItem("aulanexo_demo_v2", JSON.stringify(local));
    const storedPublic = localStorage.getItem(demoDataKey);
    const request = { p_school_id: school.id, p_classroom_id: room.id, p_day: today(), p_request_id: crypto.randomUUID(), p_records: [{ student_id: student.id, kind: "mood", occurred_at: "10:00", mood: "happy", note: "Participó con alegría." }] };
    expect(await demoRpc("save_care_batch", request)).toEqual({ saved: 1 });
    const result = await demoRpc<{ care: { studentId: string; note: string }[] }>("school_workspace", { p_school_id: school.id, p_from: today(), p_to: today() });
    expect(result.care.some(row => row.studentId === student.id && row.note === "Participó con alegría.")).toBe(true);
    expect(localStorage.getItem(demoDataKey)).toBe(storedPublic);
    expect(JSON.parse(localStorage.getItem("aulanexo_demo_v2")!)).toEqual(local);
  });
});

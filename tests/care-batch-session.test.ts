import { afterEach, describe, expect, it } from "vitest";
import { clearCareBatchAttempt, readCareBatchAttempt, rememberCareBatchAttempt, type CareBatchAttempt } from "../src/lib/careBatch";
import { clearDrafts } from "../src/lib/sessionDraft";

const values = { kind: "meal" as const, occurred_at: "09:00", ended_at: "", food: "Fruta", amount: "all", hygiene: "", mood: "", note: "" };
const attempt: CareBatchAttempt = { payload: { p_school_id: "school", p_classroom_id: "room", p_day: "2026-10-26", p_request_id: "request", p_records: [{ ...values, student_id: "child" }] }, values, roomName: "Inicial", children: [{ id: "child", name: "Niño de prueba" }] };
afterEach(clearDrafts);

describe("recuperación de un guardado de cuidados pendiente", () => {
  it("conserva el pedido al reabrir y aísla otros usuarios, roles y sedes", () => {
    rememberCareBatchAttempt("user:teacher:school", attempt);
    const restored = readCareBatchAttempt("user:teacher:school")!;
    restored.payload.p_records[0].amount = "half";
    expect(readCareBatchAttempt("user:teacher:school")?.payload.p_records[0].amount).toBe("all");
    expect(readCareBatchAttempt("user:guardian:school")).toBeUndefined();
    expect(readCareBatchAttempt("user:teacher:other-school")).toBeUndefined();
    expect(readCareBatchAttempt("other-user:teacher:school")).toBeUndefined();
    clearCareBatchAttempt("user:teacher:school");
    expect(readCareBatchAttempt("user:teacher:school")).toBeUndefined();
  });
  it("el cierre de sesión borra los pedidos pendientes con los demás borradores", () => {
    rememberCareBatchAttempt("scope", attempt);
    clearDrafts();
    expect(readCareBatchAttempt("scope")).toBeUndefined();
  });
});

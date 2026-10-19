import { describe, it, expect, vi } from "vitest";
import { platformBalance, parseTariffs } from "../src/lib/pricing";
import { validateDemoContact } from "../supabase/functions/demo-request/validate";
import { imageSignatureMatches } from "../supabase/functions/r2-media/pickup-image";
vi.mock("../src/lib/repository", () => ({ rpc: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({ liveMode: false }));
describe("saldos, formulario público y documentos privados", () => {
  it("conserva el importe emitido y cobra el saldo restante", () => {
    const c = { amount: 29, status: "pending", creditApplied: 7 };
    expect(platformBalance(c)).toBe(22);
    expect(c.amount).toBe(29);
    expect(platformBalance({ ...c, status: "paid" })).toBe(0);
    expect(platformBalance({ ...c, status: "cancelled" })).toBe(0);
  });
  it("acepta activación apagada con tarifa efectiva cero", () => {
    expect(
      parseTariffs({
        activationFee: 0,
        configuredActivationFee: 50,
        activationEnabled: false,
        monthlyLicenseFee: 29,
        inherited: true,
      }).activationFee,
    ).toBe(0);
    expect(() =>
      parseTariffs({ activationFee: 0, monthlyLicenseFee: 0 }),
    ).toThrow();
  });
  it("requiere consentimiento y datos válidos, sin aceptar valores arbitrarios", () => {
    const v = {
      schoolName: " MiCole ",
      contactName: " Contacto ",
      email: "CORREO@example.test",
      phone: "+591 70000000",
      city: "La Paz",
      consent: true,
    };
    expect(validateDemoContact(v)).toMatchObject({
      schoolName: "MiCole",
      email: "correo@example.test",
    });
    for (const patch of [
      { consent: false },
      { email: "inválido" },
      { phone: "abc" },
      { message: "a".repeat(1501) },
    ])
      expect(() => validateDemoContact({ ...v, ...patch })).toThrow();
  });
  it("no confirma HTML o un formato disfrazado de imagen", () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(imageSignatureMatches(png, "image/png")).toBe(true);
    expect(imageSignatureMatches(png, "image/jpeg")).toBe(false);
    expect(
      imageSignatureMatches(new TextEncoder().encode("<script>"), "image/png"),
    ).toBe(false);
    expect(
      imageSignatureMatches(new Uint8Array([255, 216, 255, 224]), "image/jpeg"),
    ).toBe(true);
  });
});

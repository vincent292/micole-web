import { describe, expect, it } from "vitest";
import { authenticationError, authenticationReturnError } from "../src/lib/authErrors";
describe("retorno de autenticación", () => {
 it("explica errores sin mostrar descripciones del proveedor ni tokens", () => {
  expect(authenticationReturnError("?error=access_denied&error_description=SECRETO", "")).toContain("no se completó");
  expect(authenticationReturnError("", "#error=access_denied&error_code=otp_expired&error_description=SECRETO")).toContain("venció");
  expect(authenticationReturnError("?error=server_error&error_description=SECRETO", "")).not.toContain("SECRETO");
  expect(authenticationReturnError("?code=oauth-code", "")).toBe("");
  expect(authenticationReturnError("", "#access_token=TOKEN")).toBe("");
 });
 it("traduce los fallos de envío y conexión", () => {
  expect(authenticationError({code:"over_email_send_rate_limit"})).toContain("Espera");
  expect(authenticationError({code:"email_address_not_authorized"})).toContain("Usa Google");
  expect(authenticationError({name:"AuthRetryableFetchError"})).toContain("conexión");
 });
});

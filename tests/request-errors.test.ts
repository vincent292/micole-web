import { expect, it } from "vitest";
import { requestError } from "../src/lib/requestErrors";

it.each([
  "Failed to fetch",
  "TypeError: Network request failed",
  'Error: fetch failed: java.net.UnknownHostException: Unable to resolve host "private.example"',
  "NetworkError when attempting to fetch resource.",
  "Load failed",
])("explica un fallo de conexión sin mostrar detalles técnicos: %s", message => {
  const error = requestError({ message });
  expect(error.message).toBe("No pudimos conectar. Revisa tu conexión y vuelve a intentarlo.");
  expect(error.message).not.toMatch(/guardado|guardó/);
});

it("conserva el mensaje y código de validación para que el formulario permita corregirlo", () => {
  const error = requestError({ message: "Elige un aula y una fecha hasta hoy.", code: "P0001" });
  expect(error.message).toBe("Elige un aula y una fecha hasta hoy.");
  expect(error.code).toBe("P0001");
});

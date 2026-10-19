import type { Role } from "./types";
/** Separate build: never grants real accounts or connects to production services. */
export const publicDemo = import.meta.env.VITE_PUBLIC_DEMO === "true";
export const publicDemoUrl =
  import.meta.env.VITE_DEMO_URL || "https://micole-demo.vercel.app";
export const demoPassword = "MiColeDemo2026!";
export const demoAccounts = [
  {
    role: "director",
    label: "Dirección",
    email: "direccion@micole.test",
    name: "María · Demo",
  },
  {
    role: "teacher",
    label: "Docente",
    email: "docente@micole.test",
    name: "Camila · Demo",
  },
  {
    role: "guardian",
    label: "Familia",
    email: "familia@micole.test",
    name: "Daniela · Demo",
  },
  {
    role: "student",
    label: "Estudiante",
    email: "estudiante@micole.test",
    name: "Sofía · Demo",
  },
] as const;
const sessionKey = "micole_public_demo_session";
export function demoRole(): Role | null {
  try {
    const role = sessionStorage.getItem(sessionKey);
    return demoAccounts.find((a) => a.role === role)?.role || null;
  } catch {
    return null;
  }
}
export function setDemoRole(role: Role | null) {
  if (role) sessionStorage.setItem(sessionKey, role);
  else sessionStorage.removeItem(sessionKey);
}
export function demoLogin(email: string, password: string) {
  const account = demoAccounts.find(
    (a) => a.email === email.trim().toLowerCase(),
  );
  if (!account || password !== demoPassword)
    throw new Error(
      "Usa uno de los correos ficticios y la clave de demostración que aparecen abajo.",
    );
  setDemoRole(account.role);
  return account.role;
}

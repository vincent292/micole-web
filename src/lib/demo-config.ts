import type { Role } from "./types";
/** Separate build: never grants real accounts or connects to production services. */
export const publicDemo = import.meta.env.VITE_PUBLIC_DEMO === "true";
export const publicDemoUrl =
  import.meta.env.VITE_DEMO_URL || "https://micole-demo.vercel.app";
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
export function isDemoEmail(email: string) {
  return /@micole\.test$/i.test(email.trim());
}
export function demoEntryUrl(email?: string) {
  const url = new URL(publicDemoUrl);
  const account = demoAccounts.find(
    (a) => a.email === email?.trim().toLowerCase(),
  );
  if (account) url.searchParams.set("perfil", account.role);
  return url.href;
}
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
export async function logoutDemo() {
  const response = await fetch("/__demo/logout", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("No se pudo cerrar la demo. Inténtalo otra vez.");
  setDemoRole(null);
  window.location.replace("/");
}

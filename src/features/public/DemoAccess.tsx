import { useEffect, useState } from "react";
import { Brand } from "../../components/Brand";
import { demoAccounts, demoRole, setDemoRole } from "../../lib/demo-config";

/** Credentials are checked by the server before this application is served. */
export function DemoAccess() {
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/__demo/session", {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !(await response.json()).authenticated)
          throw new Error(
            "Tu acceso a la demo venció. Vuelve a ingresar con las credenciales que te compartió MiCole.",
          );
        const requested = new URLSearchParams(window.location.search).get(
          "perfil",
        );
        setDemoRole(
          demoAccounts.find((a) => a.role === requested)?.role ||
            demoRole() ||
            "director",
        );
        window.location.replace("/app/overview");
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason.message || "No se pudo comprobar tu acceso.");
      });
    return () => controller.abort();
  }, []);
  return (
    <main className="loading-screen">
      <Brand />
      <h1>{error ? "Acceso privado a la demo" : "Preparando tu demo…"}</h1>
      {error && (
        <>
          <p role="alert">{error}</p>
          <a href="/" className="btn btn-primary">
            Volver a ingresar
          </a>
        </>
      )}
    </main>
  );
}

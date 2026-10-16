export function authenticationError(error: { code?: string; message?: string; name?: string }) {
  if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") return "Se hicieron varios intentos. Espera unos minutos antes de volver a ingresar.";
  if (error.code === "email_address_not_authorized") return "El servicio de correo aún no puede enviar a esta dirección. Usa Google o consulta a Dirección.";
  if (error.code === "otp_expired" || error.code === "access_denied") return "El enlace de acceso venció o ya fue utilizado. Solicita uno nuevo o ingresa con Google.";
  if (error.message?.includes("Failed to fetch") || error.name === "AuthRetryableFetchError") return "No pudimos conectar con el servicio de acceso. Revisa tu conexión e inténtalo de nuevo.";
  return error.message || "No pudimos iniciar sesión. Inténtalo de nuevo.";
}
export function authenticationReturnError(search: string, hash: string) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const code = query.get("error_code") || fragment.get("error_code");
  const error = query.get("error") || fragment.get("error");
  if (!code && !error) return "";
  if (code === "otp_expired") return authenticationError({ code });
  if (error === "access_denied") return "El ingreso no se completó. Puedes volver a intentarlo y elegir la cuenta registrada en tu colegio.";
  return "No pudimos completar el acceso. Solicita un enlace nuevo o vuelve a ingresar con Google.";
}

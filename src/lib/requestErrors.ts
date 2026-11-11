export function isConnectionError(error: { message?: string; name?: string }) {
  return error.name === "AuthRetryableFetchError" || /failed to fetch|fetch failed|network request failed|networkerror|load failed|unknownhostexception|unable to resolve host|econnrefused|enotfound|econnreset|etimedout/i.test(error.message || "");
}
export function requestError(error: { message?: string; code?: string; name?: string }) {
  const raw = error.message || "No pudimos completar la solicitud.";
  return Object.assign(new Error(isConnectionError(error)
    ? "No pudimos conectar. Revisa tu conexión y vuelve a intentarlo."
    : raw), { code: error.code });
}

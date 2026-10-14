export interface PublicInstitution {
  id: string;
  name: string;
  city: string;
  logoUrl: string;
  website: string;
}
// Optional manually maintained affiliates. Keep empty until real institutions join.
export const staticInstitutions: PublicInstitution[] = [];

const safeHttps = (value: unknown): string => {
  if (typeof value !== "string" || /[\s\u0000-\u001f<>"']/.test(value)) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname && !url.username && !url.password ? value : "";
  } catch { return ""; }
};
export function publicInstitutionList(value: unknown): PublicInstitution[] {
  if (!Array.isArray(value)) throw new Error("No se pudo leer la lista de instituciones.");
  const seen = new Set<string>();
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || seen.has(row.id) || typeof row.name !== "string" || !row.name.trim()) return [];
    seen.add(row.id);
    const rawLogo = typeof row.logoUrl === "string" ? row.logoUrl : "";
    const logoUrl = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(rawLogo) && rawLogo.length <= 350000 ? rawLogo : safeHttps(rawLogo);
    // Select exactly the public fields: never retain identity, billing or student data.
    return [{ id: row.id, name: row.name.trim().slice(0, 150), city: typeof row.city === "string" ? row.city.slice(0, 100) : "", logoUrl, website: safeHttps(row.website) }];
  });
}
export async function fetchPublicInstitutions(signal?: AbortSignal) {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (import.meta.env.VITE_APP_MODE === "demo" || !url || !key) return publicInstitutionList(staticInstitutions);
  // Public request deliberately independent of Auth, private stores and support headers.
  const response = await fetch(`${url.trim()}/rest/v1/rpc/landing_institutions`, {
    method: "POST", credentials: "omit", signal,
    headers: { apikey: key.trim(), "Content-Type": "application/json" }, body: "{}",
  });
  if (!response.ok) throw new Error("No pudimos cargar las instituciones. Intenta nuevamente.");
  return publicInstitutionList([...publicInstitutionList(await response.json()), ...staticInstitutions]);
}

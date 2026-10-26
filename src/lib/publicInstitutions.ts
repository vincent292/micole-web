export interface PublicInstitution {
  id: string;
  name: string;
  city: string;
  logoUrl: string;
  website: string;
  slug: string;
  bannerUrl: string;
  color: string;
  siteName: string;
  educationLevels: string[];
}
export interface PublicInstitutionProfile extends PublicInstitution {
  description: string;
  address: string;
  phone: string;
  mapsUrl: string;
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
const publicImage = (value: unknown, limit: number) => {
  if (typeof value !== "string" || value.length > limit || /\.svg([?#]|$)/i.test(value)) return "";
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : safeHttps(value);
};
const publicText = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export function institutionPath(institution: Pick<PublicInstitution, "slug">) {
  return `/instituciones/${encodeURIComponent(institution.slug)}`;
}
export function publicInstitutionList(value: unknown): PublicInstitution[] {
  if (!Array.isArray(value)) throw new Error("No se pudo leer la lista de instituciones.");
  const seen = new Set<string>();
  return value.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || seen.has(row.id) || typeof row.name !== "string" || !row.name.trim()) return [];
    seen.add(row.id);
    // Select exactly the public fields: never retain identity, billing or student data.
    return [{
      id: row.id, name: row.name.trim().slice(0, 150), city: publicText(row.city, 100),
      logoUrl: publicImage(row.logoUrl, 350000), website: safeHttps(row.website),
      slug: typeof row.slug === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(row.slug) ? row.slug : row.id,
      bannerUrl: publicImage(row.bannerUrl, 530000),
      color: typeof row.color === "string" && /^#[a-f0-9]{6}$/i.test(row.color) ? row.color : "#3D6EF7",
      siteName: publicText(row.siteName, 100),
      educationLevels: Array.isArray(row.educationLevels) ? [...new Set(row.educationLevels.filter((level): level is string => typeof level === "string" && level.length > 0 && level.length <= 60))].slice(0, 10) : [],
    }];
  });
}

export function publicInstitutionProfile(value: unknown): PublicInstitutionProfile | null {
  if (value === null) return null;
  const institution = publicInstitutionList([value])[0];
  if (!institution) throw new Error("No pudimos leer la información de la institución.");
  const row = value as Record<string, unknown>;
  const mapsUrl = safeHttps(row.mapsUrl);
  let safeMap = "";
  if (mapsUrl) {
    const url = new URL(mapsUrl);
    if ((url.hostname === "www.google.com" && /^\/maps(?:\/|$)/.test(url.pathname)) || url.hostname === "maps.google.com" || url.hostname === "maps.app.goo.gl") safeMap = mapsUrl;
  }
  return { ...institution, description: publicText(row.description, 2500), address: publicText(row.address, 500), phone: publicText(row.phone, 40), mapsUrl: safeMap };
}

async function publicRequest(name: string, params: object, signal?: AbortSignal) {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (import.meta.env.VITE_APP_MODE === "demo" || !url || !key) return undefined;
  // Public requests deliberately exclude Auth, private stores and support headers.
  const response = await fetch(`${url.trim()}/rest/v1/rpc/${name}`, {
    method: "POST", credentials: "omit", signal,
    headers: { apikey: key.trim(), "Content-Type": "application/json" }, body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error("No pudimos cargar las instituciones. Intenta nuevamente.");
  return response.json() as Promise<unknown>;
}

export async function fetchPublicInstitutions(signal?: AbortSignal) {
  const value = await publicRequest("landing_institutions", {}, signal);
  return publicInstitutionList([...publicInstitutionList(value === undefined ? [] : value), ...staticInstitutions]);
}

export async function fetchPublicInstitution(slug: string, signal?: AbortSignal) {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) return null;
  const value = await publicRequest("landing_institution", { p_slug: slug }, signal);
  return publicInstitutionProfile(value === undefined ? null : value);
}

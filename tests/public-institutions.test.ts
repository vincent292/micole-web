import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicInstitution, fetchPublicInstitutions, institutionPath, publicInstitutionList, publicInstitutionProfile, staticInstitutions } from "../src/lib/publicInstitutions";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("instituciones públicas de la landing", () => {
  it("la instalación comienza sin afiliaciones ficticias", () => {
    expect(staticInstitutions).toEqual([]);
    expect(publicInstitutionList([])).toEqual([]);
  });
  it("proyecta únicamente los campos públicos y elimina duplicados", () => {
    const row = { id: "school", name: " Colegio MiCole ", city: "La Paz", logoUrl: "https://assets.example.org/logo.png", website: "https://colegio.example.org", nit: "12345", address: "Dirección privada", students: [{ name: "Nombre privado" }], director: "Persona privada" };
    const result = publicInstitutionList([row, row, null, { id: "bad" }, { id: "empty", name: " " }]);
    expect(result).toEqual([{ id: "school", name: "Colegio MiCole", city: "La Paz", logoUrl: "https://assets.example.org/logo.png", website: "https://colegio.example.org", slug: "school", bannerUrl: "", color: "#3D6EF7", educationLevels: [], siteName: "" }]);
    expect(JSON.stringify(result)).not.toContain("privada");
    expect(JSON.stringify(result)).not.toContain("12345");
  });
  it("neutraliza enlaces peligrosos y logos SVG conservando el nombre público", () => {
    for (const value of ["javascript:alert(1)", "http://colegio.example.org", "https://user:password@example.org", "data:image/svg+xml;base64,PHN2Zz4=", "https://example.org/\nlogo.png"]) {
      expect(publicInstitutionList([{ id: "s", name: "Colegio", logoUrl: value, website: value }])[0]).toMatchObject({ logoUrl: "", website: "" });
    }
    expect(publicInstitutionList([{ id: "s", name: "Colegio", logoUrl: "data:image/png;base64,iVBORw0KGgo=", website: "" }])[0].logoUrl).toContain("data:image/png;base64,");
  });
  it("no importa muestras ni consulta registros en demo", async () => {
    vi.stubEnv("VITE_APP_MODE", "demo");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect(await fetchPublicInstitutions()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("consulta exclusivamente el RPC público sin credenciales de una sesión", async () => {
    vi.stubEnv("VITE_APP_MODE", "live");
    vi.stubEnv("VITE_SUPABASE_URL", "https://school-test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-test");
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: "s", name: "Colegio", city: "La Paz", logoUrl: "", website: "" }] });
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    expect(await fetchPublicInstitutions(controller.signal)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith("https://school-test.supabase.co/rest/v1/rpc/landing_institutions", { method: "POST", credentials: "omit", signal: controller.signal, headers: { apikey: "publishable-test", "Content-Type": "application/json" }, body: "{}" });
  });
  it("rechaza un error del servidor sin sustituirlo por instituciones de ejemplo", async () => {
    vi.stubEnv("VITE_APP_MODE", "live"); vi.stubEnv("VITE_SUPABASE_URL", "https://school-test.supabase.co"); vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchPublicInstitutions()).rejects.toThrow("No pudimos cargar");
    expect(() => publicInstitutionList({ data: [] })).toThrow();
  });
  it("la ficha permite únicamente campos institucionales y neutraliza mapas e imágenes peligrosas", () => {
    const row = { id: "s", slug: "mi-colegio", name: "Mi colegio", description: " Nuestra propuesta ", phone: "+591 70000000", address: "Av. Arce 123", mapsUrl: "https://www.google.com.evil.org/maps?q=x", bannerUrl: "https://assets.example.org/cover.svg", color: "red;display:none", educationLevels: ["Inicial", "Inicial", 5], directorIdentity: "PRIVATE_CI", directorPhone: "PRIVATE_PHONE", students: ["PRIVATE_STUDENT"], nit: "PRIVATE_NIT" };
    const profile = publicInstitutionProfile(row)!;
    expect(profile).toMatchObject({ description: "Nuestra propuesta", address: "Av. Arce 123", phone: "+591 70000000", mapsUrl: "", bannerUrl: "", color: "#3D6EF7", educationLevels: ["Inicial"] });
    expect(JSON.stringify(profile)).not.toContain("PRIVATE_");
    expect(institutionPath(profile)).toBe("/instituciones/mi-colegio");
    expect(publicInstitutionProfile({ ...row, mapsUrl: "https://www.google.com/maps/embed?pb=example" })?.mapsUrl).toContain("/maps/embed?");
    expect(publicInstitutionProfile(null)).toBeNull();
    expect(() => publicInstitutionProfile({})).toThrow();
  });
  it("abre una institución por slug con una petición pública independiente de sesión", async () => {
    vi.stubEnv("VITE_APP_MODE", "live");
    vi.stubEnv("VITE_SUPABASE_URL", "https://school-test.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-test");
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "s", slug: "mi-colegio", name: "Mi colegio" }) });
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    expect(await fetchPublicInstitution("mi-colegio", controller.signal)).toMatchObject({ slug: "mi-colegio" });
    expect(fetch).toHaveBeenCalledWith("https://school-test.supabase.co/rest/v1/rpc/landing_institution", { method: "POST", credentials: "omit", signal: controller.signal, headers: { apikey: "publishable-test", "Content-Type": "application/json" }, body: '{"p_slug":"mi-colegio"}' });
    fetch.mockClear();
    expect(await fetchPublicInstitution("../app")).toBeNull();
    vi.stubEnv("VITE_APP_MODE", "demo");
    expect(await fetchPublicInstitution("mi-colegio")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

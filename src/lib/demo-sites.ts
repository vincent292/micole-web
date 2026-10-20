import { demoRole } from "./demo-config";
import { readDemoData, writeDemoData } from "./demo";
import { educationLevels, type SiteDirectory } from "./sites";
const key = "micole_public_demo_sites_v1";
interface LocalAccess {
  siteId: string;
  email: string;
  active: boolean;
  token?: string;
}
export const siteOperations = [
  "institution_sites",
  "save_institution_site",
  "set_site_director",
];
export async function demoSiteRpc(name: string, params: object) {
  if (demoRole() !== "director")
    throw new Error("Esta acción corresponde a Dirección.");
  const p = params as Record<string, any>,
    d = readDemoData();
  const current = d.schools.find(
    (s) => s.id === p.p_school_id || s.id === p.p_site_id,
  );
  if (!current) throw new Error("Selecciona una sede.");
  const root = d.schools.find(
    (s) => s.id === (current.institutionId || current.id),
  )!;
  let access: LocalAccess[] = [];
  try {
    access = JSON.parse(localStorage.getItem(key) || "[]");
  } catch {}
  if (name === "institution_sites")
    return {
      institutionId: root.id,
      canManage: true,
      billing: "per_site",
      sites: d.schools
        .filter((s) => s.id === root.id || s.institutionId === root.id)
        .map((s) => ({
          school: s as unknown as Record<string, unknown>,
          students: d.students.filter(
            (v) => v.schoolId === s.id && v.status === "active",
          ).length,
          directors: [
            {
              name: "María · Demo",
              email: "direccion@micole.test",
              inherited: s.id !== root.id,
              active: true,
            },
            ...access
              .filter((a) => a.siteId === s.id)
              .map((a) => ({
                name: a.email,
                email: a.email,
                inherited: false,
                active: a.active,
              })),
          ],
          invitations: [],
        })),
    } satisfies SiteDirectory;
  if (name === "save_institution_site") {
    const v = p.p_site,
      label = String(v.siteName || "").trim();
    if (
      label.length < 2 ||
      label.length > 100 ||
      !Array.isArray(v.educationLevels) ||
      !v.educationLevels.length ||
      v.educationLevels.some((l: string) => !educationLevels.includes(l))
    )
      throw new Error("Revisa el nombre y los niveles de la sede.");
    const old = d.schools.find((s) => s.id === v.id);
    if (old && (old.institutionId || old.id) !== root.id)
      throw new Error("La sede pertenece a otra institución.");
    const id = old?.id || crypto.randomUUID(),
      fields = {
        siteName: label,
        educationLevels: v.educationLevels,
        city: v.city || root.city,
        address: v.address || "",
        phone: v.phone || "",
      };
    if (old) Object.assign(old, fields);
    else {
      d.schools.push({
        ...root,
        ...fields,
        id,
        institutionId: root.id,
        slug: "sede-" + id,
        showOnLanding: false,
        platformEnabled: true,
        createdAt: new Date().toISOString(),
      });
      d.platformCharges.push({
        id: crypto.randomUUID(),
        schoolId: id,
        kind: "credit_topup",
        concept: "Crédito inicial de esta sede · Simulación",
        period: new Date().toISOString().slice(0, 7),
        amount: 500,
        status: "pending",
      });
    }
    writeDemoData(d, true);
    return id;
  }
  const email = String(p.p_email || "")
    .trim()
    .toLowerCase();
  if (!email.endsWith(".test") || !current.institutionId)
    throw new Error(
      "En la demo utiliza un correo ficticio terminado en .test de una sucursal.",
    );
  const old = access.find((a) => a.siteId === current.id && a.email === email);
  if (old) old.active = p.p_active;
  else access.push({ siteId: current.id, email, active: p.p_active });
  localStorage.setItem(key, JSON.stringify(access));
  return { linked: !!p.p_active };
}

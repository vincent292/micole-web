import { useWorkspaceRevision } from "../lib/useWorkspaceRevision";
import { useEffect, useState } from "react";
import { Building2, Plus } from "lucide-react";
import {
  Button,
  Field,
  FormSection,
  Modal,
  SectionTitle,
} from "../components/UI";
import { rpc, fromRow } from "../lib/repository";
import { educationLevels, siteLabel, type SiteDirectory } from "../lib/sites";
import { bolivianCities } from "../lib/operations";
import type { School } from "../lib/types";
import type { PageProps } from "./Pages";
export function InstitutionSites({
  school,
  identity,
  onIdentityChanged,
  onChoose,
  store,
}: PageProps & {
  onIdentityChanged: () => Promise<void>;
  onChoose: (id: string) => void;
}) {
  const [data, setData] = useState<SiteDirectory | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<Partial<School> | null>(null),
    [levels, setLevels] = useState<string[]>([]),
    [assign, setAssign] = useState<School | null>(null),
    [link, setLink] = useState(""),
    [version, setVersion] = useState(0);
  const liveRevision = useWorkspaceRevision(["schools", "school_memberships"]);
  useEffect(() => {
    let active = true;
    setError("");

    if (school)
      void rpc<SiteDirectory>("institution_sites", { p_school_id: school.id })
        .then((v) => {
          if (active) setData(v);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [school?.id, version, liveRevision]);
  const updated = async () => {
    await onIdentityChanged();
    await store.refresh();
    setVersion((v) => v + 1);
  };
  if (!school) return null;
  return (
    <>
      <SectionTitle
        title="Sedes y sucursales"
        subtitle="Una institución, con responsables, niveles, alumnos y facturación propios en cada sede."
        action={
          data?.canManage && (
            <Button
              icon={Plus}
              onClick={() => {
                setLevels([]);
                setEditing({ city: school.city });
                setError("");
              }}
            >
              Nueva sede
            </Button>
          )
        }
      />
      {error && !editing && !assign && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <p className="soft-note">
        Cada sede configura su cuenta bancaria, crédito inicial y facturación de
        MiCole. Sus formularios, calendarios y comunicaciones se publican
        únicamente para esa sede.
      </p>
      <div className="entity-grid">
        {data?.sites.map((entry) => {
          const s = fromRow("schools", entry.school) as unknown as School;
          return (
            <article className="entity-card" key={s.id}>
              <span className="row-icon">
                <Building2 />
              </span>
              <h3>{s.siteName || "Sede principal"}</h3>
              <p>
                {s.name} · {s.city}
              </p>
              <p>
                {s.educationLevels?.join(" · ") || "Niveles por configurar"}
              </p>
              <p>
                {entry.students} estudiantes activos ·{" "}
                {s.address || "Dirección por registrar"}
              </p>
              {data.canManage && (
                <div>
                  {entry.directors
                    .filter((d) => d.active)
                    .map((d) => (
                      <p key={d.email}>
                        <b>{d.name}</b> ·{" "}
                        {d.inherited
                          ? "Dirección de la institución"
                          : "Dirección de esta sede"}
                        {!d.inherited && s.institutionId && (
                          <Button
                            variant="ghost"
                            disabled={busy}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `¿Retirar el acceso de ${d.email} a esta sede?`,
                                )
                              )
                                return;
                              setBusy(true);
                              void rpc("set_site_director", {
                                p_site_id: s.id,
                                p_email: d.email,
                                p_active: false,
                              })
                                .then(updated)
                                .catch((e) => setError(e.message))
                                .finally(() => setBusy(false));
                            }}
                          >
                            Retirar acceso
                          </Button>
                        )}
                      </p>
                    ))}
                  {entry.invitations.map((i) => (
                    <p key={i.id}>
                      Invitación pendiente: {i.email}
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void rpc("set_site_director", {
                            p_site_id: s.id,
                            p_email: i.email,
                            p_active: false,
                          })
                            .then(updated)
                            .catch((e) => setError(e.message))
                            .finally(() => setBusy(false));
                        }}
                      >
                        Revocar
                      </Button>
                    </p>
                  ))}
                </div>
              )}
              <div className="action-group">
                {s.id !== school.id &&
                  (!identity.support || identity.support.mode === "test") && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void (async () => {
                          if (identity.support?.mode === "test") {
                            await rpc("switch_test_site", { p_site_id: s.id });
                            await updated();
                          }
                          onChoose(s.id);
                        })()
                          .catch((e) => setError(e.message))
                          .finally(() => setBusy(false));
                      }}
                    >
                      Abrir sede
                    </Button>
                  )}
                {data.canManage && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEditing(s);
                      setLevels(s.educationLevels || []);
                      setError("");
                    }}
                  >
                    Editar sede
                  </Button>
                )}
                {data.canManage && s.institutionId && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setAssign(s);
                      setLink("");
                      setError("");
                    }}
                  >
                    Asignar directora
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {editing && (
        <Modal
          title={editing.id ? "Editar sede" : "Nueva sede"}
          onClose={() => setEditing(null)}
          busy={busy}
          error={error}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await rpc("save_institution_site", {
                p_school_id: school.id,
                p_site: {
                  id: editing.id,
                  siteName: String(f.get("siteName")),
                  city: String(f.get("city")),
                  address: String(f.get("address")),
                  phone: String(f.get("phone")),
                  educationLevels: levels,
                },
              });
              await updated();
              setEditing(null);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <FormSection title="Datos de la sede">
            <Field
              label="Nombre de la sede"
              name="siteName"
              required
              defaultValue={editing.siteName}
              placeholder="Sede Norte"
            />
            <Field label="Ciudad" name="city">
              <select
                name="city"
                defaultValue={editing.city || bolivianCities[0]}
              >
                {[
                  ...new Set([editing.city, ...bolivianCities].filter(Boolean)),
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Dirección de la sede"
              name="address"
              defaultValue={editing.address}
            />
            <Field
              label="Teléfono de la sede"
              name="phone"
              type="tel"
              defaultValue={editing.phone}
            />
          </FormSection>
          <FormSection title="Niveles educativos">
            <p>
              Puede combinar guardería, inicial y colegio. Las aulas y
              mensualidades se configuran después dentro de esta sede.
            </p>
            <div className="academic-checkboxes">
              {educationLevels.map((l, i) => (
                <label key={l}>
                  <input
                    type="checkbox"
                    checked={levels.includes(l)}
                    required={i === 0 && !levels.length}
                    onChange={(e) =>
                      setLevels((old) =>
                        e.target.checked
                          ? [...old, l]
                          : old.filter((v) => v !== l),
                      )
                    }
                  />
                  {l}
                </label>
              ))}
            </div>
            <p className="soft-note">
              La nueva sede tendrá crédito y facturación independientes. La
              Dirección principal conservará acceso; puedes asignar además una
              responsable exclusiva.
            </p>
          </FormSection>
        </Modal>
      )}
      {assign && (
        <Modal
          title={`Dirección · ${assign.siteName}`}
          onClose={() => setAssign(null)}
          busy={busy}
          error={error}
          submitLabel={link ? "Cerrar" : "Asignar acceso"}
          onSubmit={async (e) => {
            e.preventDefault();
            if (link) {
              setAssign(null);
              return;
            }
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              const r = await rpc<{ token?: string; linked: boolean }>(
                "set_site_director",
                {
                  p_site_id: assign.id,
                  p_email: String(f.get("email")),
                  p_active: true,
                },
              );
              await updated();
              if (r.token)
                setLink(`${window.location.origin}/invite/${r.token}`);
              else setAssign(null);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            El acceso será solo a {siteLabel(assign)}. La cuenta de la Dirección
            principal mantiene sus sedes.
          </p>
          {!link ? (
            <Field
              label="Correo de la directora de esta sede"
              name="email"
              type="email"
              required
            />
          ) : (
            <>
              <p>
                Comparte este enlace con la responsable. Debe ingresar con el
                correo asignado.
              </p>
              <Field label="Enlace de invitación" name="inviteLink">
                <input readOnly value={link} />
              </Field>
              <Button
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(link)
                    .catch(() => setError("Selecciona y copia el enlace."))
                }
              >
                Copiar enlace
              </Button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

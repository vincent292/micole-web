import { useEffect, useState } from "react";
import { Field, FormSection } from "./UI";
import {
  admissionFields,
  emergencyDeclaration,
  type AdmissionDetails,
  type AdmissionTemplate,
} from "../lib/admission";
import { rpc } from "../lib/repository";
import { publicDemo } from "../lib/demo-config";
import { liveMode } from "../lib/supabase";
import "../styles/document-import.css";
export function AdmissionFields({
  value,
  studentId,
  template: provided,
}: {
  value?: AdmissionDetails;
  studentId?: string;
  template?: AdmissionTemplate;
}) {
  const [loaded, setLoaded] = useState<AdmissionTemplate | undefined>(provided),
    [ready, setReady] = useState((!liveMode && !publicDemo) || !studentId || !!provided),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    if (provided || !studentId || (!liveMode && !publicDemo)) return;
    void rpc<AdmissionTemplate>("student_admission_template", {
      p_student_id: studentId,
    })
      .then((t) => {
        if (active) {
          setLoaded(t);
          setReady(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [studentId, provided]);
  const template = provided || loaded || value?.template;
  const sections = [...new Set(admissionFields.map((f) => f.section))];
  const input = (f: (typeof admissionFields)[number]) => (
    <Field key={f.key} label={f.label} name={`admission:${f.key}`}>
      {f.type === "textarea" ? (
        <textarea
          name={`admission:${f.key}`}
          maxLength={2000}
          rows={2}
          defaultValue={value?.fields?.[f.key] || ""}
        />
      ) : f.type === "select" ? (
        <select
          name={`admission:${f.key}`}
          defaultValue={value?.fields?.[f.key] || ""}
        >
          <option value="">Sin responder</option>
          {f.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          name={`admission:${f.key}`}
          type={f.type || "text"}
          maxLength={2000}
          defaultValue={value?.fields?.[f.key] || ""}
        />
      )}
    </Field>
  );
  return (
    <>
      <input type="hidden" name="admissionReady" value={ready ? "yes" : "no"} />
      <input
        type="hidden"
        name="admissionTemplate"
        value={JSON.stringify(template || {})}
      />
      {sections.map((section) => (
        <FormSection key={section} title={section}>
          <div className="admission-extra">
            {section === "Declaración para emergencias" && (
              <p>{emergencyDeclaration}</p>
            )}
            {section === "Personas autorizadas para el recojo" ? (
              <>
                <p className="muted">
                  Estas personas no reciben acceso a MiCole. Una recogida
                  concreta mantiene su solicitud y verificación del carnet.
                </p>
                {Array.from({ length: 5 }, (_, i) => (
                  <details
                    key={i}
                    open={i === 0 || !!value?.fields?.[`pickup${i + 1}Name`]}
                  >
                    <summary>Persona autorizada {i + 1}</summary>
                    <div className="form-grid">
                      {admissionFields
                        .filter((f) => f.key.startsWith(`pickup${i + 1}`))
                        .map(input)}
                    </div>
                  </details>
                ))}
              </>
            ) : (
              <div className="form-grid">
                {admissionFields
                  .filter((f) => f.section === section)
                  .map(input)}
              </div>
            )}
          </div>
        </FormSection>
      ))}
      {!ready && (
        <p className="muted">
          {error || "Cargando las preguntas de la institución…"}
        </p>
      )}
      {template?.fields?.length ? (
        <FormSection title={template.title || "Formulario de la institución"}>
          <div className="form-grid">
            {template.fields.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                name={`custom:${f.key}`}
                required={f.required}
              >
                {f.type === "select" ? (
                  <select
                    name={`custom:${f.key}`}
                    required={f.required}
                    defaultValue={value?.customAnswers?.[f.key] || ""}
                  >
                    <option value="">Seleccionar</option>
                    {f.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    name={`custom:${f.key}`}
                    required={f.required}
                    rows={3}
                    maxLength={2000}
                    defaultValue={value?.customAnswers?.[f.key] || ""}
                  />
                ) : (
                  <input
                    name={`custom:${f.key}`}
                    type={f.type}
                    required={f.required}
                    maxLength={2000}
                    defaultValue={value?.customAnswers?.[f.key] || ""}
                  />
                )}
              </Field>
            ))}
          </div>
        </FormSection>
      ) : null}
      {template?.instructions && (
        <FormSection title="Indicaciones de la institución">
          <p className="admission-instructions">{template.instructions}</p>
          <p className="muted">
            La institución puede solicitar autorizaciones firmadas adicionales.
          </p>
        </FormSection>
      )}
    </>
  );
}
export function readAdmissionDetails(data: FormData): AdmissionDetails {
  if (data.get("admissionReady") === "no")
    throw new Error(
      "Espera a que terminen de cargar las preguntas de la institución.",
    );
  const template = JSON.parse(
    String(data.get("admissionTemplate") || "{}"),
  ) as AdmissionTemplate;
  const fields = Object.fromEntries(
    admissionFields.map((f) => [
      f.key,
      String(data.get(`admission:${f.key}`) || "").trim(),
    ]),
  );
  return {
    fields,
    customAnswers: Object.fromEntries(
      (template.fields || []).map((f) => [
        f.key,
        String(data.get(`custom:${f.key}`) || "").trim(),
      ]),
    ),
    template,
  };
}

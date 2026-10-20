export type QuestionType = "text" | "textarea" | "tel" | "date" | "select";
export interface AdmissionQuestion {
  key: string;
  label: string;
  section: string;
  type: QuestionType;
  required: boolean;
  options: string[];
  source?: string;
}
export interface AdmissionTemplate {
  id?: string;
  title: string;
  academicYear: number;
  fields: AdmissionQuestion[];
  instructions: string;
}
export interface AdmissionDetails {
  fields: Record<string, string>;
  customAnswers: Record<string, string>;
  template?: AdmissionTemplate;
}
export interface AdmissionField {
  key: string;
  label: string;
  section: string;
  type?: QuestionType;
  options?: string[];
}
const field = (
  key: string,
  label: string,
  section: string,
  type: QuestionType = "text",
  options?: string[],
): AdmissionField => ({ key, label, section, type, options });
export const admissionFields: AdmissionField[] = [
  field("birthPlace", "Lugar de nacimiento", "Datos familiares"),
  field("homeAddress", "Dirección del domicilio", "Datos familiares"),
  ...(["mother", "father"] as const).flatMap((p) => {
    const who = p === "mother" ? "madre" : "padre";
    return [
      field(
        `${p}Occupation`,
        `Profesión de la ${who}`.replace("de la padre", "del padre"),
        "Datos familiares",
      ),
      field(`${p}Workplace`, `Lugar de trabajo (${who})`, "Datos familiares"),
      field(`${p}Identity`, `CI de ${who}`, "Datos familiares"),
      field(
        `${p}IdentityIssued`,
        `CI expedido en (${who})`,
        "Datos familiares",
      ),
    ];
  }),
  field("paymentResponsible", "Responsable de los pagos", "Datos familiares"),
  field(
    "household",
    "¿Con quién vive? Incluye hermanos y cuántos",
    "Datos familiares",
    "textarea",
  ),
  field(
    "referralSource",
    "¿Cómo conoció a la institución?",
    "Datos familiares",
  ),
  field("wearsGlasses", "¿Usa lentes?", "Antecedentes de salud", "select", [
    "Sí",
    "No",
  ]),
  field(
    "hearingProblems",
    "¿Tiene dificultades auditivas?",
    "Antecedentes de salud",
    "select",
    ["Sí", "No"],
  ),
  field(
    "ongoingTreatment",
    "Tratamiento o cuidado médico de largo plazo",
    "Antecedentes de salud",
    "textarea",
  ),
  field(
    "healthHistory",
    "Antecedentes: asma, diabetes, ortopédicos, urinarios, estómago, cardíacos, atención o migrañas",
    "Antecedentes de salud",
    "textarea",
  ),
  field(
    "emergencyRelationship",
    "Parentesco del primer contacto",
    "Emergencias",
  ),
  field(
    "secondEmergencyRelationship",
    "Parentesco del segundo contacto",
    "Emergencias",
  ),
  field("preferredMedicalCenter", "Centro médico de referencia", "Emergencias"),
  ...Array.from({ length: 5 }, (_, i) => [
    field(
      `pickup${i + 1}Name`,
      `Persona autorizada ${i + 1}`,
      "Personas autorizadas para el recojo",
    ),
    field(
      `pickup${i + 1}Identity`,
      `CI de persona ${i + 1}`,
      "Personas autorizadas para el recojo",
    ),
    field(
      `pickup${i + 1}Relationship`,
      `Parentesco de persona ${i + 1}`,
      "Personas autorizadas para el recojo",
    ),
    field(
      `pickup${i + 1}Phone`,
      `Celular de persona ${i + 1}`,
      "Personas autorizadas para el recojo",
      "tel",
    ),
  ]).flat(),
  field(
    "emergencyAuthorization",
    "¿Autoriza que la institución gestione atención médica de emergencia?",
    "Declaración para emergencias",
    "select",
    ["Sí", "No"],
  ),
  field(
    "authorizationName",
    "Nombre de madre o padre que declara",
    "Declaración para emergencias",
  ),
  field(
    "authorizationIdentity",
    "CI de quien declara",
    "Declaración para emergencias",
  ),
];
export function admissionRows(details?: AdmissionDetails): [string, string][] {
  if (!details) return [];
  return [
    ...admissionFields.map(
      (f) => [f.label, details.fields?.[f.key] || ""] as [string, string],
    ),
    ...(details.template?.fields || []).map(
      (f) =>
        [f.label, details.customAnswers?.[f.key] || ""] as [string, string],
    ),
  ].filter(([, v]) => !!v);
}
export const emergencyDeclaration =
  "En una emergencia, solicito que contacten a los responsables registrados y, si corresponde, gestionen atención en un centro médico. Esta declaración registra mi decisión; no sustituye una autorización firmada ni autoriza tratamientos específicos.";

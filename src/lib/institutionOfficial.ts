export interface InstitutionOfficialInfo {
  unitCode?: string;
  district?: string;
  department?: string;
  authorizationReference?: string;
  educationReference?: string;
  educationReferenceUrl?: string;
}
export const officialFields = [
  ["unitCode", "Código de unidad educativa", 160],
  ["district", "Distrito educativo", 160],
  ["department", "Departamento", 160],
  ["authorizationReference", "Resolución / autorización de funcionamiento", 160],
  ["educationReference", "Normativa de referencia", 500],
  ["educationReferenceUrl", "Enlace oficial de la normativa", 2048],
] as const;

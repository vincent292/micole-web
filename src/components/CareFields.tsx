import { AdmissionFields, readAdmissionDetails } from "./AdmissionFields";
import type { AdmissionTemplate } from "../lib/admission";
import { useState } from "react";
import { Field, FormSection } from "./UI";
import type { CareProfile, Student } from "../lib/types";
export function readCareProfile(form: HTMLFormElement): CareProfile {
  const data = new FormData(form);
  const text = (key: string) => String(data.get(key) || "").trim();
  return {
    admissionDetails: readAdmissionDetails(data),
    allergies: text("allergies"),
    foodRestrictions: text("foodRestrictions"),
    emergencyContact: text("emergencyContact"),
    emergencyPhone: text("emergencyPhone"),
    secondEmergencyContact: text("secondEmergencyContact"),
    secondEmergencyPhone: text("secondEmergencyPhone"),
    hasInsurance: text("hasInsurance") === "true",
    insuranceProvider: text("insuranceProvider"),
    insuranceNumber: text("insuranceNumber"),
    medicalConditions: text("medicalConditions"),
    careInstructions: text("careInstructions"),
  };
}
export function CareFields({
  value,
  template,
}: {
  value?: Partial<CareProfile> | Student;
  template?: AdmissionTemplate;
}) {
  const [insured, setInsured] = useState(
    value?.hasInsurance === undefined ? "" : String(value.hasInsurance),
  );
  return (
    <>
      <FormSection title="Salud y alimentación">
        <Field
          label="Alergias"
          name="allergies"
          required
          defaultValue={value?.allergies}
          placeholder="Escribe ninguna si no tiene"
        />
        <Field
          label="Alimentos que no puede comer"
          name="foodRestrictions"
          required
          defaultValue={value?.foodRestrictions}
          placeholder="Escribe ninguno si no hay restricciones"
        />
        <Field label="Condiciones de salud (opcional)" name="medicalConditions">
          <textarea
            name="medicalConditions"
            rows={2}
            maxLength={2000}
            defaultValue={value?.medicalConditions}
            placeholder="Información que deba conocer el colegio"
          />
        </Field>
        <Field
          label="Indicaciones de cuidado (opcional)"
          name="careInstructions"
        >
          <textarea
            name="careInstructions"
            rows={2}
            maxLength={2000}
            defaultValue={value?.careInstructions}
          />
        </Field>
      </FormSection>
      <FormSection title="Seguro">
        <Field label="¿Tiene seguro?" name="hasInsurance" required>
          <select
            name="hasInsurance"
            required
            value={insured}
            onChange={(e) => setInsured(e.target.value)}
          >
            <option value="" disabled>
              Seleccionar respuesta
            </option>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </Field>
        {insured === "true" && (
          <div className="form-grid">
            <Field
              label="Entidad del seguro"
              name="insuranceProvider"
              required
              defaultValue={value?.insuranceProvider}
            />
            <Field
              label="Número de póliza o afiliación (opcional)"
              name="insuranceNumber"
              defaultValue={value?.insuranceNumber}
            />
          </div>
        )}
      </FormSection>
      <FormSection title="Emergencias">
        <p className="muted care-note">
          Estos contactos ayudan al colegio a comunicarse en una emergencia. No
          reciben acceso a MiCole.
        </p>
        <div className="form-grid">
          <Field
            label="Contacto de emergencia"
            name="emergencyContact"
            required
            defaultValue={value?.emergencyContact}
          />
          <Field
            label="Teléfono de emergencia"
            name="emergencyPhone"
            type="tel"
            required
            defaultValue={value?.emergencyPhone}
          />
          <Field
            label="Segundo contacto (opcional)"
            name="secondEmergencyContact"
            defaultValue={value?.secondEmergencyContact}
          />
          <Field
            label="Segundo teléfono (opcional)"
            name="secondEmergencyPhone"
            type="tel"
            defaultValue={value?.secondEmergencyPhone}
          />
        </div>
      </FormSection>
      <AdmissionFields
        value={value?.admissionDetails}
        studentId={value && "id" in value ? value.id : undefined}
        template={template}
      />
    </>
  );
}
export const careLabels: [keyof CareProfile, string][] = [
  ["allergies", "Alergias"],
  ["foodRestrictions", "Alimentos que evita"],
  ["medicalConditions", "Condiciones de salud"],
  ["careInstructions", "Indicaciones de cuidado"],
  ["insuranceProvider", "Entidad del seguro"],
  ["insuranceNumber", "Póliza o afiliación"],
  ["emergencyContact", "Contacto de emergencia"],
  ["emergencyPhone", "Teléfono de emergencia"],
  ["secondEmergencyContact", "Segundo contacto"],
  ["secondEmergencyPhone", "Segundo teléfono"],
];

import { educationLevels as allowedLevels } from "./sites";
import { workspaceModeForLevels } from "./kinder";

export function readInstitutionLevels(form: FormData) {
  const educationLevels = [...new Set(form.getAll("educationLevels").map(String))];
  if (!educationLevels.length || educationLevels.some(level => !allowedLevels.includes(level)))
    throw new Error("Selecciona al menos un nivel educativo que ofrezca la institución.");
  return { educationLevels, workspaceMode: workspaceModeForLevels(educationLevels) };
}

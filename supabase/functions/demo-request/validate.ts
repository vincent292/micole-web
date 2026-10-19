export interface DemoContact {
  schoolName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  message: string;
  consent: boolean;
}
export function validateDemoContact(value: unknown): DemoContact {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Revisa los datos de la solicitud.");
  const raw = value as Record<string, unknown>,
    text = (key: string) =>
      typeof raw[key] === "string" ? String(raw[key]).trim() : "";
  const result = {
    schoolName: text("schoolName"),
    contactName: text("contactName"),
    email: text("email").toLowerCase(),
    phone: text("phone"),
    city: text("city"),
    message: text("message"),
    consent: raw.consent === true,
  };
  if (
    result.schoolName.length < 2 ||
    result.schoolName.length > 160 ||
    result.contactName.length < 2 ||
    result.contactName.length > 160 ||
    !/^\S+@[^\s@]+\.[^\s@]+$/.test(result.email) ||
    result.email.length > 254 ||
    !/^\+?[0-9 ()-]{6,30}$/.test(result.phone) ||
    result.city.length < 2 ||
    result.city.length > 100 ||
    result.message.length > 1500 ||
    !result.consent
  )
    throw new Error(
      "Completa los datos de contacto y acepta que te contactemos sobre la demostración.",
    );
  return result;
}

export const institutionLogoMaxBytes = 256 * 1024;
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateInstitutionLogoFile(file: Pick<File, "type" | "size">) {
  if (!imageTypes.has(file.type) || file.size > institutionLogoMaxBytes)
    throw new Error("Usa un logo JPG, PNG o WebP de hasta 256 KB.");
}

export function validateInstitutionHttpsUrl(value: string, label: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      value.length > 2048 ||
      !/^https:\/\/([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(:[0-9]{1,5})?([/?#][^\s\u0000-\u001f\u007f]*)?$/i.test(value)
    )
      throw new Error();
    return value;
  } catch {
    throw new Error(`${label} debe usar una dirección HTTPS válida.`);
  }
}

export function validateInstitutionLogoUrl(value: string) {
  const url = validateInstitutionHttpsUrl(value, "El logo");
  if (/\.svg([?#]|$)/i.test(url))
    throw new Error("Usa un logo PNG, JPG o WebP; el formato SVG no está permitido.");
  return url;
}

export function validateInstitutionNit(value: string) {
  if (value && !/^\d{1,20}$/.test(value))
    throw new Error("El NIT debe contener solo números, hasta 20 dígitos.");
  return value;
}

function readLogoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("No pudimos leer el logo. Selecciona el archivo otra vez."));
    reader.readAsDataURL(file);
  });
}

export async function readInstitutionIdentity(
  form: FormData,
  existingLogo = "",
) {
  const text = (name: string) => String(form.get(name) || "").trim();
  const nit = validateInstitutionNit(text("nit"));
  const address = text("address");
  if (address.length > 500)
    throw new Error("La dirección puede tener hasta 500 caracteres.");
  const phone = text("phone");
  if (phone.length > 40)
    throw new Error("El teléfono puede tener hasta 40 caracteres.");
  const website = validateInstitutionHttpsUrl(text("website"), "El sitio web");

  let logoUrl = "";
  if (!form.has("removeLogo")) {
    const file = form.get("logoFile");
    if (file instanceof File && file.size) {
      validateInstitutionLogoFile(file);
      logoUrl = await readLogoDataUrl(file);
    } else {
      logoUrl = validateInstitutionLogoUrl(text("logoUrl"));
      // Un archivo guardado se conserva hasta elegir otro o marcar «Quitar logo».
      if (!logoUrl && /^data:image\/(png|jpeg|webp);base64,/.test(existingLogo))
        logoUrl = existingLogo;
    }
  }

  return {
    nit,
    address,
    phone,
    website,
    logoUrl,
    showOnLanding: form.get("showOnLanding") === "on",
  };
}

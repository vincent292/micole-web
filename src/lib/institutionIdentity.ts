export const institutionLogoMaxBytes = 10 * 1024 * 1024;
import { validateMapsUrl } from "./operations";
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function validateInstitutionLogoFile(file: Pick<File, "type" | "size">) {
  if (!imageTypes.has(file.type) || file.size > institutionLogoMaxBytes)
    throw new Error("Usa un logo JPG, PNG o WebP de hasta 10 MB para optimizarlo.");
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

export async function optimizeInstitutionImage(file: File, kind: "logo" | "banner" = "logo"): Promise<string> {
  validateInstitutionLogoFile(file);
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = objectUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40000000)
      throw new Error("La imagen es demasiado grande. Usa una foto de hasta 40 megapíxeles.");
    const canvas = document.createElement("canvas");
    const maxWidth = kind === "logo" ? 512 : 1400;
    let scale = Math.min(1, maxWidth / image.naturalWidth, (kind === "logo" ? 512 : 700) / image.naturalHeight);
    for (let attempt = 0; attempt < 5; attempt++) {
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo optimizar la imagen.");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/webp", .82 - attempt * .08);
      if (!result.startsWith("data:image/webp;base64,")) throw new Error("Este navegador no permite guardar WebP. Usa una versión actualizada.");
      if (result.length <= (kind === "logo" ? 345000 : 525000)) return result;
      scale *= .8;
    }
    throw new Error("No pudimos reducir la imagen. Elige una imagen más pequeña.");
  } finally { URL.revokeObjectURL(objectUrl); }
}

export async function readInstitutionIdentity(
  form: FormData,
  existingLogo = "",
  existingBanner = "",
) {
  if (form.get("privateContactReady") === "false") throw new Error("Espera a que carguen los datos de Dirección antes de guardar.");
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
      logoUrl = await optimizeInstitutionImage(file);
    } else {
      logoUrl = validateInstitutionLogoUrl(text("logoUrl"));
      // Un archivo guardado se conserva hasta elegir otro o marcar «Quitar logo».
      if (!logoUrl && /^data:image\/(png|jpeg|webp);base64,/.test(existingLogo))
        logoUrl = existingLogo;
    }
  }

  const bannerFile = form.get("bannerFile");
  const bannerUrl = form.has("removeBanner") ? "" : bannerFile instanceof File && bannerFile.size ? await optimizeInstitutionImage(bannerFile, "banner") : existingBanner;
  return {
    bannerUrl,
    mapsUrl: validateMapsUrl(text("mapsUrl")),
    directorIdentity: text("directorIdentity").toUpperCase(),
    directorPhone: text("directorPhone"),
    nit,
    address,
    phone,
    website,
    logoUrl,
    showOnLanding: form.get("showOnLanding") === "on",
  };
}

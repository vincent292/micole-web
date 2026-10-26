import { useEffect } from "react";
import { institutionPath, type PublicInstitutionProfile } from "./publicInstitutions";

export function useInstitutionMetadata(institution: PublicInstitutionProfile | null) {
  useEffect(() => {
    if (!institution) return;
    const title = `${institution.name}${institution.city ? ` en ${institution.city}` : ""} | MiCole`;
    const description = institution.description.slice(0, 180) || `Conoce ${institution.name}${institution.city ? ` en ${institution.city}` : ""}, sus niveles educativos y su información institucional en MiCole.`;
    document.title = title;
    const tags: HTMLElement[] = [];
    const meta = (attribute: "name" | "property", key: string, content: string) => {
      let node = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
      if (!node) { node = document.createElement("meta"); node.setAttribute(attribute, key); document.head.append(node); }
      node.content = content; tags.push(node);
    };
    meta("name", "description", description);
    const canonical = `${window.location.origin}${institutionPath(institution)}`;
    let origin = "";
    try { origin = new URL(import.meta.env.VITE_SITE_URL || "").origin; } catch { /* Las previews se mantienen fuera del índice. */ }
    const indexable = import.meta.env.VITE_APP_MODE === "live" && import.meta.env.VITE_PUBLIC_DEMO !== "true" && origin === window.location.origin;
    meta("name", "robots", indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow");
    for (const [key, value] of Object.entries({ "og:type": "website", "og:site_name": "MiCole", "og:title": title, "og:description": description, "og:url": canonical, "og:locale": "es_BO" })) meta("property", key, value);
    const image = [institution.bannerUrl, institution.logoUrl].find(value => value.startsWith("https://"));
    if (image) { meta("property", "og:image", image); meta("property", "og:image:alt", institution.name); }
    const link = document.createElement("link"); link.rel = "canonical"; link.href = canonical; document.head.append(link); tags.push(link);
    return () => { tags.forEach(node => node.remove()); };
  }, [institution]);
}

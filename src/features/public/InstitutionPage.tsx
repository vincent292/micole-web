import { useEffect, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Copy, ExternalLink, GraduationCap, MapPin, MessageCircle, Phone, RefreshCw } from "lucide-react";
import { Brand } from "../../components/Brand";
import { fetchPublicInstitution, institutionPath, type PublicInstitutionProfile } from "../../lib/publicInstitutions";
import { whatsappLink } from "../../lib/operations";
import { useInstitutionMetadata } from "../../lib/useInstitutionMetadata";
import { InstitutionCover, InstitutionLogo } from "./InstitutionVisuals";
import "../../styles/institution-page.css";

export function InstitutionPage() {
  const { pathname } = useLocation();
  const slug = pathname.match(/^\/instituciones\/([^/]+)\/?$/)?.[1] || "";
  const [institution, setInstitution] = useState<PublicInstitutionProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useInstitutionMetadata(institution);

  useEffect(() => {
    const controller = new AbortController();
    setInstitution(null); setLoading(true); setError("");
    window.scrollTo(0, 0);
    void fetchPublicInstitution(slug, controller.signal)
      .then(value => { if (!controller.signal.aborted) setInstitution(value); })
      .catch(() => { if (!controller.signal.aborted) setError("No pudimos cargar la página de la institución. Intenta nuevamente."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, attempt]);

  return <div className="institution-page" style={{ "--institution-accent": institution?.color || "#3D6EF7" } as CSSProperties}>
    <a className="skip-link" href="#institucion">Ir al contenido</a>
    <header className="institution-header"><div className="institution-container"><Brand /><Link to="/#instituciones"><ArrowLeft size={16} /> Todas las instituciones</Link></div></header>
    <main id="institucion" className="institution-container">
      {loading ? <section className="institution-state" role="status"><span className="institution-loading-mark" /><p>Conociendo tu próxima comunidad…</p></section>
        : error ? <section className="institution-state" role="alert"><h1>Inténtalo una vez más.</h1><p>{error}</p><button className="btn btn-primary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} /> Reintentar</button></section>
        : institution ? <InstitutionContent key={institution.id} institution={institution} />
        : <section className="institution-state"><GraduationCap size={40} /><h1>Esta institución no está disponible.</h1><p>Su página puede estar oculta o el enlace puede haber cambiado.</p><Link className="btn btn-primary" to="/#instituciones">Conocer otras instituciones <ArrowRight size={17} /></Link></section>}
    </main>
    <footer className="institution-footer institution-container"><Brand /><p>Una comunidad más cerca, cada día.</p><Link to="/">Conoce MiCole <ArrowRight size={15} /></Link></footer>
  </div>;
}

function InstitutionContent({ institution }: { institution: PublicInstitutionProfile }) {
  const [shareMessage, setShareMessage] = useState("");
  const [mapVisible, setMapVisible] = useState(false);
  const phone = /^\+?[0-9 ()-]{6,40}$/.test(institution.phone) ? institution.phone : "";
  let whatsapp = "";
  try { if (phone) whatsapp = whatsappLink(phone, `Hola, me gustaría recibir información sobre ${institution.name}. Vi su página en MiCole.`); } catch { /* El teléfono puede ser una línea fija. */ }
  const hasLocation = Boolean(institution.address || institution.mapsUrl);
  const mapLink = institution.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([institution.name, institution.address, institution.city, "Bolivia"].filter(Boolean).join(", "))}`;
  const embed = institution.mapsUrl.startsWith("https://www.google.com/maps/embed?") || institution.mapsUrl.startsWith("https://www.google.com/maps/embed/") ? institution.mapsUrl : "";
  const contact = whatsapp ? <a className="btn institution-primary" href={whatsapp} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} /> Consultar por WhatsApp <ArrowRight size={17} /></a>
    : phone ? <a className="btn institution-primary" href={`tel:${phone.replace(/[^+\d]/g, "")}`}><Phone size={18} /> Llamar a la institución</a>
    : institution.website ? <a className="btn institution-primary" href={institution.website} target="_blank" rel="noopener noreferrer">Visitar sitio web <ExternalLink size={17} /></a> : null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${institutionPath(institution)}`);
      setShareMessage("Enlace copiado. Ya puedes compartirlo.");
    } catch { setShareMessage("Puedes copiar el enlace desde la barra de direcciones."); }
  }

  return <>
    <section className="institution-hero" aria-labelledby="institution-name">
      <div className="institution-hero-cover"><InstitutionCover src={institution.bannerUrl} /><span className="institution-community-tag"><span /> PARTE DE LA COMUNIDAD MICOLE</span></div>
      <div className="institution-identity"><InstitutionLogo name={institution.name} src={institution.logoUrl} /><button className="institution-share" onClick={() => void copyLink()}><Copy size={15} /> Compartir página</button></div>
      <div className="institution-hero-body"><div><p className="institution-eyebrow">UN LUGAR PARA CRECER</p><h1 id="institution-name">{institution.name}</h1><div className="institution-facts">{institution.city && <span><MapPin size={16} />{institution.city}</span>}{institution.siteName && <span>{institution.siteName}</span>}</div></div><div className="institution-hero-actions">{contact}{hasLocation && <a className="institution-text-link" href="#ubicacion"><MapPin size={16} /> Conoce nuestra ubicación</a>}</div></div>
      <p className="institution-share-status" role="status">{shareMessage}</p>
      <nav className="institution-section-nav" aria-label="Información de la institución">{institution.description && <a href="#nosotros">Nuestra institución</a>}{institution.educationLevels.length > 0 && <a href="#niveles">Niveles educativos</a>}{hasLocation && <a href="#ubicacion">Ubicación</a>}{(phone || institution.website) && <a href="#contacto">Contacto</a>}</nav>
    </section>

    <div className="institution-body-grid"><div className="institution-details">
      {institution.description && <section id="nosotros" className="institution-about"><span className="institution-eyebrow">CADA COMUNIDAD TIENE SU HISTORIA</span><h2>Conócenos un poco más.</h2><p>{institution.description}</p></section>}
      {institution.educationLevels.length > 0 && <section id="niveles" className="institution-levels-section"><span className="institution-eyebrow">APRENDER EN CADA ETAPA</span><h2>Espacios para seguir creciendo.</h2><div className="institution-levels">{institution.educationLevels.map(level => <div className="institution-level" key={level}><span><GraduationCap size={23} /></span><h3>{level}</h3></div>)}</div></section>}
      {hasLocation && <section id="ubicacion" className="institution-location-section"><span className="institution-eyebrow">NOS ENCUENTRAS AQUÍ</span><h2>Ven a conocernos.</h2><div className="institution-location-card"><div className="institution-location-symbol"><MapPin size={30} /></div><div><h3>{institution.name}</h3>{institution.address && <p>{institution.address}</p>}{institution.city && <p>{institution.city}</p>}<a className="institution-text-link" href={mapLink} target="_blank" rel="noopener noreferrer">Abrir en Google Maps <ExternalLink size={15} /></a>{embed && <button className="institution-text-link" onClick={() => setMapVisible(value => !value)} aria-expanded={mapVisible}>{mapVisible ? "Ocultar mapa" : "Ver mapa aquí"}</button>}</div></div>{mapVisible && embed && <iframe className="institution-public-map" src={embed} title={`Ubicación de ${institution.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />}</section>}
    </div>
    <aside className="institution-sidebar">
      <section id="contacto" className="institution-contact-card"><span className="institution-contact-icon"><MessageCircle size={25} /></span><h2>El primer paso es conocernos.</h2><p>{contact ? "Conversa con la institución para conocer su propuesta, consultar horarios o coordinar una visita." : "Descubre nuestra institución y comparte esta página con tu familia."}</p>{contact}<div className="institution-contact-details">{phone && <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}><Phone size={16} /><span>{phone}</span></a>}{institution.website && <a href={institution.website} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /><span>Visitar sitio web</span></a>}</div></section>
      <div className="institution-community-note"><span><Check size={16} /></span><p>Esta institución forma parte de la comunidad <strong>MiCole.</strong></p></div>
    </aside></div>
    <section className="institution-discover"><div><span className="institution-eyebrow">MÁS COMUNIDADES POR CONOCER</span><h2>Cada familia encuentra su lugar.</h2></div><Link to="/#instituciones">Explorar instituciones <ArrowRight size={18} /></Link></section>
  </>;
}

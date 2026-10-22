import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, ChevronLeft, ChevronRight, ExternalLink, MapPin, RefreshCw } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { fetchPublicInstitutions } from "../../lib/publicInstitutions";
import type { PublicInstitution } from "../../lib/publicInstitutions";

function InstitutionCard({ institution }: { institution: PublicInstitution }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [institution.logoUrl]);
  const content = <>
    <div className="affiliate-logo">{institution.logoUrl && !broken ? <img loading="lazy" decoding="async" src={institution.logoUrl} alt={`Logo de ${institution.name}`} onError={() => setBroken(true)} /> : <span aria-hidden="true">{institution.name.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}</span>}</div>
    <h3>{institution.name}</h3>
    {institution.city && <p><MapPin size={13} />{institution.city}</p>}
    {institution.website && <span className="affiliate-website">Conocer institución <ExternalLink size={12} /></span>}
  </>;
  return <li className="affiliate-card" data-testid="affiliate-card">{institution.website ? <a href={institution.website} target="_blank" rel="noopener noreferrer" aria-label={`Conocer ${institution.name} (abre en otra pestaña)`}>{content}</a> : <div>{content}</div>}</li>;
}

export function InstitutionsShowcase() {
  const [institutions, setInstitutions] = useState<PublicInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [position, setPosition] = useState(1);
  const list = useRef<HTMLUListElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let pending = false;
    const load = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      controller = new AbortController();
      try {
        const result = await fetchPublicInstitutions(controller.signal);
        if (active) { setInstitutions(result); setError(""); }
      } catch (e) {
        if (active && !controller.signal.aborted) setError(e instanceof Error ? e.message : "No pudimos cargar las instituciones.");
      } finally { pending = false; if (active) setLoading(false); }
    };
    const refresh = () => { void load(); };
    void load();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("micole:refresh-affiliates", refresh);
    return () => { active = false; controller?.abort(); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("micole:refresh-affiliates", refresh); };
  }, []);

  const update = useCallback(() => {
    const element = list.current;
    if (!element) return;
    const left = Math.abs(element.scrollLeft);
    setCanPrev(left > 2);
    setCanNext(left + element.clientWidth < element.scrollWidth - 2);
    const width = (element.firstElementChild as HTMLElement | null)?.offsetWidth || 1;
    setPosition(Math.min(institutions.length, Math.floor(left / (width + 16)) + 1));
  }, [institutions.length]);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [institutions, update]);
  const move = (direction: number) => list.current?.scrollBy({ left: direction * Math.max(240, list.current.clientWidth * .8), behavior: reduced ? "instant" : "smooth" });

  return <section id="instituciones" className="institutions-section landing-container" aria-labelledby="institutions-heading">
    <div className="institutions-heading"><div><span className="landing-eyebrow">UNA RED QUE CRECE CONTIGO</span><h2 id="institutions-heading">Instituciones que crecen <span>con MiCole.</span></h2><p>Cada colegio tiene su identidad. Todos comparten una mejor forma de acompañar.</p></div>{institutions.length > 0 && <span className="affiliate-count"><Building2 size={15} />{institutions.length} {institutions.length === 1 ? "institución" : "instituciones"}</span>}</div>
    {loading ? <div className="affiliates-loading" role="status"><span className="affiliate-skeleton" /><span className="affiliate-skeleton" /><span className="affiliate-skeleton" /><span className="sr-only">Cargando instituciones…</span></div> : institutions.length > 0 ? <>
      <div className="affiliate-carousel" role="region" aria-roledescription="carrusel" aria-label="Instituciones afiliadas"><ul ref={list} className="affiliate-track" tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { e.preventDefault(); move(e.key === "ArrowRight" ? 1 : -1); } }}>{institutions.map((institution) => <InstitutionCard key={institution.id} institution={institution} />)}</ul></div>
      {(canPrev || canNext) && <div className="affiliate-controls"><p>Desliza para conocer nuestra comunidad.</p><div><button type="button" aria-label="Instituciones anteriores" disabled={!canPrev} onClick={() => move(-1)}><ChevronLeft size={18} /></button><span aria-live="polite">{position} / {institutions.length}</span><button type="button" aria-label="Instituciones siguientes" disabled={!canNext} onClick={() => move(1)}><ChevronRight size={18} /></button></div></div>}
    </> : !error ? <div className="affiliates-empty"><div className="affiliates-empty-visual" aria-hidden="true"><span className="affiliate-orbit" /><span className="affiliate-orbit second" /><span className="affiliate-empty-icon"><Building2 size={39} strokeWidth={1.5} /></span><i className="affiliate-empty-dot mint" /><i className="affiliate-empty-dot yellow" /></div><div><span className="affiliate-empty-label">EL PRIMER PASO LO DAMOS JUNTOS</span><h3>Tu institución puede ser la primera.</h3><p>Un espacio con tu logo, tus aulas y tu comunidad. Empieza a conectar cada pequeño paso con MiCole.</p><Link className="landing-secondary" to="/login?intent=school">Sumar mi institución <ArrowRight size={17} /></Link></div></div> : null}
    {error && <div className="affiliate-error" role="status"><span>{error}</span><button type="button" onClick={() => { setError(""); setLoading(institutions.length === 0); window.dispatchEvent(new Event("micole:refresh-affiliates")); }}><RefreshCw size={14} /> Reintentar instituciones</button></div>}
  </section>;
}

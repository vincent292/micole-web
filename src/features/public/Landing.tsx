import { DemoContact } from "./DemoContact";
import {usePlatformTariffs} from '../Pricing';
import { useState } from "react";
import {
  AnimatePresence,
  LazyMotion,
  MotionConfig,
  useReducedMotion,
  useScroll,
  useSpring,
  type Variants,
} from "motion/react";
import * as m from "motion/react-m";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  GraduationCap,
  Heart,
  Images,
  LockKeyhole,
  Menu,
  MessageCircle,
  NotebookPen,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Brand } from "../../components/Brand";
import { InstitutionsShowcase } from "./InstitutionsShowcase";

const loadMotionFeatures = () =>
  import("./motionFeatures").then((module) => module.default);
const entranceEase = [0.22, 1, 0.36, 1] as const;
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.58, ease: entranceEase } },
};
const benefits = [
  {
    icon: NotebookPen,
    title: "Un cuaderno que los conecta",
    text: "Actividades, tareas y pequeñas historias del día. Comparte cada avance con su familia.",
    tone: "blue",
  },
  {
    icon: CalendarDays,
    title: "Una agenda para todos",
    text: "Eventos, cumpleaños, horarios y materiales. Cada aula tiene su propio espacio.",
    tone: "yellow",
  },
  {
    icon: Wallet,
    title: "Las cuentas, en orden",
    text: "Organiza mensualidades, matrícula, merienda y descuentos. Cada familia consulta sus cuotas.",
    tone: "mint",
  },
  {
    icon: MessageCircle,
    title: "Conversaciones más cerca",
    text: "Un inbox por estudiante para familias, maestras y dirección. Sin perder mensajes importantes.",
    tone: "mint",
  },
  {
    icon: ShieldCheck,
    title: "Cuidado en cada detalle",
    text: "Alergias, contactos de emergencia, permisos y personas autorizadas para recoger a los niños.",
    tone: "blue",
  },
  {
    icon: Images,
    title: "Momentos para recordar",
    text: "Una galería privada para compartir sus descubrimientos con las personas que les acompañan.",
    tone: "yellow",
  },
];
const questions = [
  [
    "¿MiCole sirve para colegios y guarderías?",
    "Sí. Puedes organizar aulas, niveles y horarios, asignar varias maestras a un curso y usar el cuaderno, las notas y la agenda según las necesidades de tu institución.",
  ],
  [
    "¿Cada familia ve únicamente a sus hijos?",
    "Sí. Dirección registra los correos de madre y padre. Sus cuentas verificadas acceden únicamente a sus hijos. Una familia puede acompañar a varios hijos y cada niño puede tener más de un responsable: su madre y su padre.",
  ],
  [
    "¿La mensualidad del colegio está incluida?",
    "La licencia de MiCole se añade a la mensualidad que define la institución. Su tarifa vigente aparece en esta página y puede existir un acuerdo propio para tu colegio. La matrícula y la merienda se configuran aparte.",
  ],
  [
    "¿Cómo funcionan los pagos?",
    "Dirección crea los planes y registra los pagos recibidos en efectivo o por transferencia. Los QR dinámicos de Baneco se habilitan al configurar y comprobar la cuenta bancaria correspondiente.",
  ],
  [
    "¿Puedo usarlo desde el celular?",
    "Sí. La web se adapta al celular y puedes añadir un acceso a tu pantalla de inicio. También puedes usar la aplicación Android de MiCole.",
  ],
];
export function Landing() {
  const {rates,ready,error:tariffError}=usePlatformTariffs(null,true,true);
  const [menu, setMenu] = useState(false);
  const reducedMotion = useReducedMotion() !== false;
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 28, restDelta: 0.001 });
  const sectionVariants: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1, y: 0,
      transition: { duration: 0.6, ease: entranceEase, staggerChildren: 0.075 },
    },
  };
  const reveal = {
    initial: reducedMotion ? false as const : "hidden",
    whileInView: "visible",
    viewport: { once: true, amount: 0.12 },
    variants: sectionVariants,
  };
  const cardInteraction = {
    whileHover: reducedMotion ? undefined : { y: -5 },
    whileTap: reducedMotion ? undefined : { scale: 0.99 },
    transition: { duration: 0.2, ease: entranceEase },
  };
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadMotionFeatures} strict>
        <div className="landing landing-motion">
          {!reducedMotion && <m.div className="landing-scroll-progress" style={{ scaleX: progress }} aria-hidden="true" />}
          <a className="skip-link" href="#contenido">
            Ir al contenido
          </a>
          <header className="landing-header">
            <div className="landing-nav">
              <Brand />
              <nav
                className={menu ? "landing-links is-open" : "landing-links"}
                aria-label="Navegación de MiCole"
              >
                <a href="#comunidad" onClick={() => setMenu(false)}>
                  Para tu comunidad
                </a>
                <a href="#instituciones" onClick={() => setMenu(false)}>
                  Instituciones
                </a>
                <a href="#funciones" onClick={() => setMenu(false)}>
                  Lo que puedes hacer
                </a>
                <a href="#planes" onClick={() => setMenu(false)}>
                  Planes
                </a>
                <a href="#solicitar-demo" onClick={() => setMenu(false)}>Solicitar demo</a>
                <a href="#preguntas" onClick={() => setMenu(false)}>
                  Preguntas
                </a>
              </nav>
              <div className="landing-header-actions">
                <Link className="landing-login" to="/login">
                  Ingresar <ArrowRight size={17} />
                </Link>
                <button
                  className="landing-menu icon-button"
                  aria-label={menu ? "Cerrar menú público" : "Abrir menú público"}
                  aria-expanded={menu}
                  onClick={() => setMenu(!menu)}
                >
                  {menu ? <X size={23} /> : <Menu size={23} />}
                </button>
              </div>
            </div>
          </header>
          <main id="contenido">
            <section className="landing-hero landing-container">
              <m.div className="landing-hero-copy" initial={reducedMotion ? false : "hidden"} animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.095, delayChildren: 0.05 } } }}>
                <m.span className="landing-eyebrow" variants={itemVariants}>
                  <span /> MÁS CERCA, CADA DÍA
                </m.span>
                <m.h1 variants={itemVariants}>
                  Todo lo importante
                  <br />
                  del colegio,
                  <br />
                  <span>en un solo lugar.</span>
                  <i className="title-spark" aria-hidden="true">
                    <Sparkles size={35} />
                  </i>
                </m.h1>
                <m.p variants={itemVariants}>
                  Menos papeles y mensajes perdidos. Más tiempo para aprender,
                  cuidar y acompañar a quienes más importan.
                </m.p>
                <m.div className="landing-hero-actions" variants={itemVariants}>
                  <a
                    href="#solicitar-demo"
                    className="btn btn-primary landing-cta"
                  >
                    Solicitar demo para mi institución <ArrowRight size={19} />
                  </a>
                  <Link to="/demo" className="landing-secondary">
                    Probar demo ahora <ArrowRight size={17} />
                  </Link>
                </m.div>
                <m.div className="hero-reassurance" variants={itemVariants}>
                  <span>
                    <CheckCheck size={17} /> Colegios, kínderes y guarderías
                  </span>
                  <span>
                    <LockKeyhole size={16} /> Un espacio para cada familia
                  </span>
                </m.div>
              </m.div>
              <ProductPreview />
            </section>
            <m.section className="landing-intro" {...reveal}>
              <div className="landing-container">
                <p>
                  El colegio crece mejor cuando estamos <strong>conectados.</strong>
                </p>
                <div className="intro-pills">
                  <span>
                    <GraduationCap size={20} /> Dirección
                  </span>
                  <i />
                  <span>
                    <BookOpen size={20} /> Maestras
                  </span>
                  <i />
                  <span>
                    <Heart size={20} /> Familias
                  </span>
                </div>
              </div>
            </m.section>
            <InstitutionsShowcase />
            <m.section id="comunidad" className="landing-section landing-container" {...reveal}>
              <div className="landing-section-heading">
                <span className="landing-eyebrow">
                  UNA COMUNIDAD, MUCHAS CONEXIONES
                </span>
                <h2>
                  Un espacio para cada quien.
                  <br />
                  <span>Un mismo equipo.</span>
                </h2>
                <p>
                  Cada persona encuentra lo que necesita para hacer más simple su
                  día.
                </p>
              </div>
              <div className="audience-grid">
                <m.article className="audience-card audience-director" variants={itemVariants} {...cardInteraction}>
                  <span className="audience-icon">
                    <GraduationCap size={30} />
                  </span>
                  <span className="audience-number">01</span>
                  <h3>
                    Para dirigir
                    <br />
                    con tranquilidad.
                  </h3>
                  <p>
                    Tu institución, organizada. Inscripciones, aulas, equipo docente
                    y pagos desde un solo panel.
                  </p>
                  <ul>
                    <li>
                      <Check size={16} /> Inscripciones y familias
                    </li>
                    <li>
                      <Check size={16} /> Planes y descuentos
                    </li>
                    <li>
                      <Check size={16} /> Comunicados generales
                    </li>
                  </ul>
                  <Link to="/login?intent=school">
                    Conectar mi institución <ArrowRight size={19} />
                  </Link>
                </m.article>
                <m.article className="audience-card audience-teacher" variants={itemVariants} {...cardInteraction}>
                  <span className="audience-icon">
                    <BookOpen size={30} />
                  </span>
                  <span className="audience-number">02</span>
                  <h3>
                    Para enseñar
                    <br />y compartir.
                  </h3>
                  <p>
                    Cada aula tiene su historia. Registra actividades, publica
                    tareas y conversa con las familias.
                  </p>
                  <ul>
                    <li>
                      <Check size={16} /> Cuaderno individual y por aula
                    </li>
                    <li>
                      <Check size={16} /> Agenda y materiales
                    </li>
                    <li>
                      <Check size={16} /> Notas y recomendaciones
                    </li>
                  </ul>
                  <Link to="/login">
                    Entrar a mis aulas <ArrowRight size={19} />
                  </Link>
                </m.article>
                <m.article className="audience-card audience-family" variants={itemVariants} {...cardInteraction}>
                  <span className="audience-icon">
                    <Heart size={30} />
                  </span>
                  <span className="audience-number">03</span>
                  <h3>
                    Para acompañar
                    <br />
                    cada pequeño paso.
                  </h3>
                  <p>
                    Su día también es tuyo. Mantente cerca de sus aprendizajes y en
                    contacto con su colegio.
                  </p>
                  <ul>
                    <li>
                      <Check size={16} /> Actividades de tus hijos
                    </li>
                    <li>
                      <Check size={16} /> Pagos y permisos
                    </li>
                    <li>
                      <Check size={16} /> Mensajes y recuerdos
                    </li>
                  </ul>
                  <Link to="/login">
                    Entrar como familia <ArrowRight size={19} />
                  </Link>
                </m.article>
              </div>
            </m.section>
            <m.section id="funciones" className="features-section" {...reveal}>
              <div className="landing-container landing-section">
                <div className="landing-section-heading">
                  <span className="landing-eyebrow">
                    MENOS PENDIENTES. MÁS MOMENTOS.
                  </span>
                  <h2>
                    Lo que tu cole necesita.
                    <br />
                    <span>Sin complicar tu día.</span>
                  </h2>
                  <p>
                    Herramientas pensadas para la vida real de una comunidad
                    educativa.
                  </p>
                </div>
                <div className="feature-grid">
                  {benefits.map(({ icon: Icon, title, text, tone }) => (
                    <m.article key={title} className="feature-card" variants={itemVariants} {...cardInteraction}>
                      <span className={`feature-icon feature-${tone}`}>
                        <Icon size={25} strokeWidth={1.7} />
                      </span>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </m.article>
                  ))}
                </div>
              </div>
            </m.section>
            <m.section className="care-section landing-container" {...reveal}>
              <div className="care-visual">
                <Brand variant="symbol" linked={false} />
                <span className="care-badge">
                  <ShieldCheck size={19} /> Cada niño, bien acompañado
                </span>
                <span className="care-small-card">
                  <Heart size={23} /> Cuidar también es conectar.
                </span>
              </div>
              <div className="care-copy">
                <span className="landing-eyebrow">CUIDAMOS LO QUE IMPORTA</span>
                <h2>
                  Su información,
                  <br />
                  <span>con las personas correctas.</span>
                </h2>
                <p>
                  La familia accede a sus hijos, las maestras a sus aulas y
                  dirección a su institución. Cada vínculo comienza con una
                  invitación del colegio.
                </p>
                <div className="care-list">
                  <span>
                    <Check size={19} /> Varios hijos en una misma cuenta
                  </span>
                  <span>
                    <Check size={19} /> Madre y padre vinculados por el colegio
                  </span>
                  <span>
                    <Check size={19} /> Ficha de salud y contactos de emergencia
                  </span>
                  <span>
                    <Check size={19} /> Personas autorizadas para la recogida
                  </span>
                </div>
              </div>
            </m.section>
            <m.section id="planes" className="pricing-section landing-container" {...reveal}>
              <div className="landing-section-heading">
                <span className="landing-eyebrow">CLARO DESDE EL PRINCIPIO</span>
                <h2>
                  Un plan que crece
                  <br />
                  <span>con tu comunidad.</span>
                </h2>
                <p>
                  Paga por estudiante activo. Tu institución conserva el control de
                  sus tarifas.
                </p>
              </div>
              <div className="pricing-layout">
                <m.div className="pricing-card" variants={itemVariants} {...cardInteraction}>
                  <span className="pricing-label">
                    MICole · LICENCIA POR ESTUDIANTE
                  </span>
                  {tariffError&&<p className="message" role="status">Consulta las tarifas vigentes con MiCole.</p>}
                <div className="price">
                    <sup>Bs</sup>
                    <strong>{ready?rates.monthlyLicenseFee.toLocaleString("es-BO"):"…"}</strong>
                    <span>/ mes</span>
                  </div>
                  <p>Por cada estudiante con inscripción activa.</p>
                  <div className="activation-fee"><span>Crédito inicial por institución</span><b>Bs 500 <small>de saldo a favor</small></b><p>Se descuenta de las licencias mensuales de tus estudiantes.</p>{rates.activationEnabled&&rates.activationFee>0?<small>Activación por nuevo estudiante: Bs {rates.activationFee}.</small>:<small>Sin cobro de activación por estudiante.</small>}</div>
                  <ul>
                    <li>
                      <Check size={18} /> Panel para dirección y maestras
                    </li>
                    <li>
                      <Check size={18} /> Acceso familiar y cuaderno digital
                    </li>
                    <li>
                      <Check size={18} /> Agenda, mensajes y permisos
                    </li>
                    <li>
                      <Check size={18} /> Gestión de cuotas y descuentos
                    </li>
                  </ul>
                  <Link to="/login?intent=school" className="btn btn-primary full">
                    Quiero comenzar <ArrowRight size={18} />
                  </Link>
                  <small>
                    El adelanto se descuenta de tus licencias. Al agotarse, continúas con los pagos mensuales.
                  </small>
                </m.div>
                <div className="pricing-explanation">
                  <span className="feature-icon feature-mint">
                    <Wallet size={28} />
                  </span>
                  <h3>
                    Tu colegio.
                    <br />
                    Tus reglas de pago.
                  </h3>
                  <p>
                    Define la mensualidad, configura la matrícula y la merienda,
                    aplica descuentos por fecha y crea el plan que necesita cada
                    familia.
                  </p>
                  <div className="pricing-note">
                    <ShieldCheck size={21} />
                    <p>
                      La licencia de MiCole se incorpora a la mensualidad escolar.
                      Los cobros de la institución y las liquidaciones de MiCole se
                      administran por separado.
                    </p>
                  </div>
                  <Link to="/login?intent=school" className="landing-secondary">
                    Solicitar acceso para mi institución <ArrowRight size={18} />
                  </Link>
                </div>
              </div>
            </m.section>
            <DemoContact />
            <m.section id="preguntas" className="faq-section landing-container" {...reveal}>
              <div className="faq-heading">
                <span className="landing-eyebrow">CONVERSEMOS</span>
                <h2>
                  Tal vez te estés
                  <br />
                  <span>preguntando…</span>
                </h2>
                <p>Aquí respondemos algunas dudas antes de dar el primer paso.</p>
              </div>
              <div className="faq-list">
                {questions.map(([q, a]) => (
                  <details key={q}>
                    <summary>
                      {q}
                      <ChevronDown size={19} />
                    </summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </m.section>
            <m.section className="landing-final-cta landing-container" {...reveal}>
              <span className="cta-decoration" aria-hidden="true">
                <Brand variant="symbol" linked={false} />
              </span>
              <div>
                <span className="landing-eyebrow">CRECEMOS MEJOR, JUNTOS</span>
                <h2>
                  Un pequeño cambio.
                  <br />
                  Un gran día para tu cole.
                </h2>
                <p>
                  Conecta a tu comunidad y comienza una nueva forma de acompañar.
                </p>
              </div>
              <Link to="/login?intent=school" className="btn cta-white">
                Empezar con MiCole <ArrowRight size={20} />
              </Link>
            </m.section>
          </main>
          <footer className="landing-footer landing-container">
            <div>
              <Brand variant="tagline" />
              <p>
                Una comunidad educativa más cerca,
                <br />
                en cada pequeño paso.
              </p>
            </div>
            <div className="footer-links">
              <a href="#comunidad">Para tu comunidad</a>
              <a href="#instituciones">Instituciones</a>
              <a href="#planes">Planes</a>
              <Link to="/login">Ingresar a MiCole</Link>
              <a href="#preguntas">Preguntas frecuentes</a>
            </div>
            <div className="footer-bottom">
              <small>
                © {new Date().getFullYear()} MiCole. Hecho para aprender y crecer
                juntos.
              </small>
              <span>
                <Heart size={14} /> Desde Bolivia, para tu comunidad.
              </span>
            </div>
          </footer>
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}
const previewSections = [
  { id: "journal", label: "Cuaderno", icon: NotebookPen, heading: "¡Hoy crecemos juntos!", welcome: "Pequeños descubrimientos, grandes sonrisas.", subtitle: "Un espacio para acompañarles.", first: "Un mundo de colores", firstDetail: "Una actividad compartida con la familia.", second: "Un nuevo aprendizaje", secondDetail: "El día de cada niño, en su cuaderno." },
  { id: "classrooms", label: "Aulas", icon: Users, heading: "Cada aula tiene su espacio", welcome: "El equipo docente, conectado.", subtitle: "Organiza los cursos y sus maestras.", first: "Mi aula y sus actividades", firstDetail: "Tareas y avisos para el curso asignado.", second: "Un mismo equipo", secondDetail: "Dirección y docentes acompañan juntos." },
  { id: "calendar", label: "Agenda", icon: CalendarDays, heading: "Nos encontramos en el cole", welcome: "Los momentos importantes, a mano.", subtitle: "Una agenda para tu comunidad.", first: "Taller de pequeños artistas", firstDetail: "Una actividad para compartir en el aula.", second: "Día de encuentro familiar", secondDetail: "Eventos y recordatorios en un lugar." },
  { id: "payments", label: "Cuotas", icon: Wallet, heading: "Las cuentas, en orden", welcome: "Un plan para cada familia.", subtitle: "Las tarifas las define tu institución.", first: "Plan de mensualidades", firstDetail: "Consulta las cuotas y sus vencimientos.", second: "Matrícula y merienda", secondDetail: "Cada concepto, claramente identificado." },
  { id: "family", label: "Familia", icon: Heart, heading: "Su día también es tuyo", welcome: "Cerca, en cada pequeño paso.", subtitle: "Cada familia acompaña a sus hijos.", first: "Su historia de hoy", firstDetail: "Actividades y recomendaciones del aula.", second: "Cuidamos lo que importa", secondDetail: "Contactos de emergencia y ficha de salud." },
] as const;

function ProductPreview() {
  const [selected, setSelected] = useState(0);
  const reducedMotion = useReducedMotion() !== false;
  const current = previewSections[selected];
  const CurrentIcon = current.icon;
  return (
    <m.div
      className="product-preview-scene"
      role="region"
      aria-label="Vista previa ilustrativa del espacio MiCole"
      initial={reducedMotion ? false : { opacity: 0, y: 28, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.85, ease: entranceEase, delay: reducedMotion ? 0 : 0.2 }}
    >
      <m.span className="preview-orbit orbit-a" aria-hidden="true" initial={reducedMotion ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.1, ease: entranceEase, delay: 0.2 }} />
      <m.span className="preview-orbit orbit-b" aria-hidden="true" initial={reducedMotion ? false : { scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 1.15, ease: entranceEase, delay: 0.35 }} />
      <m.div className="preview-floating preview-family" initial={reducedMotion ? false : { opacity: 0, x: 15, y: -14 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.7, ease: entranceEase, delay: 0.55 }}>
        <span><Heart size={19} /></span>
        <div><b>Familias más cerca</b><small>En cada pequeño paso</small></div>
      </m.div>
      <m.div className="product-preview" initial={{ rotate: reducedMotion ? 0 : -3 }} animate={{ rotate: reducedMotion ? 0 : -3 }} whileHover={reducedMotion ? undefined : { rotate: 0 }} transition={{ duration: 0.4, ease: entranceEase }}>
        <div className="preview-header">
          <Brand linked={false} />
          <div><Bell size={16} /><span>MC</span></div>
        </div>
        <div className="preview-body">
          <aside role="tablist" aria-label="Secciones de la vista ilustrativa" aria-orientation="vertical">
            {previewSections.map(({ id, label, icon: Icon }, index) => (
              <m.button
                key={id}
                id={`preview-tab-${id}`}
                role="tab"
                type="button"
                aria-label={`Vista de ${label}`}
                title={label}
                aria-selected={selected === index}
                aria-controls={`preview-panel-${id}`}
                tabIndex={selected === index ? 0 : -1}
                className={selected === index ? "preview-nav-active" : undefined}
                onClick={() => setSelected(index)}
                onKeyDown={(event) => {
                  const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
                  if (!direction && event.key !== "Home" && event.key !== "End") return;
                  event.preventDefault();
                  const next = event.key === "Home" ? 0 : event.key === "End" ? previewSections.length - 1 : (index + direction + previewSections.length) % previewSections.length;
                  setSelected(next);
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
                }}
                whileTap={reducedMotion ? undefined : { scale: 0.93 }}
              ><Icon size={18} /></m.button>
            ))}
          </aside>
          <div className="preview-content-stage">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={current.id}
                className="preview-main"
                id={`preview-panel-${current.id}`}
                role="tabpanel"
                aria-labelledby={`preview-tab-${current.id}`}
                tabIndex={0}
                initial={reducedMotion ? false : { opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -5 }}
                transition={{ duration: reducedMotion ? 0 : 0.17 }}
              >
                <span className="preview-today">NUESTRO DÍA EN MICOLE · {current.label.toUpperCase()}</span>
                <h3>{current.heading}</h3>
                <div className="preview-welcome">
                  <div><b>{current.welcome}</b><span>{current.subtitle}</span></div>
                  <Brand variant="symbol" linked={false} />
                </div>
                <div className="preview-mini-stats">
                  <div><BookOpen size={17} /><span>Mi aula</span></div>
                  <div><Heart size={17} /><span>Mi familia</span></div>
                  <div><CalendarDays size={17} /><span>Mi agenda</span></div>
                </div>
                <div className="preview-entry">
                  <span className="preview-entry-icon"><CurrentIcon size={21} /></span>
                  <div><b>{current.first}</b><small>{current.firstDetail}</small><i>{current.label}</i></div>
                  <CheckCheck size={18} />
                </div>
                <div className="preview-entry">
                  <span className="preview-entry-icon mint"><Heart size={21} /></span>
                  <div><b>{current.second}</b><small>{current.secondDetail}</small></div>
                  <ChevronDown size={16} />
                </div>
              </m.div>
            </AnimatePresence>
          </div>
        </div>
      </m.div>
      <m.div className="preview-floating preview-check" initial={reducedMotion ? false : { opacity: 0, x: -15, y: 12 }} animate={{ opacity: 1, x: 0, y: 0 }} transition={{ duration: 0.7, ease: entranceEase, delay: 0.7 }}>
        <span><Check size={19} /></span>
        <div><b>Todo en su lugar</b><small>Más tiempo para lo importante</small></div>
      </m.div>
      <span className="preview-dot preview-dot-one" aria-hidden="true" />
      <span className="preview-dot preview-dot-two" aria-hidden="true" />
      <small className="preview-caption">Vista ilustrativa · prueba las secciones del panel.</small>
    </m.div>
  );
}

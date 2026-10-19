import "./demo.css";
import {useSearchMetadata} from "./lib/useSearchMetadata";
import { publicDemo, publicDemoUrl } from "./lib/demo-config";
import { DemoAccess } from "./features/public/DemoAccess";
import { lazy, Suspense, useEffect, useRef } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Brand } from "./components/Brand";
import { Landing } from "./features/public/Landing";
const FamilyIntakePage = lazy(() =>
  import("./features/public/FamilyIntakePage").then((module) => ({
    default: module.FamilyIntakePage,
  })),
);
const PaymentLinkPage = lazy(() => import("./features/public/PaymentLinkPage").then(module => ({ default: module.PaymentLinkPage })));
const WorkspaceApp = lazy(() => import("./WorkspaceApp"));
const legacyPages = new Set([
  "overview",
  "schools",
  "students",
  "teachers",
  "classrooms",
  "family",
  "payments", "cash", "invoices", "activities",
  "platform",
  "reports",
  "journal",
  "calendar",
  "announcements",
  "messages",
  "requests",
  "grades",
  "gallery",
  "materials",
  "settings",
  "institutionRequests",
  "audit",
]);
export default function App() {
  useSearchMetadata();
  const location = useLocation();
  if (publicDemo && ["/", "/demo", "/login"].includes(location.pathname)) return <DemoAccess />;
  if (!publicDemo && location.pathname === "/demo") return <DemoRedirect />;
  if (location.pathname === "/") {
    if (
      location.hash.includes("access_token=") ||
      new URLSearchParams(location.search).has("code")
    )
      return (
        <Navigate
          to={`/auth/callback${location.search}${location.hash}`}
          replace
        />
      );
    return <Landing />;
  }
  if (location.pathname.startsWith("/pago/")) return <Suspense fallback={<main className="loading-screen">Cargando pago…</main>}><PaymentLinkPage /></Suspense>;
  if (location.pathname.startsWith("/inscripcion/"))
    return (
      <Suspense
        fallback={
          <main className="loading-screen">
            <Brand />
            <p>Preparando la ficha…</p>
          </main>
        }
      >
        <FamilyIntakePage />
      </Suspense>
    );
  if (legacyPages.has(location.pathname.split("/")[1]))
    return (
      <Navigate to={`/app${location.pathname}${location.search}`} replace />
    );
  if (
    location.pathname === "/app" ||
    location.pathname.startsWith("/app/") ||
    location.pathname === "/login" ||
    location.pathname === "/auth/callback" ||
    location.pathname.startsWith("/invite/")
  )
    return (
      <Suspense
        fallback={
          <main className="loading-screen">
            <Brand />
            <p>Preparando tu espacio MiCole…</p>
          </main>
        }
      >
        <WorkspaceApp />
      </Suspense>
    );
  return (
    <main className="not-found">
      <Brand />
      <h1>Este camino no llega a tu cole.</h1>
      <p>La página que buscas no está disponible.</p>
      <Link to="/" className="btn btn-primary">
        Volver al inicio
      </Link>
    </main>
  );
}

function DemoRedirect() {
  const started=useRef(false);
  const valid=/^https:\/\//.test(publicDemoUrl);
  useEffect(()=>{if(valid&&!started.current){started.current=true;window.location.replace(publicDemoUrl);}},[valid]);
  return <main className="loading-screen"><Brand/><h1>Demostración de MiCole</h1><p>Preparando el acceso inmediato…</p>{valid?<a className="btn btn-primary" href={publicDemoUrl}>Abrir demo</a>:<Link className="btn btn-primary" to="/">Volver a MiCole</Link>}</main>;
}

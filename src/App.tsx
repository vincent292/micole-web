import { lazy, Suspense } from "react";
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
  const location = useLocation();
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

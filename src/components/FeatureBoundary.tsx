import { Component, Suspense, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "./UI";

class FeatureErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Keep the workspace shell usable while a feature loads or fails to load. */
export function FeatureBoundary({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <FeatureErrorBoundary
      fallback={
        <section className="panel" role="alert">
          <h2>No pudimos abrir {label}</h2>
          <p>Recarga esta página para volver a intentarlo.</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Recargar página
          </Button>
        </section>
      }
    >
      <Suspense
        fallback={
          <div className="panel" role="status">
            <RefreshCw className="spin" size={20} aria-hidden="true" />
            <p>Cargando {label}…</p>
          </div>
        }
      >
        {children}
      </Suspense>
    </FeatureErrorBoundary>
  );
}

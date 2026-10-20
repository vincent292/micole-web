import { useEffect, useRef, useState, type ReactNode } from "react";
import { recordView } from "../lib/financialApi";
import { uid } from "../lib/format";
import type { ViewKind } from "../lib/financialRecords";
/** Only visible content is recorded; background list fetches do not generate views. */
export function ContentSeen({
  kind,
  id,
  children,
  enabled = true,
}: {
  kind: ViewKind;
  id: string;
  children: ReactNode;
  enabled?: boolean;
}) {
  const element = useRef<HTMLDivElement>(null),
    event = useRef(uid()),
    done = useRef(false);
  const [error, setError] = useState("");
  const save = async () => {
    try {
      await recordView(kind, id, "open", event.current);
      done.current = true;
      setError("");
    } catch {
      setError("No se pudo registrar esta consulta.");
    }
  };
  useEffect(() => {
    const node = element.current;
    if (!node || !enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    let visible = false;
    const check = () => {
      if (!alive || !visible || done.current) return;
      if (
        document.visibilityState === "visible" &&
        !document.querySelector('[aria-modal="true"]')
      )
        void save();
      else timer = setTimeout(check, 1000);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        clearTimeout(timer);
        visible = !!entries[0]?.isIntersecting;
        if (visible && !done.current) timer = setTimeout(check, 700);
      },
      { threshold: 0.01 },
    );
    observer.observe(node);
    return () => {
      alive = false;
      clearTimeout(timer);
      observer.disconnect();
    };
    // A key on the caller remounts this receipt when the displayed content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, enabled]);
  return (
    <div ref={element}>
      {children}
      {error && (
        <p className="message error" role="alert">
          {error}{" "}
          <button
            type="button"
            className="text-button"
            onClick={() => void save()}
          >
            Reintentar registro
          </button>
        </p>
      )}
    </div>
  );
}

import { useState } from "react";
import { Button, Empty, Field, Modal, SectionTitle } from "../components/UI";
import { rpc } from "../lib/repository";
import { dateLabel } from "../lib/format";
import type { DemoRequest } from "../lib/types";
import type { PageProps } from "./Pages";
const labels = {
  pending: "Por contactar",
  contacted: "Contactada",
  closed: "Cerrada",
};
export function DemoRequests({ store }: PageProps) {
  const [status, setStatus] = useState("pending"),
    [search, setSearch] = useState(""),
    [review, setReview] = useState<DemoRequest | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const rows = store.data.demoRequests
    .filter(
      (r) =>
        (status === "all" || r.status === status) &&
        `${r.schoolName} ${r.contactName} ${r.city} ${r.email}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <SectionTitle
        title="Solicitudes de demostración"
        subtitle="Instituciones que pidieron conocer MiCole desde la landing."
      />
      <div className="toolbar">
        <Field label="Estado de solicitudes" name="demoStatus">
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Todas</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Buscar solicitud" name="demoSearch">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Institución, ciudad o contacto"
          />
        </Field>
      </div>
      <div className="card-grid">
        {rows.map((r) => (
          <article className="entity-card" key={r.id}>
            <span className="course-tag">{labels[r.status]}</span>
            <h3>{r.schoolName}</h3>
            <p>
              {r.city} · {r.contactName}
            </p>
            <p>
              <a href={`mailto:${r.email}`}>{r.email}</a>
              <br />
              {r.phone}
            </p>
            <p>{r.message}</p>
            {r.notes && <p className="response-text">Seguimiento: {r.notes}</p>}
            <small>{dateLabel(r.createdAt)}</small>
            <Button
              variant="secondary"
              onClick={() => {
                setReview(r);
                setError("");
              }}
            >
              Registrar seguimiento
            </Button>
          </article>
        ))}
      </div>
      {!rows.length && (
        <Empty
          title="No hay solicitudes en este estado"
          subtitle="Las solicitudes recibidas desde la landing aparecerán aquí."
        />
      )}
      {review && (
        <Modal
          title={`Seguimiento · ${review.schoolName}`}
          onClose={() => setReview(null)}
          busy={busy}
          error={error}
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await rpc("review_demo_request", {
                p_id: review.id,
                p_status: String(f.get("status")),
                p_notes: String(f.get("notes") || ""),
              });
              await store.refresh();
              setReview(null);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Estado" name="status">
            <select name="status" defaultValue={review.status}>
              {Object.entries(labels).map(([v, label]) => (
                <option value={v} key={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notas de seguimiento" name="notes">
            <textarea
              name="notes"
              rows={4}
              maxLength={2000}
              defaultValue={review.notes}
            />
          </Field>
        </Modal>
      )}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { Button } from "../components/UI";
import {
  askGuide,
  guideActions,
  guideReviewNotice,
  type GuideAction,
  type GuideMessage,
  type GuideReply,
} from "../lib/assistant";
import { publicDemo } from "../lib/demo-config";
import "../styles/assistant.css";
export function DirectorAssistant({
  schoolId,
  onAction,
}: {
  schoolId: string;
  onAction: (action: GuideAction) => void;
}) {
  const [open, setOpen] = useState(false),
    [question, setQuestion] = useState(""),
    [history, setHistory] = useState<GuideMessage[]>([]),
    [answers, setAnswers] = useState<{ question: string; reply: GuideReply }[]>(
      [],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [answers, busy, open]);
  async function ask(text = question) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    const next = [
      ...history,
      { role: "user" as const, text: text.trim() },
    ].slice(-8);
    try {
      const reply = await askGuide(schoolId, next);
      if (!alive.current) return;
      setHistory(
        [
          ...next,
          {
            role: "model" as const,
            text: (reply.answer + "\n" + reply.steps.join("\n")).slice(0, 3000),
          },
        ].slice(-6),
      );
      setAnswers((old) => [...old.slice(-11), { question: text, reply }]);
      setQuestion("");
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div className="director-assistant">
      {!open ? (
        <Button icon={Bot} onClick={() => setOpen(true)}>
          Ayuda MiCole
        </Button>
      ) : (
        <section
          className="assistant-window"
          role="dialog"
          aria-label="Asistente MiCole"
        >
          <header>
            <div>
              <b>
                <Bot size={20} /> Asistente MiCole
              </b>
              <small>
                {publicDemo
                  ? "Guía de ejemplo · demo local"
                  : "Guía con Gemini · Dirección"}
              </small>
            </div>
            <Button
              variant="ghost"
              aria-label="Cerrar asistente"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </Button>
          </header>
          <div className="assistant-conversation" aria-live="polite">
            <p>
              Puedo orientarte y preparar borradores de texto. Los botones abren
              páginas o formularios; cada registro se guarda desde su módulo.
            </p>
            <p className="assistant-review-note">{guideReviewNotice}</p>
            <p>Evita incluir datos personales de alumnos, contraseñas o claves.</p>
            {!answers.length && (
              <div className="assistant-suggestions">
                {[
                  "¿Cómo inscribo a un estudiante?",
                  "Prepara un borrador de invitación a una reunión, sin datos personales.",
                  "¿Cómo agrego otra sede?",
                ].map((q) => (
                  <Button
                    variant="secondary"
                    key={q}
                    disabled={busy}
                    onClick={() => void ask(q)}
                  >
                    {q}
                  </Button>
                ))}
              </div>
            )}
            {answers.map((entry, i) => (
              <article key={i}>
                <p className="assistant-question">{entry.question}</p>
                <p className="preserve-lines">{entry.reply.answer}</p>
                {entry.reply.steps.length > 0 && (
                  <ol>
                    {entry.reply.steps.map((s, n) => (
                      <li key={n}>{s}</li>
                    ))}
                  </ol>
                )}
                {entry.reply.draft && (
                  <section className="assistant-draft" aria-label="Borrador pendiente de revisión">
                    <b>Borrador · pendiente de revisión</b>
                    <p>{entry.reply.draft.title}</p>
                    <p className="preserve-lines">{entry.reply.draft.body}</p>
                    <small>Revisa y completa el texto antes de usarlo. Este borrador no se ha guardado ni publicado.</small>
                  </section>
                )}
                <div className="assistant-actions">
                  {entry.reply.actions.map((id) => (
                    <Button
                      key={id}
                      variant="secondary"
                      onClick={() => {
                        setOpen(false);
                        onAction(id);
                      }}
                    >
                      {guideActions[id].label}
                    </Button>
                  ))}
                </div>
              </article>
            ))}
            {busy && <p role="status">Preparando los pasos…</p>}
            {error && (
              <p className="message error" role="alert">
                {error}
              </p>
            )}
            <div ref={end} />
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="field">
              <span>Tu pregunta sobre MiCole</span>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={3000}
                rows={2}
                required
                placeholder="¿Dónde veo los pagos pendientes?"
              />
            </label>
            <div className="assistant-compose">
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setAnswers([]);
                  setHistory([]);
                  setError("");
                }}
              >
                Nueva conversación
              </Button>
              <Button
                type="submit"
                icon={Send}
                disabled={busy || !question.trim()}
              >
                Enviar
              </Button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

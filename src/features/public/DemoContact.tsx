import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, MessageCircle } from "lucide-react";
import { Button, Field } from "../../components/UI";
import { bolivianCities } from "../../lib/operations";
import { liveMode } from "../../lib/supabase";
import { validateDemoContact } from "../../../supabase/functions/demo-request/validate";
export function DemoContact() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    key = useRef(crypto.randomUUID());
  return (
    <section
      id="solicitar-demo"
      className="landing-container demo-contact-section"
      aria-labelledby="demo-contact-title"
    >
      <div className="demo-contact-copy">
        <span className="landing-eyebrow">CONOCE MICOLE CON NOSOTROS</span>
        <h2 id="demo-contact-title">
          Tu institución,
          <br />
          <span>nuestro próximo encuentro.</span>
        </h2>
        <p>
          Solicita una demostración guiada. Cuéntanos cómo es tu comunidad y te
          contactaremos para mostrarte MiCole.
        </p>
        <p>
          <MessageCircle size={20} /> Atención para colegios, kínderes y
          guarderías.
        </p>
        <Link className="landing-secondary" to="/demo">
          ¿Prefieres explorar por tu cuenta? Probar demo{" "}
          <ArrowRight size={17} />
        </Link>
      </div>
      <div className="panel demo-contact-form">
        {done ? (
          <div className="demo-contact-success" role="status">
            <CheckCircle2 size={36} />
            <h3>Recibimos tu solicitud</h3>
            <p>
              Nos pondremos en contacto contigo usando los datos que indicaste.
              Mientras tanto, puedes explorar la demo.
            </p>
            <Link to="/demo" className="btn btn-primary">
              Explorar MiCole
            </Link>
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                const contact = validateDemoContact({
                  schoolName: f.get("schoolName"),
                  contactName: f.get("contactName"),
                  email: f.get("email"),
                  phone: f.get("phone"),
                  city: f.get("city"),
                  message: f.get("message"),
                  consent: f.get("consent") === "on",
                });
                if (!liveMode)
                  throw new Error(
                    "En esta vista de prueba no se envían solicitudes comerciales. Puedes entrar directamente a la demo.",
                  );
                setBusy(true);
                const response = await fetch(
                  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/demo-request`,
                  {
                    method: "POST",
                    credentials: "omit",
                    headers: {
                      "Content-Type": "application/json",
                      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                    },
                    body: JSON.stringify({
                      ...contact,
                      requestKey: key.current,
                      website: String(f.get("website") || ""),
                    }),
                  },
                );
                const body = await response.json();
                if (!response.ok || body.ok !== true)
                  throw new Error(
                    body.error ||
                      "No pudimos recibir la solicitud. Intenta nuevamente.",
                  );
                setDone(true);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <Field
                label="Nombre de la institución"
                name="schoolName"
                required
              />
              <Field label="Tu nombre" name="contactName" required />
              <Field
                label="Correo de contacto"
                name="email"
                type="email"
                required
              />
              <Field
                label="Celular de contacto"
                name="phone"
                type="tel"
                required
              />
            </div>
            <Field label="Ciudad" name="city">
              <select name="city" required defaultValue="">
                <option value="" disabled>
                  Selecciona tu ciudad
                </option>
                {bolivianCities.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="¿Qué te gustaría conocer? (opcional)" name="message">
              <textarea name="message" rows={3} />
            </Field>
            <label className="demo-contact-trap" aria-hidden="true">
              Sitio web
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <label className="check-field">
              <input name="consent" type="checkbox" required /> Acepto que
              MiCole me contacte para atender esta solicitud de demostración.
            </label>
            {error && (
              <p className="message error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Enviando solicitud…" : "Solicitar demostración guiada"}
            </Button>
            <small>
              Tus datos se usarán para responder a esta solicitud. La demo de
              acceso inmediato sigue disponible sin registrarte.
            </small>
          </form>
        )}
      </div>
    </section>
  );
}

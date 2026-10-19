import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  Heart,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "../../components/Brand";
import { Button, Field } from "../../components/UI";
import { demoAccounts, demoLogin, demoPassword } from "../../lib/demo-config";
export function DemoAccess() {
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>(demoAccounts[0].email),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  return (
    <main className="demo-access">
      <header>
        <Brand />
        <a href="https://micole-web.vercel.app/" className="text-button">
          Conocer MiCole
        </a>
      </header>
      <div className="demo-access-grid">
        <section className="demo-intro">
          <span className="eyebrow">DEMO INTERACTIVA · ACCESO INMEDIATO</span>
          <h1>
            Tu próximo cole,
            <br />
            <span>más cerca.</span>
          </h1>
          <p>
            Explora MiCole como Dirección, Docente, Familia o Estudiante. Prueba
            los formularios y descubre cómo se conecta tu comunidad.
          </p>
          <div className="demo-highlights">
            <span>
              <GraduationCap /> Aulas, materias y tareas
            </span>
            <span>
              <Heart /> Familias y cuidados diarios
            </span>
            <span>
              <BookOpen /> Evaluaciones y libretas
            </span>
            <span>
              <ShieldCheck /> Pagos y permisos por rol
            </span>
          </div>
          <div className="demo-local-note">
            <b>Un espacio solo para tus pruebas</b>
            <p>
              Los datos son ficticios y tus cambios se guardan en este
              navegador. No se envían correos, no se suben archivos a la nube y
              no se realizan cobros. Puedes restablecer la demo cuando quieras.
            </p>
          </div>
        </section>
        <section className="panel demo-login-card">
          <h2>Solicitar demo</h2>
          <p>
            Ya tienes acceso. Elige un perfil y usa las credenciales de ejemplo.
          </p>
          <div
            className="demo-accounts"
            role="group"
            aria-label="Elegir perfil de demostración"
          >
            {demoAccounts.map((account) => (
              <button
                type="button"
                className={email === account.email ? "selected" : ""}
                key={account.role}
                onClick={() => {
                  setEmail(account.email);
                  setError("");
                }}
              >
                <strong>{account.label}</strong>
                <small>{account.email}</small>
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              try {
                demoLogin(email, password);
                navigate("/app/overview");
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Field label="Correo ficticio" name="demoEmail">
              <input
                name="demoEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Clave de demostración" name="demoPassword">
              <input
                name="demoPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="off"
              />
            </Field>
            <p className="demo-password">
              Clave para todos los perfiles: <code>{demoPassword}</code>
              <button
                type="button"
                className="text-button"
                onClick={() => setPassword(demoPassword)}
              >
                Usar esta clave
              </button>
            </p>
            {error && (
              <p className="message error" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" icon={ArrowRight}>
              Entrar a la demo
            </Button>
          </form>
          <small>
            Estas credenciales públicas sirven únicamente en la demostración.
            Dentro podrás cambiar de rol sin volver a ingresar.
          </small>
        </section>
      </div>
      <footer>
        MiCole · Cerca en cada paso ·{" "}
        <Link to="/login">Acceso de demostración</Link>
      </footer>
    </main>
  );
}

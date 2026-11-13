import { useId, useState, type ChangeEvent } from "react";
import { workspaceModeForLevels } from "../lib/kinder";
import { educationLevels } from "../lib/sites";

const choices = [
  { value: "Inicial", label: "Inicial / kínder", description: "Aulas de Inicial, cuidados y seguimiento infantil." },
  { value: "Primaria", label: "Primaria", description: "De 1.º a 6.º, con grados, paralelos y materias." },
  { value: "Secundaria", label: "Secundaria", description: "De 1.º a 6.º, con grados, paralelos y materias." },
];

export function InstitutionLevelsFields({ initialLevels = [] }: { initialLevels?: string[] }) {
  const [levels, setLevels] = useState(initialLevels);
  const helpId = useId();
  const mode = workspaceModeForLevels(levels);
  const regular = levels.some(level => level === "Primaria" || level === "Secundaria");
  const configuration = !levels.length ? "Selecciona al menos un nivel para continuar." : mode === "kinder" ? "Kínder y educación infantil" : mode === "school" ? "Colegio" : regular && levels.includes("Inicial") ? "Colegio con kínder" : "Institución con varios servicios educativos";
  const checkbox = (level: string) => ({
    type: "checkbox" as const, name: "educationLevels", value: level, checked: levels.includes(level),
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const checked = event.target.checked;
      setLevels(current => checked ? [...current, level] : current.filter(value => value !== level));
    },
  });
  return <>
    <p id={helpId}>Marca los niveles que ofrece esta sede. Puede ser solo kínder, solo colegio o ambos dentro de la misma institución.</p>
    <div className="institution-level-options" role="group" aria-label="Niveles educativos" aria-describedby={helpId}>
      {choices.map((choice, index) => <label className="institution-level-option" key={choice.value}>
        <input {...checkbox(choice.value)} aria-label={choice.label} required={index === 0 && !levels.length}/>
        <span><strong>{choice.label}</strong><small>{choice.description}</small></span>
      </label>)}
    </div>
    <div className="institution-extra-levels"><span>Otros servicios, si corresponde</span><div className="checkbox-grid">{educationLevels.filter(level => !choices.some(choice => choice.value === level)).map(level => <label className="check-field" key={level}><input {...checkbox(level)}/>{level}</label>)}</div></div>
    <div className="institution-level-summary" role="status"><strong>{configuration}</strong>{!!levels.length && <span>{levels.map(level => level === "Inicial" ? "Inicial / kínder" : level).join(" · ")}</span>}</div>
    <p className="muted">Las herramientas se adaptan al nivel de cada aula. Si tienes colegio y kínder, compartirán la identidad de la institución y cada nivel conservará sus herramientas.</p>
  </>;
}

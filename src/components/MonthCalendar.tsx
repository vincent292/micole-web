import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./UI";
import { today } from "../lib/billing";

export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(year, number - 1 + offset, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
export function MonthCalendar({ month, events, selected, onSelect, onMonth }: {
  month: string;
  events: { id: string; date: string; title: string; type: string }[];
  selected: string;
  onSelect: (date: string) => void;
  onMonth: (month: string) => void;
}) {
  const [year, number] = month.split("-").map(Number);
  if (!year || !number || number > 12) return null;
  const first = new Date(year, number - 1, 1, 12);
  const pad = (first.getDay() + 6) % 7;
  const days = new Date(year, number, 0, 12).getDate();
  const name = first.toLocaleDateString("es-BO", { month: "long", year: "numeric" });
  return <section className="panel month-calendar" aria-label="Calendario mensual">
    <div className="month-calendar-heading">
      <Button variant="ghost" aria-label="Mes anterior" onClick={() => onMonth(shiftMonth(month, -1))}><ChevronLeft size={20} /></Button>
      <h3>{name}</h3>
      <Button variant="ghost" aria-label="Mes siguiente" onClick={() => onMonth(shiftMonth(month, 1))}><ChevronRight size={20} /></Button>
    </div>
    <div className="month-calendar-grid">
      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(day => <span className="calendar-weekday" key={day}>{day}</span>)}
      {Array.from({ length: pad }, (_,i) => <span key={`pad-${i}`} aria-hidden="true" />)}
      {Array.from({ length: days }, (_,i) => {
        const date = `${month}-${String(i + 1).padStart(2,"0")}`;
        const entries = events.filter(e => e.date === date);
        return <button type="button" className={`calendar-day${today() === date ? " today" : ""}${selected === date ? " selected" : ""}`} key={date}
          aria-label={`${i+1} de ${name}, ${entries.length} actividades`} aria-pressed={selected === date} onClick={() => onSelect(selected === date ? "" : date)}>
          <b>{i+1}</b><span className="calendar-day-count">{entries.length ? `${entries.length} act.` : ""}</span>
          <span className="calendar-day-dots" aria-hidden="true">{entries.slice(0,3).map(e => <i key={e.id} className={`event-dot ${e.type}`} />)}</span>
        </button>;
      })}
    </div>
    {selected && <div className="calendar-selection"><span>Actividades del {Number(selected.slice(8))}</span><Button variant="ghost" onClick={() => onSelect("")}>Ver todo el mes</Button></div>}
  </section>;
}

/** A closed, deterministic knowledge boundary: no student records or model prompts. */
export interface BotContext {
  messageId: string; conversationId: string; schoolId: string; human: boolean; mode: string;
  settings: { hours: string; admissions: string; greeting: string; fallback: string; quick_replies: { title: string; keywords: string[]; body: string; enabled?: boolean }[] } | null;
  school: { name: string; siteName: string; city: string; description: string; levels: string[]; website: string; address: string; phone: string };
}
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const has = (text: string, phrase: string) => (` ${text} `).includes(` ${normalize(phrase)} `);
export function expandSchoolReply(body: string, context: BotContext) {
  const { school, settings } = context;
  const values: Record<string, string> = { institucion: school.name, sede: school.siteName, ciudad: school.city,
    direccion: school.address || 'Consulta la ubicación con nuestro equipo', telefono: school.phone,
    horario: settings?.hours || 'Consulta los horarios con nuestro equipo', inscripciones: settings?.admissions || 'Consulta las inscripciones con nuestro equipo',
    niveles: school.levels.join(', '), web: school.website || '', descripcion: school.description || '' };
  return body.replace(/\{([a-z]+)\}/g, (match, key: string) => values[key] ?? match).slice(0, 4000);
}
export function schoolBotReply(input: string, context: BotContext): { body: string; handoff: boolean } | null {
  if (context.human || context.mode !== 'automatic' || !context.settings) return null;
  const text = normalize(input), { settings, school } = context;
  const reply = (body: string, handoff = false) => ({ body: expandSchoolReply(body, context), handoff });
  if (['asesor', 'persona', 'humano', 'hablar con direccion', 'hablar con secretaria', 'no mas bot', 'dejar de responder', 'no me escriban', 'baja'].some(word => has(text, word))) return reply(settings.fallback, true);
  // Never infer access to a child's grades, debts, medical data, or identity.
  if (['nota', 'notas', 'calificacion', 'calificaciones', 'deuda', 'deudas', 'mi hijo', 'mi hija', 'alumno', 'alumna', 'estudiante', 'asistencia', 'salud', 'rude', 'carnet', 'contraseña', 'contrasena'].some(word => has(text, word))) {
    return reply('Para consultar datos de alumnos, ingresa a tu cuenta de MiCole. Nuestro equipo atenderá tu consulta por este canal.', true);
  }
  for (const item of settings.quick_replies || []) {
    if (item.enabled !== false && item.keywords.some(word => normalize(word).length >= 2 && has(text, word))) return reply(item.body);
  }
  if (['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'informacion', 'info', 'menu'].includes(text)) return reply(settings.greeting);
  if (['horario', 'horarios', 'hora', 'turno', 'turnos'].some(word => has(text, word)) && settings.hours.trim()) return reply('{institucion} · {sede}\n{horario}');
  if (['inscripcion', 'inscripciones', 'matricula', 'matriculas', 'requisitos', 'cupos'].some(word => has(text, word)) && settings.admissions.trim()) return reply('{institucion} · {sede}\n{inscripciones}');
  if (['direccion', 'ubicacion', 'donde', 'mapa'].some(word => has(text, word)) && school.address.trim()) return reply('{institucion} · {sede}\n{direccion}\n{ciudad}');
  if (['niveles', 'primaria', 'secundaria', 'kinder', 'inicial', 'guarderia'].some(word => has(text, word)) && school.levels.length) return reply('{institucion} · {sede}\nNiveles: {niveles}');
  if (['quienes son', 'metodologia', 'montessori', 'sobre el colegio', 'sobre la institucion'].some(word => has(text, word)) && school.description.trim()) return reply('{institucion} · {sede}\n{descripcion}');
  if (['telefono', 'contacto', 'numero'].some(word => has(text, word))) return reply('{institucion} · {sede}\n{telefono}');
  return reply(settings.fallback, true);
}

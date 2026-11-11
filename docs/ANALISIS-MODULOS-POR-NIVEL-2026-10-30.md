# MiCole: análisis de módulos por etapa educativa

Fecha: 30 de octubre de 2026.

Este informe distingue lo que encontré en las fuentes de lo que recomiendo para el producto. Revisé las 46 entradas del navegador web, las rutas y permisos de Android, los espacios de aula y expediente, los modelos de evaluación y las migraciones pertinentes. Es una revisión funcional y de arquitectura; no constituye una nueva ejecución completa de pruebas en la web publicada o en el teléfono. No modifiqué módulos, permisos, datos, APK ni despliegues.

**Recomendación principal.** Mantener una plataforma común con cuatro perfiles educativos por aula: guardería/maternal, Inicial —prekínder y kínder—, Primaria y Secundaria. Una institución puede utilizar varios perfiles simultáneamente. El rol, la vinculación con el alumno y la asignación docente siguen determinando los permisos. El perfil decide qué herramientas tienen sentido y cómo se presentan.

## 1. Qué existe actualmente y qué implica

| Hallazgo en las fuentes | Implicación para el producto |
|---|---|
| La web tiene `workspaceMode`: automático, kínder/guardería o colegio. | Todavía no hay cuatro configuraciones educativas completas. Primaria y Secundaria comparten la presentación general. |
| El modo kínder cambia nombres y organiza módulos principales y secundarios. | Muchas herramientas escolares siguen disponibles en “Más opciones”; no equivale a activar únicamente las herramientas adecuadas a la etapa. |
| En automático, el menú institucional web considera kínder solo cuando todos los niveles son de primera infancia. El aula puede adaptarse por separado. | En instituciones mixtas, la familia de un niño de Inicial puede recibir un menú general de colegio. Conviene resolverlo por hijo y aula seleccionados. |
| Android calcula primera infancia a partir de las aulas del contexto o los niveles de la institución; usa otra función y otro catálogo de nombres. | No hay una única regla compartida. Por ejemplo, la función web reconoce “Nidito” y “Educación inicial”, mientras la función Android tiene otras variantes. La preferencia `workspaceMode` no aparece en esa detección Android. |
| Las materias se habilitan por aula y existen actividades generales sin materia. | Es una buena base para guardería e Inicial; no se debe obligar a crear materias artificiales. |
| La evaluación admite columnas numéricas y cualitativas. La política formal tiene un único código `initial`. | Hay soporte útil, pero no una separación completa entre maternal, primero de Inicial y segundo de Inicial. La política actual impide `initial + bolivia2026`, pero permite Inicial con esquema flexible; eso no garantiza por sí solo que todo su recorrido sea cualitativo. |
| Conviven “Notas y recomendaciones” y “Evaluación y libretas”. El primer formulario admite texto libre como “90/100 o Logro destacado”. | Debe quedar clara la diferencia entre observación pedagógica y calificación oficial. Dos accesos que parecen calificar lo mismo pueden producir confusión. |
| Los menús de estudiante, tanto web como Android, incluyen tareas, materias, agenda y materiales, pero no una entrada directa a notas/libretas. | Para Secundaria, falta diseñar y autorizar una consulta del alumno a sus propios resultados publicados. Ocultar o mostrar un botón no basta: requiere una proyección segura del servidor. |
| La asistencia del alumno se consulta por aula y fecha. No recibe una materia o período de clase como parámetro. | La asistencia diaria actual sirve de base común. No debe anunciarse todavía como asistencia por cada hora o materia de Secundaria. |
| La gestión Bolivia distingue aulas de Primaria/Secundaria y excluye `initial`; esa distinción también se usa en reglas financieras. | Inicial escolarizada necesita una revisión específica. No conviene heredar automáticamente todas las reglas de guardería ni todos los formularios de Secundaria. |
| El rol de Secretaría académica solo tiene horarios. No existen roles globales separados de auxiliar de cuidados, recepción o caja. | Cuando crezca una institución, no conviene entregar una cuenta de Dirección para resolver esas tareas. Hacen falta delegaciones acotadas si se ofrecen esos puestos. |

La base actual permite avanzar con ajustes. El problema principal es la selección de herramientas, la coherencia entre clientes y la claridad de los recorridos, además de algunas capacidades por completar.

## 2. Los cuatro perfiles propuestos

**Guardería y maternal.** El trabajo principal es acompañar la jornada, registrar cuidados, conocer restricciones de salud, contactar a la familia y entregar al niño a una persona autorizada. El seguimiento del desarrollo puede existir como observaciones, sin introducir promedios, aprobación o reprobación. Si una sala no ofrece siesta o alimentación, esos registros no deben aparecer como pendientes obligatorios.

**Inicial: prekínder y kínder.** Conserva seguridad, comunicación y cuidados pertinentes, y añade experiencias de aprendizaje, planificación, evidencias y seguimiento cualitativo. Puede organizarse en áreas o campos de aprendizaje sin convertirlos en materias con notas numéricas. La familia es el interlocutor habitual. No recomiendo una cuenta infantil por defecto.

**Primaria.** Asistencia, cuaderno, actividades, tareas, materiales, evaluación y comunicación familiar deben tener prioridad. En los primeros cursos, la familia necesita más contexto para acompañar; en los superiores, puede habilitarse progresivamente el portal personal del alumno. Esa división es una recomendación de experiencia de usuario, no una nueva división normativa.

**Secundaria.** Las materias, docentes por materia, horarios, entregas, evaluaciones y seguimiento académico pasan al centro. El estudiante necesita un espacio personal útil, con resultados publicados y pendientes propios. La familia conserva su acompañamiento, permisos, avisos relevantes y pagos. Salud y emergencias siguen existiendo, aunque las rutinas de pañal o siesta no pertenezcan a su menú cotidiano.

Para Inicial escolarizada, el reglamento de evaluación consultado establece evaluación cualitativa y contempla instrumentos de seguimiento y comunicación a las familias. Eso respalda conservar un módulo pedagógico propio de Inicial. Las ponderaciones numéricas de 2026 deben mantenerse en su perfil académico correspondiente, sin convertir automáticamente observaciones de primera infancia en puntajes. Referencias: [Reglamento de evaluación, artículos 34–44](https://www.minedu.gob.bo/files/documentos-normativos/VER/2024/REGLAMENTO_EDUCACION_REGULAR.pdf) y [RM 0001/2026, artículo 29](https://www.minedu.gob.bo/files/documentos-normativos/resoluciones-ministeriales/1_RM_0001_EDUCACIN_REGULAR.pdf).

## 3. Matriz pedagógica y de jornada

“Principal” significa visible en el recorrido habitual del rol autorizado. “Opcional” significa habilitado cuando la institución ofrece ese servicio o necesita ese flujo. “Fuera del menú” significa que no debe ocupar la navegación cotidiana de ese perfil; no implica borrar historia ni retirar funciones de seguridad.

| Módulo o capacidad actual | Guardería / maternal | Prekínder / kínder / Inicial | Primaria | Secundaria |
|---|---|---|---|---|
| Inicio / resumen | Jornada, cuidados pendientes y alertas | Jornada, experiencias y alertas | Agenda, asistencia y tareas | Horario, entregas y seguimiento académico |
| Aulas y cursos | Salas y grupos | Aulas y paralelos de Inicial | Cursos y paralelos | Cursos, paralelos y materias |
| Estudiantes / Mis hijos / expediente | Niños y familias; ficha prioritaria | Niños y familias; ficha y desarrollo | Expediente escolar y familiar | Expediente escolar y seguimiento |
| Salud y emergencias | Principal para personal autorizado | Principal para personal autorizado | Siempre accesible cuando se necesita | Siempre accesible cuando se necesita |
| Asistencia de alumnos | Principal; lista diaria | Principal; lista diaria | Principal; lista diaria | Principal; diaria actual, por período solo si se desarrolla |
| Permisos de ausencia | Principal | Principal | Principal | Principal |
| Autorización y confirmación de recojo | Principal | Principal | Principal según política de salida | Disponible según política; contemplar salida autónoma como capacidad adicional si se ofrece |
| Alimentación, descanso e higiene | Principal según servicio | Activar solo las rutinas ofrecidas | Opcional: comedor, jornada extendida o apoyo individual | Fuera del menú habitual; mantener necesidades individuales pertinentes |
| Ánimo, observaciones e incidentes | Principal | Principal | Bienestar e incidentes cuando proceda | Bienestar e incidentes cuando proceda |
| Cuidados grupales | Principal cuando corresponda | Principal cuando corresponda | Opcional en servicios de cuidados | Fuera del menú habitual |
| Cuaderno digital | Resumen del día y observaciones | Experiencias, logros y comunicación familiar | Comunicación diaria y acompañamiento | Seguimiento y observaciones; evitar duplicar tareas |
| Materias | Fuera del menú habitual | Áreas/campos opcionales con lenguaje adecuado | Principal en la organización académica | Principal |
| Tareas y entregas | Fuera del menú habitual | Actividades familiares opcionales, sin exigir una cuenta infantil | Principal, con autonomía progresiva | Principal, con entrega personal del estudiante |
| Evaluaciones y libretas | Observaciones de desarrollo opcionales | Principal, cualitativo y con evidencias | Principal, según política vigente | Principal, por materia y período |
| Notas y recomendaciones | Integrar como observación | Integrar al seguimiento cualitativo | Integrar con evaluaciones, distinguiendo comentarios y resultados oficiales | Integrar con evaluaciones, distinguiendo comentarios y resultados oficiales |
| Calendario / agenda | Rutinas y eventos | Rutinas, experiencias y eventos | Eventos, tareas y evaluaciones | Horarios, tareas, evaluaciones y eventos |
| Generador de horarios | Opcional para personal; innecesario para una rutina simple | Opcional si hay especialistas o espacios compartidos | Útil, según organización | Principal para organización institucional |
| Materiales | Lista de implementos y reposición | Materiales de experiencias | Material escolar y de actividades | Material por materia o actividad |
| Galería | Útil, según autorización de imagen | Útil, según autorización de imagen | Opcional y privada | Opcional y privada |
| Tutoría y entrevistas | Entrevistas con la familia; tutoría solo si corresponde | Seguimiento y entrevistas con la familia | Principal para acompañamiento | Principal para coordinación entre materias |
| Actividades y salidas | Opcional; autorizaciones de adultos | Opcional; autorizaciones de adultos | Útil cuando se ofrecen | Útil cuando se ofrecen |
| Reinscripciones e historial por gestión | Principal administrativo | Principal administrativo | Principal administrativo | Principal administrativo |
| Promoción anual académica | Reasignación de sala; sin cálculo de aprobado/reprobado | Transición de nivel y continuidad; sin riesgo numérico | Flujo académico según política | Flujo académico y egreso de Secundaria |
| Reforzamiento numérico | Fuera del perfil | Apoyo pedagógico cualitativo en su lugar | Según política académica | Según política académica |
| Planificación / gestión educativa Bolivia | No imponer formularios escolares a toda guardería | Adaptación propia para Inicial escolarizada | Perfil formal correspondiente | Perfil formal correspondiente |
| Portal del estudiante | Desactivado por defecto | Desactivado por defecto | Opcional y progresivo | Recomendado; completar consulta de resultados publicados |

Los incidentes individuales no deberían registrarse como si todos los niños hubieran tenido el mismo incidente. El diseño actual de cuidados grupales ya excluye incidentes y conserva un registro por niño; recomiendo mantenerlo.

La familia actualmente consulta las tareas y el estudiante entrega su trabajo. Si se desea que una madre o un padre adjunte evidencias de una actividad de Inicial o primeros cursos, hay que diseñar ese permiso y señalar quién realizó la entrega. No es una capacidad que deba darse por existente hoy.

## 4. Administración y comunicación compartidas

| Módulo actual | Aplicación por etapa | Recomendación de acceso y presentación |
|---|---|---|
| Equipo docente | Todas | Dirección administra; docentes consultan su contexto. Delegar cuidados a auxiliares requiere permisos adicionales acotados. |
| Pagos y mensualidades | Todas las instituciones que cobran | Dirección administra y cada familiar autorizado consulta sus hijos. Configurar conceptos y reglas según servicio y marco aplicable. |
| Caja y cobros | Todas cuando existe cobranza | Entrada “Mis pagos” para familia; caja administrativa separada. La autorización limitada del docente para actividades no lo convierte en cajero de pensiones. |
| Facturas | Todas cuando la institución las emite | Integrar en el recorrido de pagos. La función actual gestiona emisión manual y adjuntos; no anunciar facturación fiscal automática. |
| Reportes institucionales | Todas | Dirección: inscripciones, ocupación, cobranza y operación. Adaptar los indicadores pedagógicos al nivel. |
| Asistencia del equipo / Mi entrada | Todas, opcional por institución | Trabajo del personal, separado de asistencia de niños. El docente marca su entrada; Dirección administra las reglas correspondientes. |
| Planilla y boletas del personal | Todas, opcional por institución | Dirección administra; trabajador ve lo propio. Descuentos sujetos a política autorizada, sin relacionarlos con la etapa del alumno. |
| Sedes | Todas las instituciones con varias sedes | Configurar niveles por sede. Pertenecer a una institución no debe ampliar automáticamente los datos que puede consultar una cuenta. |
| Inscripción, incorporación e importación CSV | Todas | Preparación administrativa, fuera del menú cotidiano familiar. Formularios adaptados por etapa y servicio. |
| Formularios institucionales | Todas | Recoger solo lo pertinente; salud y responsables siguen siendo importantes en todas las etapas. Las plantillas extraídas con IA requieren revisión humana. |
| Importación de calendario | Todas, opcional | Herramienta dentro de Agenda/configuración, sin otro acceso principal. |
| Comunicados | Todas | Dirección o docente autorizado publica para su alcance; familias reciben solo lo que les corresponde. |
| Mensajes | Todas | Conversaciones privadas con participantes y alcance autorizado. Distinguir mensaje interno sobre el alumno y mensaje dirigido a su familia. |
| Notificaciones y confirmaciones | Todas | Priorizar seguridad, permisos y acciones pendientes; avisos de pagos solo para adultos responsables. Lecturas personales. |
| Historial de consultas | Todas, para personal autorizado | Herramienta de seguimiento; abrir o descargar no demuestra comprensión ni consentimiento. |
| Auditoría | Todas, según rol | Registro administrativo; fuera del menú cotidiano familiar o infantil. |
| Configuración | Todas | Opciones específicas del rol y del centro, sin mostrar ajustes administrativos a estudiantes o familias. |
| Crédito MiCole | Todas las instituciones contratantes | Relación comercial MiCole–institución. Dirección consulta su cuenta; no confundir con las pensiones familiares. |
| Asistente de ayuda | Todas | Orientar sobre los módulos habilitados para el rol; mantener sus límites actuales de acceso y acción. |
| Landing y ficha pública de institución | Todas | Informar niveles y servicios reales. En guardería destacar jornada y cuidados; en Inicial desarrollo y vínculo familiar; en Primaria/Secundaria propuesta académica. No publicar información privada de alumnos. |

La existencia del módulo no significa que todas las instituciones deban activarlo. Por ejemplo, una sede sin comedor no necesita registrar alimentación y un centro sin cobro de pensiones no necesita exigir pasos financieros a las familias.

## 5. Funciones internas de MiCole

Estas funciones sirven a todas las etapas, pero pertenecen al propietario de la plataforma o al soporte autorizado, no al menú ordinario de una familia, docente o director:

- Instituciones y solicitudes de alta de instituciones.
- Facturación MiCole, activaciones y licencias de la plataforma.
- Métricas agregadas entre colegios.
- Solicitudes de demostración comercial.
- Pruebas de notificaciones.
- Soporte y revisión autorizada de roles.
- Auditoría de plataforma y configuración global, respetando el alcance de cada vista.

El crédito de una institución sí tiene una vista propia para su Dirección. Eso no implica darle acceso a la facturación o métricas de los demás colegios.

## 6. Reglas por rol que deben mantenerse en los cuatro perfiles

| Rol | Debe poder | Debe quedar restringido |
|---|---|---|
| Dirección | Configurar institución, equipo, aulas, evaluación, cobros y supervisar información autorizada. Consultar permisos, asistencia e historial. | No modificar la asistencia del alumno ni resolver el permiso en lugar del docente, según la regla acordada para MiCole. No confirmar lectura por una familia. |
| Docente asignado | Pasar lista, responder solicitudes de permiso y corregir asistencia con justificativo e historial. Registrar lo que corresponda a sus aulas/materias. | Sin acceso general a otras aulas, a calificar materias ajenas, a caja completa o documentos privados que su rol no necesita. |
| Tutora o jefe de aula | Consultar el seguimiento transversal y coordinar entrevistas dentro de su responsabilidad. | La tutoría no concede permiso para calificar otra materia ni editar los registros de otro docente. |
| Madre, padre o tutor vinculado | Consultar sus hijos; pedir permisos, autorizar recojos y responder personalmente. Ver pagos y avisos propios. | Sin datos de otras familias, sin modificar asistencia o notas y sin responder por otra cuenta. Un contacto de emergencia o autorizado de recojo no obtiene acceso automáticamente. |
| Estudiante | Consultar información propia y entregar trabajos cuando se habilite su portal. | Sin datos médicos familiares, cobros a adultos, autorizaciones de recojo o confirmaciones adultas. Sin edición de notas o asistencia. |
| Secretaría académica actual | Preparar horarios y publicarlos solo con la delegación prevista. | No es una secretaría general de admisiones, caja o salud. |
| Superadministración | Operación de plataforma, métricas agregadas y soporte autorizado. | No convertir las métricas generales en una exposición de nombres, diagnósticos o notas individuales de menores. |

Para futuras auxiliares de guardería, recepción y caja, recomiendo permisos específicos. Una auxiliar podría necesitar registrar alimentación sin recibir por ello permiso para calificar, cobrar o corregir asistencia.

## 7. Qué debería aparecer al abrir cada perfil

| Perfil y usuario | Inicio recomendado |
|---|---|
| Guardería: docente | Alertas del aula, permisos antes de pasar lista, cuidados por registrar y recojos del día. Acceso personal a “Mi entrada” si está habilitado. |
| Guardería: familia | Hijo seleccionado, salud/recojo pendientes, resumen de cuidados, mensajes y cuotas próximas. |
| Inicial: docente | Jornada del aula, permisos/asistencia, experiencias previstas, observaciones cualitativas y comunicación pendiente. |
| Inicial: familia | Avisos importantes, cómo estuvo su hijo, aprendizajes compartidos, agenda y pagos. |
| Primaria: docente | Aulas asignadas, permisos/asistencia, tareas y revisiones pendientes, evaluaciones y mensajes. |
| Primaria: familia | Avisos, asistencia, tareas para acompañar, materiales, resultados publicados y pagos. |
| Primaria: estudiante habilitado | Agenda y tareas propias, con lenguaje adecuado al curso. Sin convertirlo en responsable de trámites de adultos. |
| Secundaria: docente | Clases/materias asignadas, entregas a revisar, evaluaciones y estudiantes que requieren seguimiento. |
| Secundaria: estudiante | Horario, próximas entregas/evaluaciones, devoluciones del profesor y resultados publicados propios. |
| Secundaria: familia | Avisos, asistencia, evolución académica y seguimiento, entrevistas, permisos y pagos. |
| Dirección de cualquier etapa | Alertas de operación, solicitudes pendientes, asistencia consultable, inscripciones/cupos, cobranza y pendientes del equipo. Añadir indicadores pedagógicos adecuados al nivel. |

La navegación puede tener pocos accesos principales y agrupar herramientas relacionadas. Propuesta: “Aprendizajes” reúne evaluación, informes y observaciones; “Pagos” reúne cuotas, comprobantes, recibos y facturas; “Agenda” reúne calendario y horarios cuando ambos aplican; “Mi hijo” reúne ficha, salud, familia e historial. Estas agrupaciones no deben mezclar sus permisos ni alterar su significado.

**Alertas.** Salud y recojo deben preceder a recordatorios administrativos. Pagos próximos desde cinco días, vencidos o con saldo pendiente son importantes para los familiares responsables. No deben aparecer como deuda del niño en el portal infantil. Mantener la diferencia entre abrir, leer, aceptar un permiso, autorizar un recojo y registrar un pago. Cada acción tiene consecuencias distintas.

## 8. Métricas adecuadas por etapa

| Etapa | Semanal: seguimiento operativo | Mensual: evolución |
|---|---|---|
| Guardería / maternal | Asistencia, cobertura de registros según rutinas ofrecidas, incidentes pendientes de atención, recojos completados y avisos pendientes. | Altas/bajas, ocupación, asistencia y uso de cuidados/comunicación; cobranza donde aplique. |
| Inicial | Asistencia, experiencias compartidas, observaciones y entrevistas pendientes, avisos por atender. | Continuidad del seguimiento cualitativo, participación familiar, ocupación y operación. No inventar un promedio numérico de desarrollo. |
| Primaria | Asistencia, tareas pendientes, revisiones y seguimiento pedagógico. | Resultados completos publicados por área/materia y período; distinguir información incompleta y necesidad de apoyo. |
| Secundaria | Entregas, revisiones, asistencia y seguimiento por materia. | Distribución de resultados completos, materias con menor desempeño y alumnos que requieren intervención dentro del alcance autorizado. |
| Todas: superadministración | Nuevas instituciones, nuevas inscripciones y uso instrumentado. | Alumnos activos, nuevos registros, pagos verificados, saldos y adopción de módulos, filtrando sede/nivel cuando se añada esa segmentación. |

Las métricas actuales cuentan estudiantes con pagos verificados, no cuántas mamás o papás pagaron personalmente. La media de notas actual usa resultados completos de períodos que coinciden con el rango, no una media de evaluaciones realizadas esa semana. El riesgo numérico actual depende de la política Bolivia 2026 y resultados completos; no es una predicción del fracaso escolar. Las cualitativas y los pendientes no deben convertirse en cero.

El Ministerio también publica orientaciones de fortalecimiento diferenciadas para Inicial, Primaria y Secundaria. Recomiendo que el acompañamiento se adapte al nivel, sin llamar “riesgo de aplazo” a un seguimiento de desarrollo infantil. Referencia: [Estrategia Nacional de Fortalecimiento de Logro de Aprendizajes, octubre de 2026](https://www.minedu.gob.bo/index.php?Itemid=719&catid=107&id=8476&option=com_content&view=article).

## 9. Ajustes que priorizaría

**Primero: hacer coherente lo que ya existe.**

1. Definir un perfil educativo estructurado por aula, con grado y gestión, y usar una sola regla en web y Android. El texto visible del aula no debe determinar por sí solo la política académica o financiera.
2. Resolver navegación e inicio por hijo o aula seleccionado. Una familia con un niño de kínder y otro de Secundaria debe cambiar de contexto sin perder información ni mezclar alertas o permisos. El docente con aulas de varias etapas debe ver el perfil al entrar a cada aula.
3. Configurar módulos pertinentes por perfil y servicios ofrecidos. Mantener las comprobaciones del servidor y denegar operaciones inadecuadas, incluso si alguien usa una URL o APK anterior.
4. Preparar un recorrido cualitativo completo para Inicial: creación, observaciones, publicación e informe. El esquema no debe depender de que cada docente evite manualmente la opción numérica. Revisar el código único `initial` para representar los cursos de Inicial que se atiendan.
5. Aclarar y agrupar notas/recomendaciones, planilla de evaluación y libretas. Identificar qué es observación y qué es resultado publicado; evitar dos fuentes aparentes de una misma nota.
6. Completar la consulta segura de resultados publicados del estudiante para el perfil que la habilite, especialmente Secundaria. No habilitarle la planilla editable de un docente.
7. Revisar el tratamiento de Inicial escolarizada frente a guardería, incluyendo planificación, matrícula, acceso académico y reglas financieras. Hoy el bypass por pensiones para aulas escolares se aplica a Primaria/Secundaria; Inicial queda en el otro recorrido. La RM 0001/2026 incluye el nivel Inicial dentro de Educación Regular y el artículo 77 prohíbe exclusión curricular por mora en unidades educativas privadas. Esto merece una revisión específica antes de fijar el perfil comercial de Inicial escolarizada. [Fuente oficial](https://www.minedu.gob.bo/files/documentos-normativos/resoluciones-ministeriales/1_RM_0001_EDUCACIN_REGULAR.pdf).

**Después: completar según el piloto y el servicio vendido.**

- Inicial: plantillas de seguimiento del desarrollo y evidencias por áreas; revisión pedagógica de sus etiquetas. No ofrecer diagnósticos automáticos.
- Primeros cursos: entrega de evidencias por familiar, si el centro la necesita, identificando al adulto y sin suplantar al estudiante.
- Secundaria: asistencia por período o materia si forma parte de la oferta; la diaria actual no cubre ese contrato.
- Instituciones con más personal: delegaciones para auxiliar, recepción, caja y coordinación académica, en lugar de entregar permisos generales de Dirección.
- Métricas: filtros por etapa y cobertura real de registros. Evitar marcar como incumplimiento una rutina no ofrecida por la institución.
- Salud: administración de medicamentos o enfermería solo como flujo adicional con sus autorizaciones y registro; no darlo por cubierto por una nota de cuidados.

Estas ampliaciones son decisiones de alcance. No todas son requisitos para que una guardería use correctamente los módulos actuales.

## 10. Casos de aceptación para esta separación

Antes de publicar perfiles nuevos, verificar al menos estos recorridos en web y en una APK instalada:

1. Guardería con alimentación y siesta habilitadas; otra sala sin esos servicios. Solo aparecen sus rutinas pertinentes.
2. Inicial con informe cualitativo de principio a publicación; no aparece un promedio o riesgo numérico por defecto.
3. Institución mixta y una familia con hijos en Inicial y Secundaria: cambiar de hijo adapta menú, ficha, tareas y alertas correctamente.
4. Docente asignado a varias etapas: cambia el perfil del aula sin ampliar su acceso a otras aulas o materias.
5. Familia solicita permiso antes de la lista; docente resuelve; Dirección consulta sin modificar; permiso recibido después de confirmar exige corrección docente justificada.
6. Primaria: familia consulta una tarea y estudiante habilitado entrega; nadie envía trabajo en nombre de otro alumno. Si se añade entrega familiar, queda identificada como tal.
7. Secundaria: alumno consulta solo resultados propios publicados; no ve borradores, notas de compañeros, salud familiar ni cobros adultos.
8. Salud, recojo y pago pendiente: orden correcto, destinatario correcto y confirmación personal. Leer un aviso no aprueba un permiso ni acredita dinero.
9. Cambio de aula, reinscripción o cambio de perfil: conserva historial y publicaciones anteriores; no recalcula notas ni borra cuidados.
10. Una URL directa, un enlace de notificación o una APK anterior no permiten acciones fuera del perfil y del rol autorizado.
11. Familias distintas y sedes distintas: sin intercambio de documentos, carnets, conversaciones, pagos o datos académicos.
12. Métricas de Inicial excluyen promedios inventados; las académicas distinguen incompletos y las financieras distinguen comprobante enviado de pago verificado.

## 11. Fuentes del sistema revisadas

- Web: `src/WorkspaceApp.tsx`, `src/lib/kinder.ts`, `src/lib/workspaceFocus.ts`, `src/lib/bolivia.ts`, `src/lib/academicPlanning.ts`, `src/lib/billing.ts` y `src/lib/types.ts`.
- Flujos web: `Workspaces.tsx`, `RoleHome.tsx`, `GradeSheet.tsx`, `AcademicPlanning.tsx`, `StudentAccess.tsx`, `StudentAttendance.tsx`, `Academics.tsx`, `Pages.tsx`, `Forms.tsx` y `SchoolLife.tsx` dentro de `src/features/`.
- Android, repositorio `/Users/vincentariassaavedra/Desktop/micole-android/micole-android`: `src/lib/permissions.ts`, `src/lib/mobileNavigation.ts`, `src/lib/homeFocus.ts`, `src/ui/Shell.tsx` y los espacios por rol y aula.
- Migraciones de cuidados, planilla, política anual, operación Bolivia, asistencia docente y recordatorios familiares. En particular, `202610230002_bolivia_school_operations.sql`, `202610220008_annual_academics.sql` y las de asistencia del 29 de octubre.
- Documentación funcional de kínder, espacios de trabajo, asistencia, cobros, avisos, tutoría, métricas, formularios y sedes. Cuando documentos antiguos difieren de las migraciones posteriores, se prioriza la implementación posterior; este informe no reabre incidencias antiguas ya resueltas.

La decisión de producto recomendada es ofrecer cuatro configuraciones iniciales, con personalización por aula y servicio, permisos consistentes y una administración compartida. La mayor parte del trabajo debe aprovechar capacidades existentes y hacer que cada persona encuentre primero lo que necesita en su etapa.

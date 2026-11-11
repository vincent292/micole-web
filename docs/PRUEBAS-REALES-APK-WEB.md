# Pruebas reales entre APK y web

Preparado: 27 de octubre de 2026. Estado: lote funcional ejecutado en APK física y web publicada; matriz general aún pendiente de completar. Ver [informe y evidencias](../output/qa/2026-10-27-apk-web/INFORME.md) y [resultados por caso](../output/qa/2026-10-27-apk-web/resultados.json).

El objetivo es comprobar una jornada completa con usuarios independientes, servidor real y un teléfono físico. Cada caso empieza en una plataforma y se comprueba en la otra. Repetir en sentido inverso las operaciones disponibles en ambas.

## Preparación

1. Registrar la URL y el despliegue web utilizado, la compilación APK y el dispositivo. La APK instalada durante la revisión de experiencia es la compilación 13. Confirmar que la web utilizada contiene las funciones que se van a comprobar.
2. Usar una institución dedicada a QA, con datos ficticios y sin publicación en el directorio. El proyecto dispone del registro de instituciones y cuentas de pruebas persistentes. Comprobar su configuración y acceso antes de iniciar los casos.
3. Preparar Dirección, dos docentes de aulas distintas, Madre, Padre, otra familia y Estudiante. Para Secretaría, usar su acceso delegado a horarios. Cada participante entra con su propia cuenta.
4. Preparar dos hermanos vinculados a una familia y otro niño de una familia distinta; al menos dos aulas y una segunda institución de pruebas para comprobar el aislamiento.
5. Mantener una sesión web de Dirección o Docente y otra sesión independiente de familia. Usar perfiles de navegador separados para conservar cada identidad. En el teléfono, alternar las cuentas que se comprueban.
6. Confirmar el permiso de notificaciones y registrar el teléfono con la cuenta que recibirá el aviso. Poner nombre o código a cada caso para reconocer sus registros.

Las sesiones de **Pruebas propias** sirven para recorrer pantallas y preparar ejemplos. Algunas sesiones del propietario admiten excepciones de acceso; las pruebas de login, bloqueos, caducidad, destinatarios y permisos se ejecutan con cuentas normales independientes.

En Pinitos los cambios se guardan en la institución. Su configuración GPS puede usarse para un piloto presencial; los circuitos repetibles de datos se realizan en la institución dedicada a QA.

## Circuito principal: una jornada de kínder

| Caso | Acción y origen | Comprobación en el otro extremo |
| --- | --- | --- |
| J01 · Inicio | Cada cuenta entra en APK y web. | Rol, institución y niño correctos; pendientes y accesos pertinentes; el inicio conserva los avisos sin leer. |
| J02 · Entrada del personal | Docente verifica ubicación y marca entrada desde APK. | Dirección ve en la web la persona, fecha y hora registradas; el reintento conserva una única marcación. |
| J03 · Lista del aula | Docente confirma asistencia desde APK. | Familia consulta en web y APK el estado confirmado de su niño; otra familia conserva su propio expediente. |
| J04 · Cuidados individuales | Docente registra alimentación, descanso, higiene o ánimo desde APK. | Madre y Padre ven el resumen correcto en web; cambian de niño y consultan los datos correspondientes. |
| J05 · Cuidados del grupo | En la web, Docente selecciona niños, ajusta sus observaciones y guarda el lote. | Cada familia ve en APK únicamente los registros y observaciones de sus hijos; los no seleccionados mantienen sus registros previos. |
| J06 · Comunicado | Dirección publica un comunicado ficticio dirigido a las cuentas QA desde web. | Llega a la campana del destinatario; cuando corresponde, aparece en Android. Al abrirlo se muestra el contenido y el contexto correcto. |
| J07 · Lectura requerida | Familia abre y confirma expresamente un comunicado que requiere lectura. | Dirección consulta el estado de lectura. La confirmación de lectura y una autorización de recojo mantienen sus flujos separados. |
| J08 · Recojo | Madre o Padre solicita un recojo desde APK. Docente o Dirección lo revisa desde web. | Ambas plataformas muestran la misma decisión y los datos de la persona autorizada; la verificación de entrega sigue el procedimiento del módulo. |
| J09 · Cuaderno y archivos | Docente publica una novedad o un archivo ficticio. | La familia lo abre en el otro cliente; el archivo pertenece al niño o aula correspondiente y conserva su acceso privado. |
| J10 · Salida del personal | Docente marca salida desde APK. | Dirección consulta la misma jornada y sus horas en web. |

Para J02 y J10, preparar una persona ficticia con turno de prueba y descuentos desactivados. En el piloto de Pinitos, la configuración existente exige estar dentro de 150 m y una precisión GPS máxima de 50 m. Una entrada/salida ya registrada debe conservarse; para repetir el circuito, usar otra persona ficticia o una nueva jornada.

## Circuitos complementarios

| Caso | Escenario | Resultado esperado |
| --- | --- | --- |
| C01 · Inscripción | Dirección inscribe desde web; familia revisa y completa su ficha desde APK. | Aula, vínculos, contactos y datos de cuidado coinciden en ambos clientes. |
| C02 · Tarea completa | Docente publica en web; Estudiante entrega desde APK; Docente revisa en web. | La respuesta, archivos, comentarios y estado de entrega aparecen en el contexto autorizado. La familia puede consultar lo permitido para su rol. |
| C03 · Agenda | Publicar una actividad para un aula y otra para la institución. | La familia ve sus actividades; al cambiar de aula o institución se actualiza el contexto. |
| C04 · Horarios | Secretaría guarda un borrador y Dirección revisa y publica desde web. | El horario publicado se consulta en APK; Secretaría conserva sus permisos de planificación y publicación asignados. |
| C05 · Mensualidad ficticia | Registrar un abono parcial autorizado en la institución QA. | Web y APK muestran el mismo saldo y recibo; reintentar una respuesta perdida conserva un único cobro. |
| C06 · Aislamiento | Abrir rutas de un alumno, aula o institución ajenos con una cuenta QA. | El servidor rechaza el acceso y la interfaz conserva el ámbito de la cuenta. |
| C07 · Acceso limitado | Probar ficha incompleta, inscripción inactiva y cuotas exigibles con cuentas normales. | Se conservan las consultas permitidas y se aplican los bloqueos correspondientes en APK y web. |
| C08 · Cambios simultáneos | Mantener APK y web abiertas y modificar desde una de ellas. | La otra recibe la actualización; un formulario en edición conserva sus datos y avisa o resuelve los cambios según el flujo del módulo. |

El entorno de pruebas persistentes tiene excepciones para el crédito inicial de MiCole. Ese bloqueo y la lógica bancaria también se comprueban con los scripts técnicos transaccionales. El cobro bancario completo requiere su entorno de pruebas y credenciales correspondientes; registrar un recibo o simular una conciliación en SQL no demuestra que el banco haya procesado dinero.

## Notificaciones en el teléfono físico

Comprobar primero el laboratorio privado **Superadmin → Pruebas de notificaciones**, enviando únicamente al dispositivo propio registrado. Después comprobar J06 con cuentas QA destinatarias independientes.

- App abierta, en segundo plano, cerrada y teléfono bloqueado.
- Permiso concedido y denegado; canal silenciado y modo No molestar.
- Avisos de salud, recojo, asistencia, mensaje y tarea; revisar presentación y sonido según su canal.
- Pulsar el aviso con sesión activa y tras volver a iniciar sesión.
- Aviso dirigido a un hermano distinto del seleccionado; comprobar el niño que se abre.
- Leer desde web y comprobar el estado en APK; confirmar lectura cuando corresponda.
- Anotar hora de creación, aceptación del servicio de envío, aparición en Android y apertura. La aceptación del envío y la visualización en el dispositivo se registran como comprobaciones distintas.

## Fallos que conviene provocar

| Situación | Qué comprobar |
| --- | --- |
| Cortar internet antes de guardar | Explicación clara, ausencia de confirmación falsa y posibilidad de recuperar el trabajo cuando el flujo lo admite. |
| Cortar internet después del envío | Consultar el servidor y reintentar sin duplicar cuidados, entregas, cobros o marcaciones. |
| Pulsar Guardar dos veces | Un solo resultado persistido. |
| Cambiar de rol, hijo o institución | Datos y acciones del contexto nuevo; sin mezcla con la pantalla anterior. |
| Abrir APK y web a la vez | Estados consistentes tras actualización y después de recargar. |
| Caducar la sesión | Recuperación del acceso y tratamiento explícito de operaciones pendientes. |
| Denegar ubicación o usar ubicación aproximada | Instrucción comprensible para resolverlo; marcación sujeta a la validación de precisión y rango. |
| Estar fuera del radio permitido | Rechazo de la marcación y explicación de la causa. |
| Subir un archivo inválido o grande | Error claro; el resto del formulario conserva lo que su flujo permite recuperar. |
| Cerrar y volver a abrir la app | Los registros confirmados permanecen; los borradores se comportan según su alcance documentado. |

Los pedidos pendientes de cuidados por grupo de la web se conservan en memoria durante la sesión. No son una cola de trabajo sin conexión y no sobreviven a una recarga completa.

## Evidencia y aprobación

Por cada caso, registrar:

| Campo | Contenido |
| --- | --- |
| Caso y estado | ID; Pendiente, Aprobado, Falló o Bloqueado por preparación. |
| Contexto | Fecha, versión web, compilación APK, rol, institución, aula y código del niño ficticio. |
| Pasos | Acción exacta en APK o web y resultado esperado en el otro cliente. |
| Resultado | Texto observado, tiempo de propagación, necesidad de recargar y resultado después de reabrir. |
| Evidencia | Captura o vídeo e identificador del registro de prueba. |
| Incidencia | Cómo reproducirla y su efecto sobre la operación. |

Un caso se aprueba cuando el registro del servidor, la web y la APK coinciden, el rol conserva su ámbito y los reintentos mantienen un solo resultado. Los problemas de acceso indebido, pérdida de registros confirmados, cobros duplicados o recojos mal autorizados bloquean la aprobación del circuito afectado.

## Ejecución propuesta

1. **Preparación y acceso:** verificar versiones, institución QA, usuarios, vínculos y teléfono destinatario.
2. **Jornada de kínder:** ejecutar J01–J10, comprobando cada cambio en el otro cliente.
3. **Permisos y fallos:** ejecutar C06–C08 y los cortes de red sobre los flujos críticos.
4. **Académico y administrativo:** completar tareas, horarios y cobros ficticios.
5. **Piloto operativo:** repetir una jornada con las personas responsables de Dirección, docencia y familias; recoger dónde necesitan ayuda o repiten pasos.

La batería automática acompaña estos recorridos. El repositorio web incluye pruebas de navegador y scripts de Supabase para operaciones, aprendizaje, instituciones, cobros, reportes y jornada de kínder; cada script debe revisarse por sus efectos antes de ejecutarlo. Las pruebas de navegador que interceptan la API verifican comportamiento controlado; el simulacro con cuentas y servidor reales verifica el circuito integrado.

Referencias del proyecto: [Pruebas del propietario](OWNER_TESTING.md), [Laboratorio de notificaciones](PRUEBAS-NOTIFICACIONES.md) y [Jornada de kínder](KINDER.md).


## Avance verificado — 28 de octubre de 2026

La web pública incluye cuidados por aula y la APK 16 está instalada. Se verificaron 65 controles de aislamiento con 13 cuentas normales, más 12 controles de privacidad infantil. La prueba física con APK cerrada y pantalla bloqueada abrió el comunicado correcto y, en otra prueba, el cuaderno del hijo correcto. El corte de red conserva el formulario y el reintento guarda un registro en APK y web.

La ampliación también cubre inscripción con plan, ficha familiar desde APK, agenda por aula/sede, cuaderno, archivo privado, propuesta de materiales y borrador de Secretaría con publicación exclusiva de Dirección. Se completaron las vistas web de familia y estudiante en Chrome Android y se restauraron las preferencias temporales del teléfono. Evidencia y alcance por caso: [informe ampliado](../output/qa/2026-10-27-completa/INFORME.md). La matriz no implica un piloto presencial ni una entrega real de un niño.

## Avisos por autor y destinatario — 28 de octubre de 2026

Se llenaron los formularios de Dirección web y docente APK. Se verificaron los destinatarios con 13 cuentas normales y la recepción/apertura física en mamá, papá y estudiante. La revisión detectó y corrigió la lectura de la campana infantil, la acción web de marcar leído y el orden de avisos recientes. Pasaron 504 pruebas y 17 regresiones locales de navegador, incluida la recuperación de una carga fallida; la web publicada se comprobó además en Chrome Android. Matriz, capturas, publicación y alcance: [informe de avisos](../output/qa/2026-10-28-avisos/INFORME.md).

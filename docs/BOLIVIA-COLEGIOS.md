# Bolivia: operación de primaria y secundaria

Esta versión aplica a aulas con grado oficial `primary1..6` o `secondary1..6`. Si aún no se asignó grado, se reconoce el nivel explícito Primaria/Secundaria de una sede que ofrezca esos niveles. El nombre libre del aula nunca decide su régimen. Una política `initial` excluye el aula de estos cambios. Kínder y guardería mantienen sus configuraciones actuales, incluso en sedes mixtas.

## Comparación y cambios

| Función          | Antes                                                    | Ahora en primaria/secundaria                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mora familiar    | Bloqueaba acceso académico                               | No bloquea a la familia o estudiante verificado con inscripción activa y perfil completo. Se conservan deudas, recibos y permisos. La habilitación inicial de la institución sigue separada.                               |
| Plan familiar    | Hasta 36 meses, matrícula, merienda y licencia separadas | Nuevos planes de hasta diez pensiones dentro de la gestión; no se suman matrícula, merienda ni licencia MiCole. La institución sigue pagando su licencia según sus tarifas y crédito.                                      |
| Corte automático | Seguía emitiendo después del plan                        | Para colegios se requieren planes explícitos; no se prolongan indefinidamente. No se reescriben importes históricos.                                                                                                       |
| Materiales       | La falta de lista anual podía impedir inscribir          | La lista sigue disponible pero no impide inscribir primaria/secundaria.                                                                                                                                                    |
| Horario          | Periodos arbitrarios                                     | El servidor exige seis periodos diarios de 40 minutos en diurno o 35 en nocturno. Las clases largas se agrupan en bloques. Publicaciones históricas se conservan.                                                          |
| Planificación    | Documentos sueltos                                       | POA y PDC por sede y gestión, borrador → envío → revisión/aprobación o devolución. Los aprobados son inmutables; se prepara una nueva versión para cambios.                                                                |
| Reforzamiento    | Nota adicional autorizada                                | Se añade plan de apoyo, evidencia, adaptaciones y acta de Comisión. Al confirmar el perfil revisado de la gestión, estos respaldos aprobados se exigen para autorizar nuevas notas de reforzamiento. No se regalan puntos. |
| Reportes         | Libretas internas                                        | Centralizador CSV de publicaciones vigentes, identificado como informe interno y sin inventar notas faltantes. No equivale a una libreta oficial del SIE.                                                                  |

El calendario se prepara con días de lunes a viernes y exclusiones; Dirección revisa las fechas individualmente. Solo puede marcar el perfil como revisado al completar datos de la unidad, respaldo y 200 fechas efectivas dentro de la gestión. La selección no publica 200 eventos ni reemplaza el calendario regional autorizado.

Los documentos y perfiles usan revisión concurrente, auditoría y señales Realtime por sede. Un evento Realtime no desmonta formularios abiertos. Solo Dirección configura perfiles y revisa documentos. El docente prepara PDC/apoyo para sus aulas y materias; no obtiene acceso al centralizador completo de otras materias ni a finanzas. Las familias no leen actas internas ni documentos de otros estudiantes.

## Base revisada

- [RM 0001/2026 Educación Regular](https://www.minedu.gob.bo/files/documentos-normativos/resoluciones-ministeriales/1_RM_0001_EDUCACIN_REGULAR.pdf): planificación, días efectivos, cuaderno pedagógico, periodos, inscripción y artículos 76–77 sobre pensiones y no exclusión por mora.
- [Reglamento de evaluación, RM 0190/2024](https://www.minedu.gob.bo/files/documentos-normativos/VER/2024/REGLAMENTO_EDUCACION_REGULAR.pdf): Comisión Técnico Pedagógica, seguimiento, refuerzo y libreta oficial; se aplica junto con las modificaciones de la gestión 2026.
- [Ponderación 2026](https://www.minedu.gob.bo/index.php?Itemid=854&catid=182&id=8249&option=com_content&view=article): Ser 10, Saber 45, Hacer 40, Autoevaluación 5, conservada en el sistema.
- [Circular 11/2026](https://www.minedu.gob.bo/index.php?Itemid=933&catid=224&id=8355&option=com_content&view=article): actividades con finalidad pedagógica en el POA.
- [Estrategia de fortalecimiento, octubre 2026](https://www.minedu.gob.bo/index.php?Itemid=719&catid=107&id=8476&option=com_content&view=article): referencia de apoyo pedagógico; no convierte las reglas institucionales de reforzamiento en una fórmula ministerial.

El perfil requiere una referencia de la gestión. Las referencias de 2026 no se presentan automáticamente como normativa de 2027. No se ofrece certificación de cumplimiento integral ni presentación ministerial automática.

## Pendiente de documentación oficial

API/autorización o formato de intercambio del SIE; catálogo de códigos y áreas oficiales; RUDE oficial completo y firmas; reglas de redondeo y recuperación validadas; modelos actuales de libreta/centralizador; validación distrital de excepciones. No se emulan endpoints privados ni se envían datos de alumnos al Ministerio sin autorización.

La ficha de salud, permisos, recogidas, asistencia, cualitativas y planes actuales de inicial/guardería no se migran ni se convierten a evaluación numérica.

Migración: `202610230002_bolivia_school_operations.sql`. Aplicación mediante `npm run supabase:migrate:academic-planning` después de revisar las pruebas. Android se actualiza en código fuente; no se genera ni instala APK.

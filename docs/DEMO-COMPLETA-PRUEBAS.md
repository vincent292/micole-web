# MiCole: recorrido con datos de demostración

Datos agregados el 5 de noviembre de 2026 en **MiCole · Institución de pruebas**. Los registros nuevos llevan «Prueba» o «Demostración» para identificarlos. Se conserva el contenido de QA que ya existía.

## Entrada con la cuenta del propietario

1. Abrir **Pruebas y soporte → Probar roles**.
2. Seleccionar **MiCole · Institución de pruebas**.
3. Elegir Dirección, Docente, Madre, Padre o Estudiante.
4. Para Docente, seleccionar una persona como **Valeria Docente Prueba**. Para los roles familiares o de estudiante, seleccionar un niño como **Lucía Rojas Prueba** o **Victoria Rojas Prueba**.
5. Pulsar **Entrar en modo de pruebas**.

Los cambios se conservan en esta institución. Para mostrar dos dispositivos con cuentas independientes también pueden usarse las [cuentas de entrenamiento existentes](CUENTAS-DE-PRUEBA-PARA-DEMO.md), con sus credenciales privadas habituales.

## Contenido nuevo

| Contenido | Preparación |
| --- | --- |
| Alumnos | 24 alumnos ficticios nuevos, con familias, ficha completa y planes de tres meses. |
| Aulas actuales | Inicial 3 años, Inicial 4 años y Primero B, cada una con ocho alumnos. |
| Docentes | Cuatro docentes ficticios nuevos, asignados a sus aulas y materias. El docente QA existente también tiene asignación para comprobar el login normal. |
| Asistencia escolar | 312 marcas en 39 listas confirmadas, con presentes, faltas y tardanzas. |
| Cuidados | 192 registros de alimentación, descanso, higiene y ánimo. |
| Evaluación | 128 calificaciones, con etiquetas cualitativas y columnas numéricas. |
| Libretas | Ocho libretas ficticias publicadas de la gestión histórica 2025. |
| Cuotas y recibos | 96 cuotas de ejemplo y 24 recibos ficticios, con pagos completos, abonos y saldos pendientes. |
| Tareas | Seis tareas, entre publicadas y borradores, con entregas pendientes y revisadas. |
| Comunicación | Cuaderno y recomendaciones por alumno, un comunicado y actividades en agenda. |
| Personal | 48 registros de asistencia laboral y cuatro boletas de octubre. |

## Recorrido de Dirección

- **Aulas:** abrir las que terminan en «Demostración» y consultar sus alumnos y docentes.
- **Estudiantes:** buscar «Prueba». La inscripción y el expediente muestran datos ficticios y su plan de pagos.
- **Asistencia de alumnos:** consultar el 3, 4 o 5 de noviembre de 2026. Hay además historial del 19 al 30 de octubre, en días de clase. Dirección consulta y el docente asignado marca o corrige.
- **Practicar pasar lista:** entrar como docente en una de las aulas nuevas y seleccionar **16 de octubre de 2026**, una fecha anterior a las listas preparadas. Las listas ya confirmadas sirven para consulta y correcciones justificadas.
- **Evaluación y libretas → Planilla:** seleccionar una de las aulas nuevas y el periodo abierto de 2026. En inicial se muestran valoraciones cualitativas y numéricas. Primero B tiene Lenguaje y Matemáticas con sus dimensiones de evaluación.
- **Libretas publicadas:** seleccionar la gestión **2025**, el periodo **Cierre de gestión · Demostración** y el aula **Inicial histórico 2025 · Demostración**. Las ocho libretas corresponden a los alumnos que ahora están en Primero B.
- **Caja y cobros:** revisar cuotas de octubre, noviembre y diciembre de 2026. Hay ejemplos pagados, con abono y con saldo pendiente. Las referencias empiezan con `DEMO-FICTICIO`.
- **Reportes:** usar el rango **1 de octubre a 31 de diciembre de 2026** para comparar cuotas, cobros, saldos y estudiantes. Los recibos reflejan la fecha real de preparación de estos ejemplos, el 5 de noviembre; las cuotas mantienen sus meses respectivos.
- **Asistencia del equipo:** consultar octubre y noviembre de 2026. Las marcaciones se registraron como preparación manual de ejemplos, no como verificación física de GPS.
- **Boletas de pago:** seleccionar **octubre de 2026**. Hay dos marcadas como pagadas ficticiamente, una aprobada y una en borrador. El bono y los sueldos son ejemplos.

## Recorrido de docente y familia

Como docente de prueba, abrir su aula y mostrar la asistencia, los cuidados, el cuaderno y las notas. En el teléfono, seleccionar una de las aulas actuales; la histórica sirve para revisar la libreta anterior.

Como Madre o Padre, seleccionar al niño y revisar **Así fue su día**, asistencia, cuaderno, recomendaciones, agenda y cuotas. Las cuentas normales de familia QA existentes están vinculadas a algunos alumnos nuevos y solo ven sus propios hijos. El modo de pruebas del propietario permite elegir cualquiera de los niños de esta institución.

Como Estudiante en pruebas del propietario, seleccionar un alumno de Primero B y abrir sus tareas. Las tareas publicadas tienen respuestas ficticias en estados pendiente de revisión y revisado.

## Alcance

Los ejemplos se cargaron exclusivamente en la institución persistente de pruebas, que permanece fuera del directorio público y conserva el bloqueo del banco de producción. No se crearon cuentas Auth nuevas, no se enviaron correos, no se realizaron transferencias ni cobros reales. Las entregas push generadas durante la preparación se descartaron antes de confirmar la transacción; las notificaciones internas de ejemplo se conservaron.

Las familias QA vinculadas a los alumnos nuevos tienen sus cuotas de ejemplo cubiertas, para que esos registros no produzcan nuevos recordatorios de deuda en sus teléfonos. Los ejemplos con saldo pendiente usan contactos ficticios sin cuentas Auth.

## Preparación y evidencia

La carga se validó primero en una transacción revertida y luego se guardó. El generador está en `scripts/seed-showcase-test-workspace.mjs`; sin `--apply` revierte la operación. Está restringido al identificador del sandbox y comprueba sus registros privados de pruebas.

Los identificadores, resultados y capturas se conservan en `output/qa/2026-11-05-demo-completa/`. La comprobación de permisos y pantallas usa `scripts/verify-showcase-test-workspace.mjs`, con sesiones normales de QA y sin guardar tokens en los resultados.

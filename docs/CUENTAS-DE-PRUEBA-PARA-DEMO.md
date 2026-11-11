# Cuentas de prueba para demostrar MiCole

Son las cuentas de test utilizadas en las comprobaciones de web, APK y permisos del servidor. Sus instituciones están marcadas como pruebas y sus niños, documentos y pagos son ficticios.

| Rol | Correo | Contexto de demostración |
| --- | --- | --- |
| Dirección | direccion@pruebas.micole.test | Sede QA principal |
| Docente | docente@pruebas.micole.test | Primero A y Kínder A |
| Familia | familia@pruebas.micole.test | Mamá de Lucía, Mateo y Emma |
| Estudiante | estudiante@pruebas.micole.test | Lucía Prueba |
| Familia | padre@pruebas.micole.test | Papá de Lucía, Mateo y Emma |
| Familia | familiaotra@pruebas.micole.test | Familia de Sofia y Bruno |
| Docente | docenteotro@pruebas.micole.test | Docente de Kínder B |
| Estudiante | alumnootro@pruebas.micole.test | Mateo QA |
| Dirección | direccionotra@pruebas.micole.test | Dirección de otra institución QA |
| Familia | familiaexterna@pruebas.micole.test | Familia de otra institución QA |
| Docente | docenteexterno@pruebas.micole.test | Docente de otra institución QA |
| Estudiante | alumnoexterno@pruebas.micole.test | Alumno de otra institución QA |
| Secretaría académica | secretaria@pruebas.micole.test | Planificación delegada en la sede QA principal |

## Recorrido recomendado para Dirección

1. Abrir la web con Dirección QA y la APK con Mamá QA.
2. Publicar un comunicado ficticio para Lucía o Mateo. Activar la confirmación «He leído» para demostrar un aviso importante al entrar.
3. Entrar como mamá; revisar el aviso y confirmar personalmente. Mostrar en Dirección la lectura y su hora.
4. Entrar como papá: su confirmación debe continuar pendiente hasta que la realice él.
5. Comparar con familiaotra y una cuenta de otra institución: no deben ver el aviso individual.
6. Usar docente y docenteotro para mostrar que cada uno trabaja en sus aulas asignadas.
7. Mostrar un pago ficticio desde cinco días antes: la lectura no registra un pago; un abono cambia el saldo y saldar retira el aviso. Los casos ejecutados quedaron en `output/qa/2026-10-29-avisos-importantes/`.

Las contraseñas no se incluyen en documentos compartibles. Usa las credenciales privadas ya configuradas para estas cuentas. Los correos .test sirven para estas cuentas de entrenamiento; no se usan para recibir correo real.

No entregar estas cuentas compartidas como cuentas personales de un director o una familia. Para el piloto de una institución, invitar a cada participante con su propio correo y rol.

Evidencias: `output/qa/2026-10-29-asistencia/INFORME.md` y `output/qa/2026-10-28-avisos/INFORME.md`.

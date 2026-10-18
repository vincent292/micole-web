# Pruebas del propietario

En **Pruebas y soporte → Pruebas con mi institución**, el propietario selecciona un colegio y pulsa **Usar esta institución para pruebas**. Después elige Dirección, Docente, Madre, Padre o Estudiante y el registro que quiere probar. No exige ticket, invitación aceptada ni confirmación de los correos ficticios.

Solo la cuenta propietaria confirmada, validada con `platform_admins` y la lista privada de correos autorizados, puede habilitar o iniciar estas pruebas. No se crean usuarios Auth ni se cambian los correos, membresías o vínculos familiares de los registros. Las instituciones reales conservan el acceso de soporte con motivo y duración de 30 minutos.

Cada prueba dura hasta dos horas. La barra **Pruebas** permite cambiar de rol o volver a superadmin. Los cambios se guardan en la institución marcada. Los permisos son los del rol elegido: docentes limitados a sus aulas y materias; familias al niño seleccionado y sin edición académica; estudiantes a su portal y sus entregas. Se mantienen las condiciones de ficha, pagos y baja para probar también esos bloqueos. Registrar primero aulas, docentes y niños desde Dirección permite habilitar los otros recorridos.

Desactivar pruebas revoca sus sesiones. También se invalidan al caducar o al desactivar el docente. Las entradas y salidas se auditan y la autoría visible distingue las pruebas del soporte. El servidor no permite usar una sesión de otra cuenta ni apuntar a registros de otra institución.

Migración: `202610170005_owner_test_workspace.sql`. Validación: `tests/owner-test-workspace.test.ts`, `tests/owner-testing-live.e2e.spec.ts` y el caso de pruebas del propietario en Android. `scripts/smoke-testing.mjs` ejecuta un recorrido en Supabase dentro de una transacción con rollback; no envía avisos externos ni persiste los registros de comprobación.

Verificado y publicado el 17 de octubre de 2026 en `https://micole-web.vercel.app` (despliegue `dpl_78xXc7bJPZd9GvECtV94ieMNheDJ`). La migración está aplicada. Los 13 controles del recorrido transaccional pasaron y no dejaron registros temporales.

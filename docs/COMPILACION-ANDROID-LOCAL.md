# Actualización responsiva del 3 de noviembre: APK 22

La entrega actual es `output/apk/micole-asistencia-comoda-v22.apk`, compilada y firmada localmente con la lista diaria amplia, nombres completos y hoja semanal opcional. La copia aislada fija `versionCode=22`; se firma desde la raíz web con `node scripts/sign-local-attendance-apk.mjs 22`. Certificado original comprobado, sin compilaciones en la nube. Instalación pendiente por falta de un Android conectado. Huella y evidencias: `output/qa/2026-11-03-asistencia-responsive/apk22.json`.

Las entregas anteriores se conservan debajo como historial.

# Actualización del 3 de noviembre: APK 21

La entrega actual es `output/apk/micole-asistencia-semanal-v21.apk`, compilada localmente con la hoja semanal y calendario. Está firmada con el certificado original, sin compilaciones en la nube. No se instaló porque no había un Android conectado. Informe y huella: `output/qa/2026-11-03-hoja-semanal/apk21.json`.

La copia aislada `tmp/android-attendance-build/app.json` fija ahora `versionCode=21`. Para firmar esta entrega desde la raíz web: `node scripts/sign-local-attendance-apk.mjs 21`. La receta histórica siguiente corresponde a la APK 19 y se conserva como referencia; no usar su número de versión para una entrega nueva.

# Compilación local de Android

Actualización del 3 de noviembre de 2026: **APK 20 de identidad personal**, compilada y firmada localmente. Paquete: `output/apk/micole-identidad-personal-v20.apk`. Conserva el certificado de las versiones anteriores. La instalación en Android está pendiente porque solo se conectó el iPhone durante esta entrega. Registro: `output/qa/2026-11-03-identidad/apk20.json`.

La pantalla docente muestra «Mi asistencia» y «Mis boletas de pago», sin selector de otra persona. Los datos se limitan a los identificadores docentes de la cuenta activa. El mes filtra el historial; las entradas y salidas usan la hora del servidor. Las mismas fuentes se usan en iOS.

La copia aislada tiene ahora `android.versionCode=20`. Para firmarla desde la raíz de este repositorio se usa `node scripts/sign-local-attendance-apk.mjs 20`. El script verifica el certificado y genera la huella del paquete. No se consumieron compilaciones de Expo Cloud.

## Entrega anterior: APK 19 de métricas

La APK 19 se generó en este Mac, se firmó con el certificado existente y se instaló con `adb install -r`. No se ejecutó una compilación en Expo Cloud. Descargar la firma existente fue autorizado expresamente por el propietario.

Fuentes Android: `/Users/vincentariassaavedra/Desktop/micole-android/micole-android`. La copia aislada y el proyecto nativo generado están en `tmp/android-attendance-build/` de este repositorio. No se agregó un directorio nativo al proyecto original.

Para reproducir esta compilación con la copia ya preparada, desde `tmp/android-attendance-build/android/`:

```sh
JAVA_HOME=/opt/homebrew/Cellar/openjdk@17/17.0.20.1/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/Users/vincentariassaavedra/Library/Android/sdk \
./gradlew :app:assembleRelease --no-daemon --max-workers=4
```

Desde la raíz de este repositorio, `node scripts/sign-local-attendance-apk.mjs 19` firma la APK 19 en `output/apk/micole-metricas-superadmin-v19.apk`, verifica el certificado contra la APK 16, comprueba alineación y excluye archivos de credenciales del paquete. No instalar el APK intermedio de Gradle: su firma de plantilla no corresponde a la app existente.

La firma privada permanece en `~/.config/micole/android-signing/`, fuera de los proyectos, con directorio 0700 y archivos 0600. El script no imprime contraseñas ni las coloca en el texto de comandos. No volver a descargar o regenerar una clave para una actualización normal.

Esta receta y el script de firma fijan `versionCode=19`. Para otra entrega hay que incrementar y validar la versión. El proyecto EAS original conserva su configuración previa de versiones remotas; comprobar esa configuración antes de volver a compilar por EAS para evitar publicar un número inferior al instalado.

Resultado, certificado público y huella del paquete: `output/qa/2026-10-29-metricas-superadmin/apk19.json`. Pruebas y límites: `output/qa/2026-10-29-metricas-superadmin/INFORME.md`.

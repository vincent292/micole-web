# MiCole: compilación local e instalación en iPhone

## Kárdex instalado el 12 de noviembre de 2026 · compilación 9

MiCole 1.0.0 (9), con kárdex por estudiante, filtros, PDF y asistencia optimizada por lote, está firmada e instalada en el iPhone del propietario. Se verificaron la versión instalada y la apertura. Paquete: `output/ios/2026-11-12/MiCole-kardex-v9.ipa`. La firma personal conserva su vencimiento del 16 de noviembre de 2026 a las 15:00:48 UTC. Evidencias: `output/qa/2026-11-12-kardex/`. Ver `docs/KARDEX-Y-ASISTENCIA-POR-LOTE.md`.

## Antecedente: organización académica del 12 de noviembre de 2026

MiCole 1.0.0 (8), con la organización académica y Secretaría, está firmada e instalada en el iPhone del propietario. `devicectl` confirmó `bundleVersion=8` y el mismo identificador. Después de que el propietario desbloqueara el iPhone, se abrió la aplicación y se confirmó que el mismo proceso permanecía activo. La compilación instalada se verificó como 8. No se realizó una nueva revisión funcional completa de pantallas en el teléfono.

Paquete: `output/ios/2026-11-12/MiCole-organizacion-academica-v8.ipa`. Firma verificada, perfil válido para este iPhone hasta el 16 de noviembre de 2026 a las 15:00:48 UTC. Comparte las fuentes verificadas con Android. Detalles: `docs/ORGANIZACION-ACADEMICA-MOVIL.md`. Evidencias: `output/qa/2026-11-12-native-academic-workspaces/`.

## Antecedente: actualización del 9 de noviembre de 2026

**MiCole 1.0.0 (7), con Mica · MiCole IA, está firmada, instalada y abierta en el iPhone 17 Pro Max del propietario.** Se comprobaron la versión instalada y el proceso activo mediante `devicectl`. Conserva el identificador y actualiza la aplicación existente sin desinstalarla.

Incluye Mica en los paneles, permisos por rol, pausa validada en servidor y confirmación de acciones, además de la tarifa local de respaldo de Bs 25. La compilación nativa, TypeScript, lint, 134 pruebas unitarias y dos escenarios de interfaz móvil pasaron. Las fuentes coinciden con las verificadas en la preparación. No se realizó una nueva revisión visual física del chat en esta instalación.

Paquete firmado: `output/ios/2026-11-09/MiCole-Mica-v7.ipa`. Evidencias: `output/qa/2026-11-09-ios-mica/ios7-status.json`, `install.json`, `launch.json`, `installed-app.json`, `processes.json` y `signing.json`. Las fuentes compartidas y el parche están en `output/ios/2026-11-09/source/` y `mica-mobile.patch`; el proyecto móvil de origen permanece intacto.

Se renovó el perfil después de que el propietario iniciara sesión en Apple desde Xcode. Es válido hasta el **16 de noviembre de 2026 a las 11:00:48, hora de Bolivia**. No se exportaron claves ni se usaron compilaciones en la nube. La copia anterior sin firma se conserva únicamente como artefacto de preparación.

## Antecedentes

Estado al 3 de noviembre de 2026: **MiCole 1.0.0, compilación iOS 6, instalada y ejecutándose en el iPhone 17 Pro Max del propietario**. Incluye la lista diaria amplia para celular y la hoja semanal opcional. La interfaz compartida aprobó 16 escenarios en React Native Web, incluidos seis tamaños y el inicio por roles. El visor físico del ordenador sigue fallando: se comprobaron firma, instalación, versión y proceso, sin afirmar una nueva revisión visual física de esta compilación. Evidencias en `output/qa/2026-11-03-asistencia-responsive/INFORME.md`.

La compilación 4 anterior corrigió la identidad personal; el propietario confirmó «Mi asistencia» sin selector de docente.

La compilación 3 anterior corrigió los márgenes seguros, textos y formularios. Su revisión visual y matriz de 36 casos se conservan en `output/qa/2026-10-30-ios-responsive/INFORME.md`.

## Ubicaciones

- Proyecto móvil de origen: `/Users/vincentariassaavedra/Desktop/micole-android/micole-android`.
- Copia de trabajo para iOS: `/Users/vincentariassaavedra/Downloads/micole-app/tmp/ios-local-20261030`.
- Paquete firmado actual: `output/ios/2026-11-09/MiCole-Mica-v7.ipa`.
- Registro final actual: `output/qa/2026-11-09-ios-mica/ios7-status.json`.
- Evidencias de la compilación 4: `ios-install4.json`, `ios-launch4.json`, `ios-installed-app4.json`, `ios-processes4.json` e `ios-build4.log`, en `output/qa/2026-11-03-identidad`.
- Evidencias de esta actualización: `installation-v3.json`, `launch-v3.json`, `installed-app-v3.json`, `processes-v3.json` y `build-iphone-v3.log`, en `output/qa/2026-10-30-ios-responsive`.

La compilación se realizó con Xcode local, sin compilaciones en la nube de Expo. La copia iOS tiene dependencias aisladas mediante una copia APFS. Las correcciones compartidas de interfaz y sus pruebas se guardaron también en el proyecto móvil de origen, verificando las huellas de los archivos antes de copiarlos. Las adaptaciones personales de firma y compilación iOS permanecen en la copia iOS.

## Firma gratuita

Se utilizó el Personal Team del propietario. El perfil incluye este iPhone y vence el **16 de noviembre de 2026 a las 11:00:48, hora de Bolivia**. Después habrá que renovar la firma y reinstalar una compilación válida. No se contrató una membresía de pago.

La clave privada permanece administrada por Xcode y el llavero de macOS. No se exportó como archivo ni se envió a Expo. Este IPA de desarrollo está destinado al dispositivo registrado; no es un paquete de distribución para clientes o TestFlight.

El iPhone quedó vinculado con esta Mac, con Modo de desarrollador habilitado y confianza en el certificado confirmada por el propietario. Si después de una reconexión `devicectl` informa que falta vinculación, se puede iniciar otra vez `devicectl manage pair` y atender en el teléfono cualquier confirmación que pida Apple.

## Corrección necesaria para iOS 27

La primera compilación se instalaba pero terminaba con `SIGTRAP`. El informe del propio MiCole señaló `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`. Se corrigió utilizando el soporte oficial de escenas de Expo para SDK 57:

```json
[
  "expo-build-properties",
  {
    "ios": {
      "enableSceneSupport": true
    }
  }
]
```

La dependencia se instaló mediante `expo install`, con la versión compatible con SDK 57. La versión de Expo usada es 57.0.30, que incluye el soporte de escenas requerido. `expo prebuild` generó la conformidad de `AppDelegate` con `ExpoReactNativeFactoryProvider` y el manifiesto de escenas que usa `EXExpoAppSceneDelegate`. No se editaron manualmente los archivos nativos generados.

Referencia oficial: [Expo: soporte de escenas en SDK 57 con Xcode 27](https://github.com/expo/fyi/blob/main/ios-scene-lifecycle.md#staying-on-sdk-57-with-xcode-27).

## Configuración de esta copia personal

- Conserva `com.micole.android` como identificador iOS, tal como estaba configurado en el proyecto de origen. El nombre visible es MiCole.
- Tiene `ios.buildNumber` en `7` y el equipo personal de firma en `ios.appleTeamId`.
- El complemento local `plugins/with-personal-ios.cjs` retira el entitlement de APNs para permitir la firma gratuita. Se coloca primero en la lista de complementos; se verificó que el archivo de entitlements generado y el firmado no requieren APNs.
- El archivo Android de Firebase no se necesita en esta copia iOS.
- Solo se copiaron las variables públicas de conexión de Supabase que necesita el cliente. La configuración local está protegida y no incluye las claves privadas de los servidores ni las de firma de Android.

Las notificaciones remotas actuales del cliente están implementadas para Android. El soporte de push de iOS, sus credenciales de Apple y sus pruebas con la app cerrada siguen pendientes. Los datos de notificaciones dentro de la aplicación son un recorrido distinto de la entrega push.

## Recompilación

En la copia iOS se ejecutaron generación nativa, instalación de CocoaPods, TypeScript, lint y compilación Release firmada. El patrón de compilación es:

```sh
CI=1 EXPO_NO_TELEMETRY=1 node node_modules/expo/bin/cli prebuild --platform ios --no-clean --no-install

xcodebuild \
  -workspace ios/MiCole.xcworkspace \
  -scheme MiCole \
  -configuration Release \
  -destination "id=$MICOLE_IOS_DEVICE_ID" \
  -derivedDataPath "$MICOLE_IOS_DERIVED_DATA" \
  -hideShellScriptEnvironment \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$MICOLE_APPLE_TEAM_ID" \
  CODE_SIGN_STYLE=Automatic \
  build
```

Estas variables deben configurarse con el dispositivo, equipo y destino local correspondientes. Cuando se prepare una copia nueva o cambien dependencias nativas, también hay que ejecutar `pod install` y verificar las rutas de dependencias. Para incorporar cambios futuros del proyecto móvil, actualizar la copia desde esas fuentes y conservar las adaptaciones de iOS descritas aquí.

Antes de empaquetar se verificó la firma con `codesign --verify --deep --strict`. `devicectl device install app` actualizó la aplicación y `devicectl device process launch` la abrió. La versión instalada se confirmó como 1.0.0 (4), y el proceso se mantuvo activo después de la apertura.

## Identidad personal de la compilación 4

- La vista docente muestra «Mi asistencia» y «Mis boletas de pago», con la persona activa y sin selector de personal.
- Los registros se limitan a los identificadores docentes de la identidad verificada y a la sede actual. Los borradores de boleta y los controles de gestión se reservan a Dirección.
- La clave de carga incluye cuenta, sesión de pruebas, rol e identificadores docentes para descartar datos de otro contexto.
- La prueba automatizada navega dentro de la aplicación para conservar la sesión de pruebas y comprueba que entrada y salida envían el docente activo, sin fecha ni hora elegidas por el cliente.
- La autoría visible de mensajes en pruebas se corrigió en el servidor; la auditoría conserva al operador real y a la persona representada.

## Correcciones de interfaz de la compilación 3

- Los modales tienen su propio proveedor de márgenes seguros, para respetar la barra de estado, la isla superior y el indicador inferior de iOS.
- Los textos calculan su altura de línea según el tamaño de letra; se corrigieron títulos que podían quedar recortados.
- La cabecera, el menú «Más» y el perfil se adaptan al ancho y permiten desplazar contenido largo. Un iPhone horizontal conserva la navegación de teléfono.
- Los formularios calculan sus columnas según el espacio real disponible, conservan los datos al girar y ajustan sus acciones en pantallas de poca altura.
- Se ampliaron los controles pequeños a un mínimo de 44 puntos y se limitaron los anchos de hojas y selectores.
- En el iPhone físico se comprobó que el teclado deja visibles el campo del nombre y las acciones «Cancelar» y «Siguiente» del formulario de institución.

## Alcance de la comprobación

- TypeScript y lint: correctos.
- Compilación nativa Release y firma: correctas.
- Perfil válido para el iPhone del propietario: comprobado.
- Instalación de la compilación 3: comprobada.
- Arranque y proceso activo: comprobados.
- Panel, menú «Más», formulario y teclado visibles en el iPhone mediante Device Hub: comprobados.
- No se ejecutó una nueva ronda completa de pruebas por rol, pagos, ubicación o archivos en iOS.
- La revisión física se hizo en un iPhone 17 Pro Max; la matriz de otros tamaños se ejecuta sobre React Native Web con datos simulados. No equivale a comprobar físicamente todos los modelos.
- La compilación para simulador se completó, pero su ejecución no se validó por errores locales de firma/llavero. No se cuenta como una prueba nativa aprobada.

El paquete inicial con el fallo de escenas y la compilación 2 anterior a estos ajustes se conservan en `output/ios/2026-10-30/archive`. La compilación 3 se conserva en el directorio del 30 de octubre. La entrega actual es la compilación 7 del directorio del 9 de noviembre.

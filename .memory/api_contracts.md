# Contratos de APIs

## MCP local implementado

`mobile_developer_list_apps` lista configuración no secreta y acepta `provider`
(`google-play` o `app-store`) y `limit` (1–100). Su resultado incluye metadatos
de límite y truncamiento. `mobile_developer_provider_status` expone solamente
booleanos de presencia de credenciales.

`mobile_developer_google_play_releases` recibe un `appId` local y un `track`
configurado y hace `GET /applications/{packageName}/tracks/{track}/releases`.
Normaliza `ReleaseSummary.releaseName`, `activeArtifacts[].versionCode` y
`releaseLifecycleState` como `name`, `versionCodes` y `status`. Google excluye
releases obsoletos, limita la respuesta a 20 y no entrega historia completa ni
porcentaje de rollout.

`mobile_developer_google_play_reviews` recibe `appId`, `limit` (1–100), cursor
opcional y `translationLanguage` opcional. Hace GET a `/reviews` con solo esos
parámetros soportados y entrega `userComment`: puntuación, texto, fechas y
versiones cuando existen. No devuelve `developerComment`/replies. Google solo
ofrece reviews creadas o modificadas dentro de la última semana; una página
vacía es válida, mientras 401/403 es `AUTHORIZATION`.

Ambas herramientas son de solo lectura. Cada futura consulta debe conservar
proveedor/fuente, período, unidad y metadatos de límite o paginación. Los
esquemas compartidos ya validan `period`, `unit` y `pagination`.

Los fallos usarán categorías sanitizadas: `CONFIGURATION`, `AUTHORIZATION`,
`NOT_FOUND` y `PROVIDER`. Datos ausentes no equivalen a cero.

## Proveedores previstos

- Google Play: configuración por `packageName` y tracks; autenticación local
  mediante ADC o `GOOGLE_APPLICATION_CREDENTIALS`, scope `androidpublisher`.
  Consultar reviews requiere el permiso de Play Console "Reply to reviews".
  Estos endpoints son solo GET y no crean edits.
- App Store Connect: configuración por App Store app ID; credenciales locales
  opcionales para el adaptador de Apple.

Los recursos de negocio implementados conservan el alcance de solo lectura;
las capacidades posteriores siguen usando estos contratos.

Ver [arquitectura](architecture.md) y [convenciones](coding_standards.md).

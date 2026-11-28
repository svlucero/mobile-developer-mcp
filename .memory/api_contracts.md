# Contratos de APIs

## MCP local implementado

`mobile_developer_list_apps` lista configuración no secreta y acepta `provider`
(`google-play` o `app-store`) y `limit` (1–100). Su resultado incluye metadatos
de límite y truncamiento. `mobile_developer_provider_status` expone solamente
booleanos de presencia de credenciales.

`MOBILE_DEVELOPER_MCP_CONFIG_PATH` ausente produce una configuración vacía;
no se busca automáticamente un archivo ni se carga `.env`. El alias local
`id` es el `appId` de las herramientas y difiere del ID Apple configurado.
El estado Google comprueba variables, no todas las formas de ADC ni permisos.

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

`mobile_developer_google_play_vital_issues` recibe `appId`, `start` y `end`
como timestamps UTC alineados a una hora, más `versionCodes`, tipos (`CRASH`,
`ANR`, `NON_FATAL`), `limit` (1–100) y cursor opcionales. Hace GET a
`v1beta1/apps/{package}/errorIssues:search` con scope
`playdeveloperreporting`, conserva los conteos que devuelve Google y expone el
cursor siguiente sin recorrerlo automáticamente.

`mobile_developer_google_play_installation_metrics` recibe `appId`, período de
fechas y dimensión opcional. Lee solamente el objeto mensual conocido
`stats/installs/installs_{package}_{yyyyMM}_{dimension}.csv` del
`reportingBucket` configurado, usando scope `devstorage.read_only`. Cada salida
conserva nombre exacto de columna, `count`, fuente, período diario, dimensiones,
entidad (`events`, `devices` o `users`) y tipo temporal (`flow` o `stock`). No
lista ni escribe objetos, omite objetos mensuales ausentes y no fabrica ceros.
Acepta gzip y CSV UTF-8/UTF-16 con BOM, hasta 5 MiB por objeto y 13 meses.

Los fallos usarán categorías sanitizadas: `CONFIGURATION`, `AUTHORIZATION`,
`NOT_FOUND` y `PROVIDER`. Datos ausentes no equivalen a cero.

## Configuración de proveedores

- Google Play: configuración por `packageName` y tracks; autenticación local
  mediante ADC, `GOOGLE_APPLICATION_CREDENTIALS` o un token OAuth local de
  corta vida (`GOOGLE_OAUTH_ACCESS_TOKEN`), con scopes separados
  `androidpublisher`, `playdeveloperreporting` y `devstorage.read_only`.
  Consultar reviews requiere el permiso de Play Console "Reply to reviews".
  Estos endpoints son solo GET y no crean edits.
- App Store Connect: configuración por App Store app ID; credenciales locales
  opcionales para el adaptador de Apple.

## App Store Connect implementado

La credencial principal usa `APP_STORE_CONNECT_KEY_PATH`, `_KEY_ID` e
`_ISSUER_ID`; los prefijos `APP_STORE_CONNECT_SALES_` y
`APP_STORE_CONNECT_ANALYTICS_` permiten roles separados y heredan los valores
principales faltantes. El adaptador firma JWT `ES256` local de corta duración y
ejecuta únicamente GET.

- `mobile_developer_app_store_versions`, `_builds` y `_reviews` reciben el
  `appId` local, límite 1–100, cursor y filtro opcional; reviews no incluye
  respuestas. El cursor siguiente no se recorre automáticamente.
- `mobile_developer_app_store_diagnostic_signatures` recibe `buildId` y
  paginación. Son diagnósticos disponibles por build, no todos los crashes de
  producción.
- `mobile_developer_app_store_sales_downloads` requiere fecha y `vendorNumber`,
  lee Sales/Summary diario y conserva fuente, período y dimensiones. Solo toma
  `Product Type Identifier` `1` (apps), excluyendo IAP. Separa iniciales y
  redescargas solo si existe `Order Type`; si no, devuelve `downloads`.
  El reporte se selecciona por `vendorNumber`, no se filtra por app Apple:
  usar dimensiones para distinguir filas. El parser no cubre todos los tipos
  de producto de Sales.
- `mobile_developer_app_store_analytics_existing` lee solicitudes, reportes,
  instancias y segmentos ya existentes. Nunca crea/reanuda informes ni devuelve
  URLs firmadas. Sin recursos puede requerir preparación manual, permisos o
  esperar disponibilidad/privacidad; no devuelve cero.
  Esta herramienta inspecciona metadatos e IDs; no descarga segmentos.

Sales y Analytics pueden tener latencia, privacidad o roles distintos. Informes
mayores de 5 MiB se rechazan. 401/403 son `AUTHORIZATION`, 404 es `NOT_FOUND`;
el resto de fallos y límites son `PROVIDER`.

Los recursos de negocio implementados conservan el alcance de solo lectura;
las capacidades posteriores siguen usando estos contratos.

## Garantías verificadas de V1

Todos los adaptadores de proveedores emiten `GET`; no existen rutas de negocio
POST/PUT/PATCH/DELETE. La integración stdio usa respuestas de fixture de Google
y Apple y rechaza cualquier método distinto de GET. Esto verifica el protocolo,
normalización y no filtrado de secretos, pero no acredita que una cuenta real
tenga roles, bucket o reportes disponibles.

Ver [arquitectura](architecture.md) y [convenciones](coding_standards.md).

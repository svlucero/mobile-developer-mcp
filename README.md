# mobile-developer-mcp

Servidor MCP local, de solo lectura, para datos de negocio de Google Play y
App Store Connect. El transporte es seguro por stdio y las credenciales quedan
siempre locales.

## Inicio local

Requiere Node.js 18 o superior.

```sh
npm install
cp mobile-developer-mcp.config.example.json mobile-developer-mcp.config.json
npm run build
npm start
```

El archivo local de configuración está ignorado por Git. Puede usar otra ruta
con `MOBILE_DEVELOPER_MCP_CONFIG_PATH`. Copie `.env.example` únicamente como
referencia; nunca agregue claves, tokens o archivos de cuenta al repositorio.

Ejemplo de cliente MCP:

```json
{
  "mcpServers": {
    "mobile-developer": {
      "command": "node",
      "args": ["/ruta/al/mobile-developer-mcp/dist/index.js"],
      "env": {
        "MOBILE_DEVELOPER_MCP_CONFIG_PATH": "/ruta/privada/apps.json"
      }
    }
  }
}
```

## Herramientas

- `mobile_developer_list_apps`: lista identificadores y configuración no
  secreta de apps, con filtro opcional `provider` y `limit` entre 1 y 100.
- `mobile_developer_provider_status`: indica solamente si las credenciales de
  cada proveedor están presentes localmente, sin mostrar valores.
- `mobile_developer_google_play_releases`: devuelve nombre, códigos de versión
  y estado de los releases no obsoletos de un track configurado. Google devuelve
  hasta 20: no es historial completo ni incluye el porcentaje de rollout.
- `mobile_developer_google_play_reviews`: devuelve puntuación, texto, fecha y
  versión cuando existen, con cursor, tamaño de página (1–100) e idioma de
  traducción opcional. Solo están disponibles comentarios creados o modificados
  durante la última semana; las respuestas del desarrollador nunca se exponen.
- `mobile_developer_google_play_vital_issues`: consulta por GET los issues
  agrupados de crashes/ANR de Android vitals, con período UTC alineado a la hora,
  filtros opcionales por `versionCodes` y `types`, y cursor/límite acotados.
- `mobile_developer_google_play_installation_metrics`: lee únicamente objetos
  CSV existentes de `stats/installs` en el bucket privado configurado. Devuelve
  observaciones diarias con el nombre exacto de la columna, unidad, fuente,
  período y dimensiones; nunca suma métricas de stock como instalaciones nuevas.
- `mobile_developer_app_store_versions`, `_builds` y `_reviews`: consultan
  versiones, builds/estado y customer reviews de App Store Connect con filtros
  y paginación acotada.
- `mobile_developer_app_store_diagnostic_signatures`: consulta diagnósticos
  disponibles por build; no es un inventario completo de crashes de producción.
- `mobile_developer_app_store_sales_downloads`: lee un reporte diario existente
  de Sales and Trends, solo para filas de apps (excluye compras internas).
- `mobile_developer_app_store_analytics_existing`: inspecciona solicitudes,
  instancias y segmentos Analytics existentes; nunca crea/reanuda reportes ni
  revela URLs firmadas de descarga.

Las futuras herramientas comparten contratos para `source`, `period` (`start`
y `end` ISO), `unit`, límites y paginación. Los errores de dominio son
estructurados y usan `CONFIGURATION`, `AUTHORIZATION`, `NOT_FOUND` o
`PROVIDER`; los detalles sensibles se redactan.

Google Play usa ADC o una cuenta de servicio indicada por
`GOOGLE_APPLICATION_CREDENTIALS`, con scopes separados por recurso:
`androidpublisher`, `playdeveloperreporting` y, para reportes privados,
`devstorage.read_only`. La cuenta necesita permiso **Reply to reviews** para
consultar reviews, acceso de lectura adecuado a Android vitals y acceso de
lector de objetos al bucket privado. Los reportes ausentes, permisos insuficientes
y desfases de publicación no se convierten en ceros. Los archivos comprimidos
gzip y CSV UTF-8/UTF-16 con BOM se aceptan hasta 5 MiB por objeto; se leen como
máximo 13 objetos mensuales. El servidor reserva stdout para JSON-RPC/MCP. Cualquier diagnóstico va a
stderr. No existen herramientas de publicación, edición de tracks, respuestas
a reviews ni generación de reportes.

App Store Connect usa un JWT ES256 firmado localmente con
`APP_STORE_CONNECT_KEY_PATH`, `APP_STORE_CONNECT_KEY_ID` y
`APP_STORE_CONNECT_ISSUER_ID`. Puede configurar los tríos `..._SALES_*` o
`..._ANALYTICS_*` cuando los permisos estén en roles distintos; campos ausentes
heredan la credencial principal. Sales and Trends requiere `vendorNumber` por
app. Descargas mayores de 5 MiB se rechazan; informes ausentes, permisos,
latencia de publicación o privacidad no se representan como cero.

## Desarrollo

```sh
npm run build
npm test
```

## Preparación externa y permisos mínimos

Las siguientes acciones ocurren fuera del MCP, en las consolas de los
proveedores. El servidor no puede ni intenta crear apps, activar APIs, generar
reportes, modificar roles, publicar artefactos ni escribir objetos.

| Proveedor | Preparación y permisos de menor privilegio | Preparación manual y disponibilidad |
| --- | --- | --- |
| Google Play | Vincular ADC/cuenta de servicio a Play Console con lectura de la app. Reviews exige **Reply to reviews**; Vitals requiere Play Developer Reporting y scope `playdeveloperreporting`. | Configurar `packageName` y tracks. Las reseñas y reportes pueden tardar en aparecer. |
| Google Statistics | Otorgar `Storage Object Viewer` al bucket privado y scope `devstorage.read_only`. | Preparar/localizar el bucket de informes Play, configurar `reportingBucket` y esperar el CSV mensual. El MCP no lista, crea ni escribe objetos. |
| App Store Connect | Crear una API key `.p8` local y asignar el rol de lectura mínimo para versiones, builds, reviews y diagnósticos. Configurar `KEY_PATH`, `KEY_ID`, `ISSUER_ID` y el App Store app ID. | Mantener la clave fuera de Git. Los roles distintos de Sales/Analytics pueden usar `APP_STORE_CONNECT_SALES_*` y `..._ANALYTICS_*`; los campos ausentes heredan la credencial principal. |
| Apple Sales/Analytics | Conceder el rol de Sales and Trends y/o Analytics, y configurar `vendorNumber` para Sales. | Generar/publicar reportes y solicitudes Analytics en App Store Connect y esperar disponibilidad. El MCP solo lee reportes, instancias y segmentos existentes. |

Además de ADC o `GOOGLE_APPLICATION_CREDENTIALS`, se admite localmente un token
OAuth de corta vida en `GOOGLE_OAUTH_ACCESS_TOKEN`; no lo guarde en el JSON de
apps ni lo agregue a Git.

## Catálogo de herramientas

Todos los `limit` están acotados a 1–100 y los cursores son opacos. Las
respuestas conservan fuente, unidad, período y/o paginación cuando corresponda.

| Herramienta | Entradas | Salida | Límites y semántica |
| --- | --- | --- | --- |
| `mobile_developer_list_apps` | `provider?`, `limit?` | Apps y configuración no secreta | Máximo 100, puede truncar. |
| `mobile_developer_provider_status` | — | Presencia booleana de credenciales | No valida permisos ni contacta proveedores. |
| `mobile_developer_google_play_releases` | `appId`, `track` | Nombre, versionCodes, estado | Excluye obsoletos, máximo 20; sin historial completo ni rollout. |
| `mobile_developer_google_play_reviews` | `appId`, `limit?`, `cursor?`, `translationLanguage?` | Comentarios de usuario, score, versión y fecha | Solo creados/modificados en la última semana; sin respuestas de desarrollador. |
| `mobile_developer_google_play_vital_issues` | `appId`, `start`, `end`, `versionCodes?`, `types?`, paginación | Issues, conteo y usuarios distintos | UTC alineado a hora; no equiparable a diagnósticos Apple. |
| `mobile_developer_google_play_installation_metrics` | `appId`, `start`, `end`, `dimension?` | Observaciones CSV diarias, columna exacta, entidad/tipo | Hasta 13 objetos mensuales y 5 MiB por objeto; no suma stocks. |
| `mobile_developer_app_store_versions` | `appId`, `limit?`, `cursor?`, `platform?` | Versiones y estado | Paginación a 100. |
| `mobile_developer_app_store_builds` | `appId`, `limit?`, `cursor?`, `version?` | Builds y processing state | Paginación a 100. |
| `mobile_developer_app_store_reviews` | `appId`, `limit?`, `cursor?`, `territory?` | Customer reviews | Sin developer responses. |
| `mobile_developer_app_store_diagnostic_signatures` | `buildId`, paginación | Firma, tipo, peso | No es inventario completo de crashes de producción. |
| `mobile_developer_app_store_sales_downloads` | `appId`, `date` | Descargas de filas de apps | Reporte diario existente, 5 MiB; excluye IAP; separa redescargas solo con `Order Type`. |
| `mobile_developer_app_store_analytics_existing` | `appId`, paginación, `instanceId?` | Solicitudes/reportes/instancias o IDs de segmentos | Solo existentes; sin URL firmada, creación ni reanudación. |

## Ausencia de datos, retención y verificación

- Ausencia no es cero: un CSV/reporte/instancia ausente devuelve colección vacía
  o `reportAvailable: false`; permisos insuficientes producen `AUTHORIZATION`.
- Reviews de Google solo cubre una ventana de una semana y releases no es
  historial completo. Play reporting, buckets privados, Sales and Trends y
  Analytics tienen latencia; privacidad, umbrales y roles pueden ocultar datos.
- Las instalaciones Play preservan columna, entidad (events/devices/users) y
  flujo/stock. Sales Apple cuenta producto app, no personas únicas. Diagnósticos
  Apple y Vitals Android tienen coberturas y denominadores diferentes.
- Errores `CONFIGURATION`, `AUTHORIZATION`, `NOT_FOUND` y `PROVIDER` se
  sanitizan; nunca se devuelven claves, JWT, Bearer tokens ni URLs firmadas.

`npm test` compila y ejecuta validación, sanitización, fixtures de adaptador y
una integración MCP real por stdio con fixtures de Google Play y App Store
Connect. La fixture rechaza métodos distintos de `GET`; las pruebas y una
auditoría de fuentes cubren la ausencia de POST/PUT/PATCH/DELETE contra
proveedores. No usa credenciales reales, por lo que no acredita permisos,
cuentas, buckets ni reportes preparados. Un smoke test manual con credenciales
locales debe limitarse a una consulta de lectura por proveedor e informar qué
recursos y permisos respondieron realmente.

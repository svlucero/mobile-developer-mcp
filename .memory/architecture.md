# Arquitectura

## Propósito

Servidor MCP local de solo lectura para consultar datos de negocio de Google
Play y App Store Connect. El issue #2 establece la infraestructura compartida;
las consultas por proveedor se incorporan después.

## Implementación base

- Node.js/TypeScript con transporte MCP por `stdio`.
- `src/index.ts` conecta `McpServer` al transporte; stdout queda reservado para
  JSON-RPC y los diagnósticos van a stderr.
- `src/server.ts` registra las herramientas iniciales de inspección local.
- `src/contracts.ts`, `src/config.ts` y `src/errors.ts` establecen contratos,
  carga validada/redactada de configuración y errores de dominio sanitizados.
- `src/providers/` contiene adaptadores independientes de Google Play y App
  Store Connect. `google-play.ts` usa ADC o una cuenta de servicio local y hace
  únicamente GETs a Android Publisher, Play Developer Reporting y GCS.
- El adaptador de Google incluye búsqueda paginada de issues de Android vitals
  y un lector de CSV de instalaciones de objetos existentes de GCS. Decodifica
  gzip y UTF-16/UTF-8, limita cada descarga a 5 MiB y no agrega observaciones
  diarias de stock como si fueran flujos.
- `app-store.ts` firma JWT ES256 localmente con una clave `.p8` y realiza GET a
  versiones, builds, customer reviews, diagnostic signatures, Sales and Trends
  y recursos Analytics existentes. Admite credenciales distintas para Sales o
  Analytics, limita informes gzip/TSV a 5 MiB y nunca devuelve JWT, clave ni URL
  firmada.
- Los adaptadores son opcionales e independientes: una configuración válida de
  un proveedor no exige credenciales del otro. El entorno inyectado al servidor
  se propaga a los adaptadores para informar estado sin revelar secretos.
- Las pruebas de stdio pueden precargar un `fetch` de fixture en el proceso hijo:
  ejercitan herramientas Google y Apple por el protocolo sin tráfico ni
  credenciales reales. Google también admite un token OAuth local de corta vida
  (`GOOGLE_OAUTH_ACCESS_TOKEN`) como alternativa a ADC.

Las pruebas de `test/` cubren carga de configuración, redacción, handshake y
llamadas MCP reales por stdio con fixtures de ambos proveedores.

## Límites

- Solo lectura de recursos de negocio; autenticación puede intercambiar tokens.
- No publicar releases, editar tracks, responder reviews, generar reportes ni
  escribir/listar objetos de GCS.
- Releases usa la ruta directa de tracks, sin edits; reviews devuelve solo
  `userComment` y no respuestas del desarrollador.
- Conservar fuente, período, unidad, límites y paginación en los contratos.
- Analytics no crea ni reanuda solicitudes de generación; si no hay instancias
  o segmentos, el usuario debe preparar el reporte en App Store Connect.

Ver [convenciones](coding_standards.md) y [contratos](api_contracts.md).

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

## Desarrollo

```sh
npm run build
npm test
```

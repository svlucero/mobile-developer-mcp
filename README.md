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

Las futuras herramientas comparten contratos para `source`, `period` (`start`
y `end` ISO), `unit`, límites y paginación. Los errores de dominio son
estructurados y usan `CONFIGURATION`, `AUTHORIZATION`, `NOT_FOUND` o
`PROVIDER`; los detalles sensibles se redactan.

Google Play usa ADC o una cuenta de servicio indicada por
`GOOGLE_APPLICATION_CREDENTIALS`, con el scope `androidpublisher`; la cuenta
necesita permiso **Reply to reviews** para consultar reviews. El servidor reserva stdout para JSON-RPC/MCP. Cualquier diagnóstico va a
stderr. No existen herramientas de publicación, edición de tracks, respuestas
a reviews ni generación de reportes.

## Desarrollo

```sh
npm run build
npm test
```

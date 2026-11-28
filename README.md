# mobile-developer-mcp

Servidor [MCP](https://modelcontextprotocol.io/) local para consultar Google Play
y App Store Connect desde un asistente compatible: releases, reviews, problemas
técnicos y reportes de instalaciones o descargas. **V1 de solo lectura.**

Proyecto independiente, sin afiliación con Google ni Apple. Está en etapa
experimental: las pruebas usan fixtures; el acceso real y los permisos deben
verificarse en cada instalación.

## Cómo funciona

```text
Cliente MCP / asistente
        │ JSON-RPC por stdin/stdout
        ▼
mobile-developer-mcp (proceso local)
        ├── configuración de apps + credenciales locales
        ├── Google: Android Publisher / Play Reporting / GCS
        └── Apple: App Store Connect / Sales / Analytics existentes
```

El cliente inicia el proceso y llama herramientas con parámetros validados.
Los adaptadores consultan APIs por HTTPS y devuelven datos con fuente y límites.
No hay interfaz web ni servidor HTTP; stdout está reservado para MCP y los
diagnósticos van a stderr. Los datos devueltos quedan disponibles para el cliente
y su asistente: revisá cómo manejan la información privada de tus apps.

Las consultas de negocio usan `GET`. No publica releases, modifica tracks,
responde reviews ni crea reportes. La autenticación de Google puede intercambiar
tokens mediante otras solicitudes HTTP. Cada proveedor se configura por separado.

## Inicio rápido

Necesitás Git, npm y Node.js LTS 22 o posterior. La CI incluye Node 22, 24 y 26.
Node 18, 20 y 23 quedan fuera del entorno admitido. Consultá versiones con soporte en
[Node.js Releases](https://nodejs.org/en/about/previous-releases).

```sh
git clone https://github.com/svlucero/mobile-developer-mcp.git
cd mobile-developer-mcp
npm ci
npm run build
cp mobile-developer-mcp.config.example.json mobile-developer-mcp.config.json
```

Editá el JSON copiado con tus identificadores y configurá las credenciales del
proveedor que uses. La copia local está ignorada por Git.

```sh
export MOBILE_DEVELOPER_MCP_CONFIG_PATH="$PWD/mobile-developer-mcp.config.json"
# Solo para Google con una cuenta de servicio local:
export GOOGLE_APPLICATION_CREDENTIALS="/ruta/privada/google-service-account.json"
node dist/index.js
```

El proceso espera mensajes MCP: no muestra un menú. Conectalo a un cliente como
se indica abajo. `Ctrl+C` lo detiene.

**El servidor no carga `.env` automáticamente.** `.env.example` es una referencia:
exportá las variables o pasalas en la configuración del cliente. No hay paquete
npm publicado ni instalación mediante `npx`.

## Configuración de apps

```json
{
  "apps": [
    {
      "id": "my-mobile-app",
      "googlePlay": {
        "packageName": "com.example.app",
        "tracks": ["production", "beta"],
        "reportingBucket": "pubsite_prod_rev_0123456789"
      },
      "appStore": {
        "appId": "1234567890",
        "vendorNumber": "12345678"
      }
    }
  ]
}
```

| Campo | Qué representa |
| --- | --- |
| `id` | Alias local único: minúsculas, números y guiones. Es el `appId` que reciben las herramientas. |
| `googlePlay.packageName` | Identificador Android real. |
| `googlePlay.tracks` | Tracks permitidos para consulta; deben existir en tu cuenta. |
| `googlePlay.reportingBucket` | Opcional: bucket privado de estadísticas, para instalaciones. |
| `appStore.appId` | ID numérico de App Store Connect, distinto del alias local. |
| `appStore.vendorNumber` | Opcional: número de proveedor requerido para Sales. |

Eliminá `googlePlay` o `appStore` si solo usás una tienda. Se admiten hasta 100
apps, cada una con al menos un proveedor. **Pasá la ruta con
`MOBILE_DEVELOPER_MCP_CONFIG_PATH`**: si falta, la lista queda vacía aunque exista
el archivo del ejemplo. Las rutas relativas se resuelven desde el directorio de
trabajo del proceso; preferí rutas absolutas en clientes de escritorio.

### Google Play

Prepará una identidad autorizada para tus apps en Play Console y habilitá las
APIs que necesites. El MCP no crea identidades ni asigna permisos. Usá
`GOOGLE_APPLICATION_CREDENTIALS` con una cuenta de servicio fuera del repo, o
Application Default Credentials (ADC) disponibles para el proceso.

| Recurso | API / scope | Acceso requerido |
| --- | --- | --- |
| Releases y reviews | Android Publisher / `androidpublisher` | Acceso a la app; reviews requiere **Reply to reviews** en Play Console, aunque el MCP solo lea. |
| Crashes y ANR | Play Developer Reporting / `playdeveloperreporting` | Acceso a Android vitals de la app. |
| Instalaciones | Cloud Storage / `devstorage.read_only` | Lectura de objetos del bucket privado de reportes Play. |

También se admite `GOOGLE_OAUTH_ACCESS_TOKEN`, un token local de corta duración
con los scopes correspondientes. Tiene prioridad sobre ADC y **no se renueva**
automáticamente. No lo pongas en el JSON de apps ni en un issue.

La herramienta de estado solo comprueba variables de entorno: puede indicar
`false` con ADC configuradas por otro mecanismo. Un `true` tampoco confirma
existencia del archivo, vigencia del token ni permisos.

Referencias: [configuración de Google Play API](https://developers.google.com/android-publisher/getting_started),
[Play Reporting](https://developers.google.com/play/developer/reporting),
[reportes de estadísticas](https://support.google.com/googleplay/android-developer/answer/6135870).

### App Store Connect

Creá una API key con acceso a los recursos necesarios, guardá el `.p8` fuera del
repo y configurá:

```sh
export APP_STORE_CONNECT_KEY_PATH="/ruta/privada/AuthKey_EXAMPLE.p8"
export APP_STORE_CONNECT_KEY_ID="EXAMPLEKEY"
export APP_STORE_CONNECT_ISSUER_ID="00000000-0000-0000-0000-000000000000"
```

El servidor firma JWT ES256 localmente. Sales y Analytics pueden usar otros
roles: los prefijos `APP_STORE_CONNECT_SALES_*` y
`APP_STORE_CONNECT_ANALYTICS_*` admiten `KEY_PATH`, `KEY_ID` e `ISSUER_ID`.
Cada valor ausente hereda el principal; configurá el trío completo al cambiar
de cuenta. Sales requiere `vendorNumber`. Analytics solo inspecciona recursos
existentes: su preparación y generación deben hacerse fuera del MCP.

Los roles, disponibilidad y privacidad pueden variar entre recursos.
Referencia: [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi/).

## Conectar un cliente MCP

Este es el formato común `mcpServers`; su ubicación y formato exactos dependen
del cliente. Usá rutas absolutas. Si `node` no está en el PATH del cliente,
reemplazá `command` por la ruta absoluta al ejecutable.

```json
{
  "mcpServers": {
    "mobile-developer": {
      "command": "node",
      "args": ["/ruta/al/mobile-developer-mcp/dist/index.js"],
      "env": {
        "MOBILE_DEVELOPER_MCP_CONFIG_PATH": "/ruta/privada/apps.json",
        "GOOGLE_APPLICATION_CREDENTIALS": "/ruta/privada/google-service-account.json",
        "APP_STORE_CONNECT_KEY_PATH": "/ruta/privada/AuthKey_EXAMPLE.p8",
        "APP_STORE_CONNECT_KEY_ID": "EXAMPLEKEY",
        "APP_STORE_CONNECT_ISSUER_ID": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

Eliminá las variables del proveedor que no uses y recargá el cliente. Empezá
por `mobile_developer_list_apps` y `mobile_developer_provider_status`: no
contactan las tiendas.

Ejemplos de pedidos al asistente:

- «Listá las apps configuradas y el estado de sus credenciales».
- «Mostrá los releases de `my-mobile-app` en el track `production`».
- «Traé 20 reviews recientes de Google Play para `my-mobile-app`».
- «Consultá los issues ANR de la versión 42 del 1 al 2 de noviembre en UTC».

Ejemplo de llamada MCP, no de comando de terminal:

```json
{
  "name": "mobile_developer_google_play_releases",
  "arguments": { "appId": "my-mobile-app", "track": "production" }
}
```

Para Vitals usá timestamps UTC alineados a una hora, por ejemplo
`start: "2026-11-01T00:00:00Z"`, `end: "2026-11-02T00:00:00Z"`.
Para instalaciones, `start` y `end` son fechas `YYYY-MM-DD`.

## Herramientas

Los `limit` aceptan 1–100 (50 por defecto). Pasá `nextCursor` como `cursor` en
la próxima llamada con los mismos filtros; no se recorren todas las páginas
automáticamente. Los IDs `buildId` e `instanceId` provienen de Apple.

| Herramienta | Entradas principales | Resultado y límites |
| --- | --- | --- |
| `mobile_developer_list_apps` | `provider?`, `limit?` | Configuración local no secreta. |
| `mobile_developer_provider_status` | Ninguna | Presencia de credenciales, sin validar acceso. |
| `mobile_developer_google_play_releases` | `appId`, `track` | Hasta 20 releases no obsoletos; sin historial completo ni rollout. |
| `mobile_developer_google_play_reviews` | `appId`, paginación, `translationLanguage?` | Reviews creadas/modificadas en la última semana; sin respuestas. |
| `mobile_developer_google_play_vital_issues` | `appId`, `start`, `end`, `versionCodes?`, `types?`, paginación | Issues agrupados; tipos `CRASH`, `ANR`, `NON_FATAL`. |
| `mobile_developer_google_play_installation_metrics` | `appId`, `start`, `end`, `dimension?` | Observaciones diarias CSV de GCS; hasta 13 objetos mensuales. |
| `mobile_developer_app_store_versions` | `appId`, paginación, `platform?` | Versiones y estado. |
| `mobile_developer_app_store_builds` | `appId`, paginación, `version?` | Builds y estado de procesamiento. |
| `mobile_developer_app_store_reviews` | `appId`, paginación, `territory?` | Customer reviews sin respuestas. |
| `mobile_developer_app_store_diagnostic_signatures` | `buildId`, paginación | Diagnósticos disponibles por build; no todos los crashes. |
| `mobile_developer_app_store_sales_downloads` | `appId`, `date` | Filas de apps del reporte diario del proveedor; hasta 5 MiB. |
| `mobile_developer_app_store_analytics_existing` | `appId`, paginación, `instanceId?` | Solicitudes, reportes, instancias o IDs de segmentos existentes. |

## Límites y estado de la V1

- Las pruebas verifican el protocolo y respuestas simuladas. Los contratos y
  permisos pueden necesitar ajustes al validarlos contra cuentas reales.
- Sales de Apple selecciona el proveedor mediante el alias local, pero **no
  filtra las filas por `appStore.appId`**. Revisá las dimensiones para identificar
  la app; no sumes todo como total de una sola app. El parser incluye solo
  `Product Type Identifier` igual a `1` y distingue redescargas únicamente con
  `Order Type`; no cubre todos los tipos de producto.
- Analytics lista metadatos e IDs: no descarga ni analiza segmentos. No crea ni
  reanuda solicitudes y no expone URLs firmadas.
- Instalaciones de Google conserva columnas, dimensiones y observaciones diarias;
  no suma stocks. No equivale a personas únicas ni a Sales de Apple.
- El límite de reportes de 5 MiB corresponde al archivo descargado; no garantiza
  un límite de memoria al descomprimirlo.
- Reportes ausentes no son cero: pueden producir `reportAvailable: false` o
  colecciones vacías. Disponibilidad, retención y privacidad afectan los datos.
  Vitals y diagnósticos Apple tienen coberturas diferentes.
- Solo se leen objetos GCS con nombres mensuales conocidos; no se lista el bucket.

## Solución de problemas

| Síntoma | Qué revisar |
| --- | --- |
| Lista de apps vacía | Variable `MOBILE_DEVELOPER_MCP_CONFIG_PATH` y ruta del JSON. |
| `CONFIGURATION` | Archivo ilegible, esquema inválido, clave Apple ausente o timestamps incorrectos. |
| `AUTHORIZATION` | Token vencido, scopes, roles o permisos del bucket. |
| `NOT_FOUND` | Alias o track no configurado, ID incorrecto o recurso inexistente. |
| `PROVIDER` | Red, cuota, respuesta inesperada o límite de reporte. |
| El cliente no conecta | Ejecutá `npm run build`, revisá rutas de `node`/`dist/index.js` y stderr del cliente. |
| La terminal queda esperando | Es normal: espera al cliente MCP por stdin. |

No pegues tokens, claves, reportes privados ni logs sin revisar en issues o PRs.
Para vulnerabilidades consultá [SECURITY.md](SECURITY.md).

## Desarrollo y contribuciones

```sh
npm ci
npm run build
npm test
```

`npm test` compila y ejecuta Vitest: configuración, errores, JWT, fixtures de
ambos proveedores e integración por stdio. No requiere claves reales.
La CI ejecuta esta suite en Linux con Node 22, 24 y 26.

```text
src/index.ts       Entrada stdio
src/server.ts      Registro de herramientas MCP
src/config.ts      Configuración validada
src/contracts.ts   Esquemas compartidos
src/errors.ts      Errores sanitizados
src/providers/     Adaptadores Google y Apple
test/              Pruebas unitarias y de integración
.memory/           Contexto técnico del proyecto
```

Leé [CONTRIBUTING.md](CONTRIBUTING.md) para proponer cambios. V2 evaluará más
recursos; la V1 mantiene consultas de solo lectura. Errores y propuestas:
[GitHub Issues](https://github.com/svlucero/mobile-developer-mcp/issues).

## Licencia

[MIT](LICENSE), copyright 2026 svlucero. Las credenciales, cuentas y datos de las
tiendas no forman parte de esta licencia; se rigen por los permisos y condiciones
de sus proveedores.

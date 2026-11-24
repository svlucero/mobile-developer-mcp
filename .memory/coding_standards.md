# Convenciones

- TypeScript/Node.js estricto y módulos ESM.
- El protocolo MCP usa exclusivamente stdout; logs y diagnósticos van a stderr.
- Validar toda entrada externa en el borde; limitar paginación y volumen.
- No versionar, registrar ni devolver secretos. Sanitizar los errores antes de
  enviarlos por MCP.
- Distinguir configuración, autorización, datos ausentes y fallos de proveedor.
- Mantener adaptadores separados por proveedor y no introducir mutaciones de
  negocio en V1.
- Los adaptadores HTTP solo deben ejecutar métodos/rutas explícitamente
  permitidos; Google Play usa GET y mapea 401/403 a `AUTHORIZATION`, 404 a
  `NOT_FOUND` y límites/fallos a `PROVIDER`.
- Para Vitals, validar timestamps UTC alineados a hora y fijar límites locales
  más estrictos que los máximos remotos. Para estadísticas, limitar meses y
  bytes antes/durante la descarga y conservar cada observación sin sumar stocks.
- Inyectar entorno, autenticación y transporte en adaptadores para probar con
  fixtures sin credenciales ni tráfico real.
- El token OAuth local alternativo de Google se trata como secreto: solo se lee
  de entorno, nunca de la configuración de apps, respuestas o logs.
- Usar `McpDomainError` y sus códigos `CONFIGURATION`, `AUTHORIZATION`,
  `NOT_FOUND` o `PROVIDER` al convertir fallos de dominio a una respuesta MCP.
- La configuración se lee desde la ruta en `MOBILE_DEVELOPER_MCP_CONFIG_PATH`;
  ejemplos sí se versionan, archivos reales y claves no.
- Para App Store Connect, usar JWT ES256 de duración corta firmado desde una
  ruta local. Mantener GET, limitar informes a 5 MiB y omitir URLs de segmentos
  Analytics. Datos no disponibles no son cero; diagnostic signatures no son un
  listado completo de crashes.

Las pruebas deben incluir protocolo stdio con fixtures de ambos proveedores,
validación, redacción de secretos, errores estructurados y métodos/rutas
salientes. `npm test` compila y ejecuta Vitest. Usar mensajes de commit
convencionales y acotados.

Ver [arquitectura](architecture.md) y [contratos](api_contracts.md).

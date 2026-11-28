# Contribuir

Se aceptan issues y pull requests en español o inglés. Para cambios grandes,
describí primero el problema en un issue. Para documentación o bugs acotados,
podés abrir directamente un PR.

## Preparar el entorno

1. Hacé un fork y clonalo, o creá una rama si tenés acceso al repositorio.
2. Usá Node LTS; la matriz de CI cubre 22, 24 y 26.
3. Ejecutá `npm ci` y `npm test`. No necesitás credenciales reales.
4. Hacé cambios enfocados y agregá pruebas para cambios de comportamiento.

## Convenciones

- TypeScript estricto, ESM e imports locales con extensión `.js`.
- Separar adaptadores por proveedor y validar entradas MCP.
- Mantener V1 de solo lectura: sin publicación, respuestas a reviews, edición
  de recursos ni generación de reportes.
- stdout es exclusivamente del protocolo; diagnósticos por stderr.
- Convertir fallos a errores sanitizados. No incluir claves, tokens, reportes
  reales, nombres de clientes ni datos personales en código o fixtures.
- No llamar cuentas reales desde tests o CI; usar fixtures sintéticas.
- Mantener README y los tres documentos `.memory/` alineados con el código.
- Usar commits descriptivos, por ejemplo `fix: handle missing review text`.

El intercambio de tokens de autenticación no autoriza escrituras de negocio.
Para nuevas consultas, documentá permisos, fuente, período, límites y semántica.

## Antes de abrir un PR

```sh
npm run build
npm test
git diff --check
git status --short
```

Describí problema, comportamiento resultante, verificación y limitaciones.
Distinguí fixtures de validación real, sin publicar datos de la cuenta.
La CI debe pasar antes del merge. Las contribuciones aceptadas se distribuyen
bajo la [licencia MIT](LICENSE).

Para vulnerabilidades seguí [SECURITY.md](SECURITY.md), evitando issues públicos.
Tratá a los demás con respeto y centrá las discusiones en los cambios técnicos.

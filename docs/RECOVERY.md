# Recuperación de NoeApps

## Objetivo

GitHub conserva una copia independiente de la web para evitar que el proyecto dependa exclusivamente del alojamiento de ChatGPT Sites.

## Ejecutar localmente

Desde la raíz del repositorio:

```bash
npm run check
npm run serve
```

Después abre `http://localhost:8080`.

## Publicación

La web de producción sigue en ChatGPT Sites. Este repositorio no incluye una acción de despliegue automático para evitar sustituir accidentalmente la versión pública.

## Verificación

Antes de considerar una copia completa:

1. `npm run check` debe finalizar sin errores.
2. La portada debe abrir sin recursos 404.
3. Deben responder `/apps/deleteguard/`, `/privacidad/` y `/soporte/`.
4. `.openai/hosting.json` debe conservar el `project_id` de NoeApps.

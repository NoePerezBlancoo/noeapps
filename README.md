# NoeApps

Código fuente y copia mantenible de la web pública [noeapps.com](https://noeapps.com), alojada actualmente en **ChatGPT Sites**.

Este repositorio sirve como **fuente/backup independiente** de la web: permite levantar una copia local y migrarla a otro hosting sin depender del servicio de Sites. Un push a GitHub no cambia automáticamente la web pública.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `dist/` | Web estática completa y lista para servir. |
| `dist/apps/deleteguard/` | Presentación pública de DeleteGuard. |
| `dist/assets/` | Recursos visuales versionados. |
| `scripts/check.mjs` | Comprobación mínima de integridad. |
| `docs/` | Alojamiento, recuperación y procedencia de la copia. |
| `.openai/hosting.json` | Vinculación con el proyecto existente de ChatGPT Sites. |

## Ejecutar

Requiere Node.js 22 o superior y Python 3 para el servidor local de desarrollo.

```bash
npm run check
npm run serve
```

Abre `http://localhost:8080`.

## Alojamiento

Producción continúa en **ChatGPT Sites** con el dominio `noeapps.com`. El `project_id` se conserva en `.openai/hosting.json`. Consulta `docs/SITES.md` y `docs/RECOVERY.md`.

## Repositorios de productos

| Producto | Código |
| --- | --- |
| DeleteGuard | [NoePerezBlancoo/DeleteGuard](https://github.com/NoePerezBlancoo/DeleteGuard) |
| BrokenLinkGuard | [NoePerezBlancoo/BrokenLinkGuard](https://github.com/NoePerezBlancoo/BrokenLinkGuard) |
| LeaverGuard | [NoePerezBlancoo/LeaverGuard](https://github.com/NoePerezBlancoo/LeaverGuard) |
| ForgeOps | [NoePerezBlancoo/ForgeOps](https://github.com/NoePerezBlancoo/ForgeOps) |
| Fivaki | [NoePerezBlancoo/Fitnex](https://github.com/NoePerezBlancoo/Fitnex) |

El código de las aplicaciones no se duplica dentro de este repositorio; cada producto conserva su repositorio, historial y despliegue independiente.

# NoeApps

Código fuente y copia mantenible de la web pública [noeapps.com](https://noeapps.com), alojada actualmente en **ChatGPT Sites**.

Este repositorio es la **fuente de código/backup independiente** de la web. Permite levantarla localmente y migrarla a otro hosting sin depender de Sites. Un push a GitHub no cambia automáticamente la web pública.

## Versión actual

**NoeApps 2.0.0** — rediseño visual publicado en el código el 11 de septiembre de 2026.

La versión 2 incorpora una identidad visual basada en el nuevo logotipo NoeApps, una portada más explicativa, navegación más clara y fichas públicas para DeleteGuard, BrokenLinkGuard y LeaverGuard.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `dist/` | Web estática completa y lista para servir. |
| `dist/apps/deleteguard/` | Presentación pública de DeleteGuard. |
| `dist/apps/brokenlinkguard/` | Presentación pública de BrokenLinkGuard. |
| `dist/apps/leaverguard/` | Presentación pública de LeaverGuard. |
| `dist/assets/` | Logotipo y recursos visuales versionados. |
| `scripts/check.mjs` | Comprobación de archivos obligatorios y enlaces locales. |
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

Producción continúa en **ChatGPT Sites** con el dominio `noeapps.com`. GitHub conserva el código completo; la web está preparada para poder desplegar el contenido de `dist/` en un hosting estático alternativo cuando se decida.

## Repositorios de productos

| Producto | Código |
| --- | --- |
| DeleteGuard | [NoePerezBlancoo/DeleteGuard](https://github.com/NoePerezBlancoo/DeleteGuard) |
| BrokenLinkGuard | [NoePerezBlancoo/BrokenLinkGuard](https://github.com/NoePerezBlancoo/BrokenLinkGuard) |
| LeaverGuard | [NoePerezBlancoo/LeaverGuard](https://github.com/NoePerezBlancoo/LeaverGuard) |
| ForgeOps | [NoePerezBlancoo/ForgeOps](https://github.com/NoePerezBlancoo/ForgeOps) |
| Fivaki | [NoePerezBlancoo/Fitnex](https://github.com/NoePerezBlancoo/Fitnex) |

El código de las aplicaciones no se duplica dentro de este repositorio; cada producto conserva su repositorio, historial y despliegue independiente.

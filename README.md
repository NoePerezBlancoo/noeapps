# NoeApps

Código fuente y copia mantenible de la web pública [noeapps.com](https://noeapps.com), alojada actualmente en **ChatGPT Sites**.

Este repositorio es la **fuente de código/backup independiente** de la web. Permite levantarla localmente y migrarla a otro hosting sin depender de Sites. Un push a GitHub no cambia automáticamente la web pública.

## Versión actual

**NoeApps 2.3.0** — incorporación de Catálogo NoeApps como proyecto público el 28 de septiembre de 2026.

La versión 2.3 incorpora **Catálogo NoeApps**, enlazado a `catalogo.noeapps.com`, como nuevo proyecto público. El catálogo pasa a 20 entradas: 4 aplicaciones, 6 herramientas, 3 integraciones Atlassian y 7 proyectos.\n\nLa versión 2.2 recupera las 17 fichas del catálogo anterior y añade TuNegocio y TuTest: auditoría web gratuita, pasiva y sin registro, con página propia, acceso directo, soporte y metadatos.

La versión 2.1 incorpora **TuNegocio** como nuevo producto destacado de NoeApps, amplía la portada para representar una cartera más amplia que la línea Atlassian, añade su ficha pública, soporte, sitemap y validación de integridad.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `dist/` | Web estática completa y lista para servir. |
| `dist/apps/tutest/` | Auditoría técnica web gratuita con Audit Intelligence V5. |
| `dist/apps/tunegocio/` | Presentación pública de TuNegocio. |
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
npm run build
npm run serve
```

Abre `http://localhost:8080`.

## Alojamiento

Producción continúa en **ChatGPT Sites** con el dominio `noeapps.com`. GitHub conserva el código completo; la web está preparada para poder desplegar el contenido de `dist/` en un hosting estático alternativo cuando se decida.

## Repositorios de productos

| Producto | Código |
| --- | --- |
| TuTest | [NoePerezBlancoo/tutest](https://github.com/NoePerezBlancoo/tutest) |
| TuNegocio | [NoePerezBlancoo/TuNegocio](https://github.com/NoePerezBlancoo/TuNegocio) |
| DeleteGuard | [NoePerezBlancoo/DeleteGuard](https://github.com/NoePerezBlancoo/DeleteGuard) |
| BrokenLinkGuard | [NoePerezBlancoo/BrokenLinkGuard](https://github.com/NoePerezBlancoo/BrokenLinkGuard) |
| LeaverGuard | [NoePerezBlancoo/LeaverGuard](https://github.com/NoePerezBlancoo/LeaverGuard) |
| ForgeOps | [NoePerezBlancoo/ForgeOps](https://github.com/NoePerezBlancoo/ForgeOps) |
| Fivaki | [NoePerezBlancoo/Fitnex](https://github.com/NoePerezBlancoo/Fitnex) |

El código de los productos no se duplica dentro de este repositorio; cada uno conserva su repositorio, historial y despliegue independiente.

## Conservación del catálogo

`scripts/catalog-data.mjs` contiene el inventario completo y `scripts/showcase-content.mjs` sus contenidos. `npm run build` regenera portada, fichas, soporte y sitemap, y valida que las 20 entradas sigan presentes. Conserva también las guías y páginas legales de las apps Atlassian. No sustituir el catálogo por una selección de destacados.

Las imágenes originales de mayor tamaño se conservan sin pérdidas en `assets-source/`. El build las reconstruye en `dist/assets/` y verifica su tamaño y SHA-256. No se depende de una publicación anterior para recuperar los recursos.

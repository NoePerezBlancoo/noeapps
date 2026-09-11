# NoeApps

Código de la web pública [noeapps.com](https://noeapps.com). Este repositorio reúne el catálogo, las páginas de presentación, las imágenes y la documentación pública de los productos de Noé Pérez Blanco.

## Organización

| Carpeta | Contenido |
| --- | --- |
| `dist/` | Web estática completa, lista para publicar. Se versiona: también contiene páginas escritas directamente. |
| `dist/apps/` | Presentaciones de productos y documentación pública de DeleteGuard. |
| `dist/herramientas/` | Presentaciones de herramientas. |
| `dist/proyectos/` | Presentaciones de proyectos. |
| `dist/assets/` | Imágenes, capturas y fuentes, con sus licencias. |
| `scripts/` | Datos del catálogo, generador y comprobación de enlaces locales. |
| `docs/` | Mantenimiento, alojamiento y procedencia de los archivos. |
| `.openai/hosting.json` | Identidad del Site existente y directorio que se publica. No contiene credenciales. |

## Trabajar en la web

Requiere Node.js 22 o superior. No hay dependencias que instalar.

```sh
npm run check
npm run build
npm run check
```

Para previsualizar, con Python 3 instalado:

```sh
python -m http.server 8080 --directory dist
```

Abre `http://localhost:8080`. No abras los HTML directamente como archivos: los enlaces parten de la raíz del sitio.

Edita `scripts/catalog-data.mjs` y `scripts/showcase-content.mjs` para cambiar el catálogo. `scripts/build-showcase.mjs` contiene las plantillas y `scripts/build-catalog.mjs` es su punto de entrada. Las guías, condiciones y páginas legales de `dist/` conservan sus textos propios; el generador actualiza su navegación compartida. Los estilos se editan en `dist/*.css`.

**No borres `dist/` antes de generar:** incluye recursos y páginas que el generador no crea desde cero.

## Repositorios de las apps

| Producto | Código de la aplicación | Ejecución |
| --- | --- | --- |
| DeleteGuard | [DeleteGuard](https://github.com/NoePerezBlancoo/DeleteGuard) | Atlassian Forge / Jira |
| BrokenLinkGuard | [BrokenLinkGuard](https://github.com/NoePerezBlancoo/BrokenLinkGuard) | Atlassian Forge / Confluence |
| LeaverGuard | [LeaverGuard](https://github.com/NoePerezBlancoo/LeaverGuard) | Atlassian Forge / Jira |
| ForgeOps | [ForgeOps](https://github.com/NoePerezBlancoo/ForgeOps) | Infraestructura propia del SaaS |
| Fivaki | [Fitnex](https://github.com/NoePerezBlancoo/Fitnex) | Aplicación móvil e infraestructura del producto |

Cada app conserva su código, registro y despliegue. Este repositorio no despliega apps a Atlassian ni incluye sus datos de clientes. BrokenLinkGuard y LeaverGuard tienen repositorios propios; sus presentaciones todavía no forman parte de la web importada.

## Publicación

La web actual está alojada en **Sites de ChatGPT**, con el dominio `noeapps.com`. GitHub guarda y organiza el código, pero un push aquí **no publica automáticamente** en Sites. Consulta [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

La importación y sus límites están documentados en [docs/MIGRATION.md](docs/MIGRATION.md). Este repositorio público contiene solo el estado actual de la web y documentación de mantenimiento; no importa el historial anterior de otros repositorios.

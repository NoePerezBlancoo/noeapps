# Corrección de búsqueda: COCHES

Fecha: 28 de septiembre de 2026. Rama: `agent/catalog-roadmap-v2-safe`.

## Problema y cambio

La captura del propietario era reproducible: `COCHES` devolvía cero resultados. El vocabulario contenía `coche`, pero las equivalencias exigían coincidencia exacta y no contemplaban plurales. Las pruebas previas no cubrían este caso.

Se generan plurales regulares para el vocabulario controlado de negocios y estilos. Se añaden vehículo, automóvil, auto y concesionario, y variantes femeninas de varios estilos. Se conserva la intersección de palabras y filtros, así como precios, ordenación y selección editorial. El recurso JavaScript tiene una nueva versión en su URL para cargar la corrección al recargar la página.

## Archivos

- `catalogo/search-engine.js`: vocabulario y plurales.
- `catalogo/index.html`: versión del recurso del buscador.
- `catalogo/tests/search.test.js`: dos pruebas de regresión con singulares, plurales, acentos, filtros y consultas sin coincidencias.
- `docs/evidence/search-plurals-browser.json`: resultados observados del formulario en staging.
- `docs/evidence/search-coches-fixed.png`: captura del resultado corregido.
- Este informe.

## Migraciones, endpoints y variables

Ninguno nuevo. No se modifican migraciones aplicadas, datos, contratos API ni configuración de pagos.

## Validación

- Antes del arreglo: las dos pruebas nuevas fallaron; el navegador confirmó cero resultados para `COCHES`.
- Después: `npm test` en `catalogo` pasó las 12 pruebas; `npm run build` en `catalogo` comprobó la sintaxis del servidor y los scripts del navegador. El build completo de la raíz también pasó. `git diff --check` sin errores.
- Navegador en staging: coche, COCHES, vehículos, automóviles, autos y concesionarios devuelven los mismos 8 diseños visibles. El inventario completo contiene 17 coincidencias, pero la biblioteca pública conserva su selección editorial previa.
- `coches modernos`: 8 resultados; `bufetes sobrios`: 2; `cafeterías modernas`: 11; consulta inexistente: 0.
- `COCHES` combinado con categoría Legal: 0. Botón de recomendaciones: 3 tarjetas; volver a todos recupera 8.
- Recarga comprobada en la misma sesión de navegador, que inicialmente tenía la versión anterior. Captura revisada visualmente.

## Staging

URL: https://catalogo-staging-v2-production.up.railway.app/#biblioteca

Proyecto aislado: `e536099e-7546-4108-b827-18a4d49f748d`. Servicio: `2b7b78ca-0cb9-43ae-b6cc-4ee77b1015a1`. Despliegue: `519f6df4-a3d7-412e-8242-0afe5a44eba0`, estado `SUCCESS`, healthcheck superado. El servicio confirma modo `sandbox_test`.

## Riesgos y rollback

Las equivalencias siguen basándose en un vocabulario controlado y las categorías del catálogo: no cubren cualquier errata o expresión libre. Las reglas de plural son regulares y no constituyen un analizador lingüístico general. Una pestaña abierta necesita recargarse para ejecutar el nuevo código.

Rollback: restaurar únicamente el despliegue previo de este servicio aislado, `1ec347d6-1965-47b6-8611-fbf1e20b3084`, cuyo código corresponde a `4fdd0b32da2c8a1e5492cb8ddea3283008958c81`. No requiere rollback de datos ni migraciones. Esto recuperaría también el fallo de plurales anterior.

Producción intacta. Trabajo detenido en revisión de staging, sin merge ni publicación a producción.

# CRM: actualización al entrar y manual

Cambio preparado en `agent/catalog-roadmap-v2-safe`. Producción pendiente de la autorización específica del propietario: `SUBE A PRODUCCIÓN`.

## Comportamiento

- El CRM carga al entrar o iniciar sesión y al pulsar Actualizar. Los cambios guardados por el usuario siguen reflejándose tras guardar.
- Las incidencias se comprueban al entrar, al pulsar Actualizar o Comprobar ahora. Guardar una ficha no inicia un nuevo análisis de incidencias.
- Se eliminan el análisis de incidencias al arrancar, su intervalo de cinco minutos y la consulta inicial de comprobación del bridge de TuNegocio.
- La pantalla muestra la hora de actualización y avisa si la carga queda incompleta. Permite reintentar sin recargar toda la página.
- Las cargas simultáneas comparten una petición por recurso; Actualizar permanece deshabilitado hasta finalizar todos los paneles. También se agrupan comprobaciones de incidencias simultáneas.
- Se espera a cargar el script del panel antes de solicitar los datos, evitando perder la carga inicial del panel avanzado.

Los webhooks de Stripe y la tarea horaria de caducidad de previews continúan funcionando: mantienen los cobros y el acceso al servicio. No son refrescos periódicos del panel CRM.

## Archivos

- `catalogo/server.js`: retirada de las consultas CRM programadas y del sondeo inicial del bridge.
- `catalogo/crm.html`: carga coordinada, estado visible, reintento, inicio después del script avanzado.
- `catalogo/crm-roadmap-ui.js`: análisis de incidencias bajo demanda, integración con la carga principal, mensajes coherentes.
- Este informe y `docs/evidence/crm-on-demand-staging.json`: documentación y evidencia sin credenciales ni datos de clientes.

No hay migraciones, tablas, endpoints, variables nuevas ni cambios en contratos de API. No se modifica TuNegocio.

## Validación

- 15/15 pruebas existentes correctas; scripts de servidor y navegador compilan; `git diff --check` correcto.
- Railway staging aislado: despliegue `c9709288-4ffd-42ce-8931-9c5c45b30342`, estado SUCCESS.
- URL: https://catalogo-staging-v2-production.up.railway.app/crm.
- Navegador autenticado con datos sintéticos: carga al iniciar sesión, una petición por recurso ante tres actualizaciones simultáneas, error de red simulado visible y recuperación mediante reintento.
- Vista móvil de 390 px sin desbordamiento horizontal.
- La evidencia adjunta registra la observación de inactividad, la ausencia de nuevas consultas del navegador y que no cambió la última ejecución del detector durante ese intervalo. La retirada del temporizador de cinco minutos se verifica además en el diff; la observación corta no sustituye una prueba de larga duración.

## Riesgos y recuperación

Las cifras y las incidencias pueden quedar desactualizadas hasta la siguiente entrada o actualización manual. Es el comportamiento solicitado. Abrir el CRM en varias pestañas o por varios usuarios puede generar una carga por entrada; no hay caché compartida entre sesiones.

Rollback: volver al código anterior (`6a412ab`) y redesplegar el servicio afectado. No requiere restaurar ni transformar datos. Ese rollback recuperaría las comprobaciones periódicas anteriores.

Se detiene el flujo en staging/revisión. No se ha desplegado esta mejora en producción ni modificado su configuración, Stripe LIVE o DNS.

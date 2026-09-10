// Copy grounded in the reviewed repositories and their published demos.
// Concept illustrations describe a field of work; they are never product screenshots.
export const showcase = {
  forgeops: {
    image:'forgeops-dashboard.webp', alt:'Panel de ForgeOps con órdenes de trabajo, preventivos e indicadores de una planta de demostración.', caption:'Captura real de ForgeOps · Entorno de demostración.',
    short:['Activos y órdenes de trabajo','Mantenimiento preventivo','Visión de la actividad de planta'],
    heading:'Una visión común para el trabajo de mantenimiento.',
    benefits:[['Cada equipo, en contexto','Reúne la información de los activos y relaciona el trabajo con el equipo al que pertenece. Un punto de partida para consultar antes de intervenir.'],['De la incidencia a la intervención','Organiza las órdenes de trabajo, sigue su estado y deja constancia de la actividad. El equipo puede entender qué está pendiente y qué se ha realizado.'],['Planifica lo que viene','Explora la planificación preventiva y los indicadores del panel para preparar el trabajo antes de que llegue el siguiente turno.']],
    audience:'Responsables de mantenimiento y equipos técnicos que necesitan organizar activos, intervenciones y revisiones preventivas en una planta.',
    example:'Un equipo necesita una revisión. Localizas el activo, preparas la orden de trabajo y sigues la intervención. El panel reúne la actividad para facilitar el seguimiento.',
    steps:['Sitúa el trabajo en el activo correspondiente.','Organiza la intervención y consulta su estado.','Revisa el resultado y la planificación preventiva.'],
    flow:['Activo','Orden de trabajo','Seguimiento'],
    gallery:[['forgeops-work-order.webp','Detalle de una orden de trabajo en la demo de ForgeOps.'],['forgeops-preventive.webp','Planificación preventiva con datos de demostración.']],
    faq:[['¿Puedo verlo antes de solicitar una presentación?','Sí. La página de demo reúne un recorrido del producto para conocer sus pantallas y su forma de organizar el mantenimiento.'],['¿Sirve para valorar mi caso de planta?','La demo permite una primera aproximación. Para revisar equipos, procesos, usuarios o integraciones concretas, solicita una presentación y explica cómo trabajáis actualmente.'],['¿Los datos de las imágenes son de un cliente?','No. Las capturas proceden del entorno de demostración de ForgeOps y muestran datos de ejemplo.']]
  },
  deleteguard: {
    image:'deleteguard-history.png',alt:'Historial de DeleteGuard con incidencias de prueba eliminadas y sus metadatos.',caption:'Captura real de DeleteGuard · Incidencias de prueba.',
    short:['Historial de eliminaciones','Búsqueda por contexto','Integrado en Jira Cloud'],
    heading:'Recupera contexto cuando una incidencia desaparece.',
    benefits:[['Consulta qué se eliminó','Revisa el registro de las incidencias que la aplicación haya capturado: clave, resumen, proyecto y momento de la eliminación.'],['Localiza el registro que buscas','Utiliza la búsqueda para acotar el historial y encontrar referencias sin revisar manualmente toda la lista.'],['Investiga con más información','Consulta quién realizó la eliminación cuando esa información esté disponible. Un apoyo para responder a las consultas del equipo.']],
    audience:'Administradores de Jira Cloud y equipos de soporte que necesitan consultar el contexto de las incidencias eliminadas.',
    example:'Alguien pregunta por una incidencia que ya no aparece en Jira. Buscas su clave o una parte del resumen en DeleteGuard y consultas la información registrada al eliminarla.',
    steps:['Abre DeleteGuard desde tu instalación de Jira.','Actualiza el historial y busca la referencia.','Consulta los metadatos disponibles del registro.'],
    flow:['Eliminación en Jira','Registro','Consulta'],
    gallery:[['deleteguard-search.png','Búsqueda de una incidencia de prueba en el historial.']],
    access:'DeleteGuard está en revisión en Atlassian Marketplace. Puedes consultar la guía y escribirnos para conocer su disponibilidad.',cta:'Ver cómo funciona',url:'/apps/deleteguard/ayuda/',
    faq:[['¿Restaura las incidencias eliminadas?','No. DeleteGuard conserva información de contexto sobre las eliminaciones registradas. No es una copia de seguridad ni restaura la incidencia original.'],['¿Aparecen eliminaciones anteriores a la instalación?','No recupera retroactivamente las incidencias eliminadas antes de que la aplicación estuviera instalada y pudiera registrar sus eventos.'],['¿Puedo instalarlo ya desde Marketplace?','La aplicación está en revisión. Publicaremos el acceso a la ficha de Marketplace cuando esté disponible. Mientras tanto puedes consultar la guía y los documentos del producto.']]
  },
  fivaki: {
    image:'fivaki-icon.webp',alt:'Identidad visual de Fivaki.',caption:'Identidad visual de Fivaki · Consulta la experiencia en la beta Android.',brand:true,
    short:['Hábitos y objetivos','Progreso gamificado','Beta para Android'],
    heading:'Haz espacio para la constancia.',
    benefits:[['Pon tus hábitos en primer plano','Reúne las acciones y objetivos personales que quieres tener presentes en tu día a día.'],['Da sentido a cada avance','Explora una experiencia gamificada que acompaña el progreso y aporta una forma visual de seguir tu actividad.'],['Participa desde el principio','Prueba la beta Android y comparte cómo encaja en tu rutina. Las primeras experiencias ayudan a orientar la evolución del producto.']],
    audience:'Personas que quieren dar continuidad a sus hábitos y les interesa una experiencia de bienestar con progreso y gamificación.',
    example:'Eliges una rutina que quieres mantener y utilizas Fivaki como punto de consulta para seguir tu actividad y explorar tu progreso a lo largo de la prueba.',
    steps:['Consulta la presentación y las condiciones de la beta.','Accede a la versión Android desde la web oficial.','Prueba la experiencia y comparte tus observaciones.'],
    flow:['Hábitos','Actividad','Progreso'],
    faq:[['¿Está disponible para iPhone?','Por ahora la prueba disponible es para Android. La versión para iOS todavía no está disponible.'],['¿Es una versión definitiva?','No. Está en fase beta y puede cambiar. Revisa las indicaciones publicadas en la web de Fivaki antes de instalarla.'],['¿Dónde se descarga?','El botón «Conocer la beta» lleva a la web del proyecto, donde se publica la información actual de acceso y descarga.']]
  },
  'pequeno-comercio': {
    image:'comercio-panel.png',alt:'Panel de Pequeño Comercio con ventas, inventario, agenda y clientes de demostración.',caption:'Captura real de Pequeño Comercio · Negocio de demostración.',
    short:['Ventas e inventario','Agenda y clientes','Panel del negocio'],
    heading:'La operativa de tu negocio, más cerca.',
    benefits:[['Consulta lo que ocurre','Un panel de trabajo reúne información de la actividad para empezar el día con una visión del negocio.'],['Relaciona productos y ventas','Explora el inventario y el registro de ventas desde una misma aplicación, con atención a las necesidades del pequeño comercio.'],['Da espacio a tus clientes','La agenda y la gestión de clientes acompañan las tareas comerciales para que puedas valorar el recorrido completo de atención.']],
    audience:'Pequeños negocios que quieren reunir inventario, ventas y atención al cliente y buscan evaluar una alternativa a la información repartida entre varias herramientas.',
    example:'Empiezas consultando el panel, revisas productos con poco stock y preparas la actividad del día en la agenda. La demo permite recorrer estos apartados con un negocio de ejemplo.',
    steps:['Revisa el panel y el estado de los productos.','Explora las ventas y la información de clientes.','Organiza la actividad prevista en la agenda.'],
    flow:['Productos','Ventas','Visión del negocio'],
    gallery:[['comercio-agenda.png','Vista de agenda en el negocio de demostración.']],
    faq:[['¿Puedo usarlo ya como sistema principal de mi negocio?','La demo está en validación. Primero conviene revisar tus procesos y comprobar el encaje del producto en una presentación.'],['¿Cómo puedo ver la demo?','Solicítala por correo indicando el tipo de negocio y las tareas que más te interesa revisar. Prepararemos el recorrido a partir de ese contexto.'],['¿Las imágenes incluyen información de clientes reales?','No. Las capturas seleccionadas pertenecen a un negocio de demostración.']]
  },
  'quitar-fondo': {
    image:'creative-tools.png',alt:'Ilustración de herramientas creativas con una imagen de una hoja y elementos de audio.',caption:'Ilustración conceptual · Herramientas para preparar contenido visual.',concept:true,
    short:['Selección de imagen','Fondo automático','Resultado para componer'],heading:'Del archivo original a una imagen lista para trabajar.',
    benefits:[['Elige la imagen','Abre el archivo que quieres preparar desde una interfaz de escritorio.'],['Separa el protagonista','Aplica la eliminación automática del fondo y revisa cómo queda el contorno del elemento principal.'],['Continúa tu composición','Utiliza el resultado en el material que estés preparando, revisando los detalles antes de publicarlo.']],
    audience:'Creadores y pequeños negocios que preparan imágenes de producto, composiciones o materiales para redes y catálogos.',
    example:'Tienes una fotografía de un objeto y quieres situarlo sobre otro fondo. La herramienta permite preparar el recorte para continuar después con la composición.',
    steps:['Selecciona una imagen adecuada.','Procesa el fondo y revisa el resultado.','Prepara el archivo para tu siguiente composición.'],flow:['Imagen','Recorte','Composición'],
    faq:[['¿Puedo subir una imagen aquí?','Esta página presenta la herramienta. El procesamiento se realiza desde la aplicación de escritorio; solicita acceso para conocer su instalación.'],['¿El resultado es siempre perfecto?','El resultado depende de la imagen. Los bordes finos, transparencias y fondos complejos pueden necesitar una revisión posterior.'],['¿Cómo consigo la herramienta?','Escribe indicando tu sistema operativo y el uso que tienes en mente para consultar la versión y los requisitos disponibles.']]
  },
  'texto-audio': {
    image:'creative-tools.png',alt:'Ilustración de un altavoz y una onda de sonido junto a herramientas creativas.',caption:'Ilustración conceptual · Del contenido escrito al audio.',concept:true,
    short:['Texto a voz','Reproducción integrada','Aplicación de escritorio'],heading:'Escucha lo que has escrito.',
    benefits:[['Parte de tu contenido','Introduce el texto que quieres convertir desde la aplicación.'],['Genera una versión hablada','Utiliza la conversión a voz para explorar otra forma de consumir o revisar el contenido.'],['Revisa escuchando','Reproduce el resultado desde la interfaz y comprueba si encaja con el uso que tienes previsto.']],
    audience:'Personas que quieren escuchar textos, revisar contenidos en voz alta o explorar materiales en formato de audio.',
    example:'Preparas un texto breve y quieres escucharlo antes de compartirlo. Lo conviertes a voz y revisas la reproducción desde la aplicación.',
    steps:['Prepara el texto que quieres escuchar.','Solicita la conversión a voz.','Reproduce y revisa el audio generado.'],flow:['Texto','Conversión','Audio'],
    faq:[['¿Funciona sin conexión?','La conversión utiliza un servicio de voz en línea, por lo que requiere conexión.'],['¿Puedo usar textos confidenciales?','Antes de introducir información confidencial hay que revisar el servicio utilizado y sus condiciones. No debe asumirse que la conversión se realiza exclusivamente en tu equipo.'],['¿Dónde consulto idiomas y requisitos?','Solicita acceso indicando el idioma, el sistema operativo y el uso previsto. Así podemos revisar las opciones de la versión disponible.']]
  },
  'descargas-multimedia': {
    image:'creative-tools.png',alt:'Ilustración de elementos de imagen, sonido y reproducción multimedia.',caption:'Ilustración conceptual · Organización de contenido multimedia.',concept:true,
    short:['Consulta por dirección','Audio y vídeo','Destino de descarga'],heading:'Un recorrido claro para guardar tu contenido.',
    benefits:[['Consulta antes de descargar','Introduce la dirección de un recurso para consultar la información multimedia disponible.'],['Elige el tipo de contenido','Revisa las opciones de audio o vídeo que admite cada fuente antes de iniciar la descarga.'],['Localiza el archivo','Selecciona la ubicación de destino y abre la carpeta para continuar trabajando con el material.']],
    audience:'Personas que necesitan guardar y organizar contenido propio o para el que cuentan con permiso de descarga.',
    example:'Necesitas conservar una copia de un vídeo propio. Consultas el recurso, revisas las opciones disponibles y eliges dónde guardarlo en tu equipo.',
    steps:['Introduce una dirección compatible y autorizada.','Revisa el contenido y las opciones disponibles.','Descarga y abre la ubicación del archivo.'],flow:['Dirección','Opciones','Archivo'],
    faq:[['¿Puedo descargar cualquier vídeo?','No. Utiliza la herramienta únicamente con contenido propio o con autorización, respetando las condiciones de la fuente.'],['¿Todas las plataformas son compatibles?','La compatibilidad depende de cada servicio y puede cambiar. Consulta primero las fuentes y opciones que necesitas.'],['¿Las descargas se hacen desde NoeApps.com?','No. Esta ficha presenta una herramienta de uso local. Solicita acceso para revisar su instalación y requisitos.']]
  },
  iagentes: {
    image:'connected-work.png',alt:'Ilustración de bloques conectados con documentos y engranajes.',caption:'Ilustración conceptual · Agentes y tareas conectadas.',concept:true,
    short:['Conversaciones','Instrucciones configurables','Experimentación con IA'],heading:'Prueba una idea de asistente antes de ampliarla.',
    benefits:[['Define el punto de partida','Configura instrucciones para explorar cómo debería responder un agente ante una tarea concreta.'],['Conversa y observa','Envía mensajes y revisa las respuestas en una interfaz de conversación.'],['Aprende de cada prueba','Utiliza el prototipo para estudiar el comportamiento y concretar qué haría falta en una adaptación.']],
    audience:'Equipos y profesionales que quieren explorar asistentes de IA y necesitan una demostración para concretar un posible caso de uso.',
    example:'Quieres estudiar un asistente para orientar una consulta. Preparas instrucciones, pruebas preguntas representativas y revisas dónde aporta valor y dónde necesita ajustes.',
    steps:['Acota la tarea y las instrucciones.','Prueba conversaciones representativas.','Evalúa los resultados antes de ampliar el uso.'],flow:['Instrucciones','Conversación','Evaluación'],
    faq:[['¿Es un servicio de IA listo para contratar?','Es un prototipo para demostraciones y estudio de adaptaciones. El alcance y las condiciones se concretan antes de dar acceso.'],['¿Requiere un proveedor de IA?','Sí. El entorno necesita configurar el proveedor y las credenciales correspondientes. El uso de ese servicio puede tener costes propios.'],['¿Las respuestas se pueden utilizar sin revisión?','Las respuestas de IA pueden contener errores. La demostración debe incluir revisión humana y ejemplos adecuados al caso que se quiere estudiar.']]
  },
  'automatizaciones-n8n': {
    image:'connected-work.png',alt:'Ilustración de documentos, engranajes e indicadores unidos por conexiones.',caption:'Ilustración conceptual · Flujos que conectan herramientas y tareas.',concept:true,
    short:['Revisión del proceso','Conexión de herramientas','Adaptación de flujos'],heading:'Empieza por una tarea que se repite.',
    benefits:[['Identifica el recorrido','Describe qué inicia la tarea, qué herramientas intervienen y qué resultado necesitas.'],['Encuentra una base útil','Revisa referencias y flujos que puedan servir como punto de partida para tu caso.'],['Adapta y valida','Comprueba conexiones, datos y excepciones antes de poner una propuesta en funcionamiento.']],
    audience:'Negocios y profesionales con tareas repetitivas entre varias aplicaciones que quieren estudiar una automatización concreta.',
    example:'Una tarea empieza en una herramienta y termina con un aviso o un registro en otra. Revisamos ese recorrido para identificar qué pasos se pueden conectar y qué controles necesita.',
    steps:['Describe la tarea y las aplicaciones implicadas.','Revisa una propuesta de flujo y sus requisitos.','Valida el resultado con ejemplos controlados.'],flow:['Evento','Proceso','Resultado'],
    faq:[['¿Todos los flujos están creados por NoeApps?','No. La colección incluye referencias de la comunidad y de terceros. Cada adaptación debe respetar la autoría y la licencia de los componentes utilizados.'],['¿Se instalan automáticamente al contactar?','No. Primero se revisan el proceso, las conexiones, los permisos y el entorno donde se ejecutaría el flujo.'],['¿Qué información debo enviar?','Explica la tarea que repites, qué aplicaciones utilizas y qué resultado buscas. No incluyas contraseñas ni claves de acceso en el correo.']]
  },
  tuanuncio: {
    image:'tuanuncio-billboard.png',alt:'Imagen de una valla publicitaria junto a una carretera, utilizada en la demo de TuAnuncio.',caption:'Imagen de presentación de TuAnuncio · Ubicación ilustrativa.',concept:true,
    short:['Exploración de ubicaciones','Presentación de campañas','Experiencia web'],heading:'Una idea de producto para la publicidad exterior.',
    benefits:[['Presenta el espacio','Una experiencia visual ayuda a comprender el tipo de soporte publicitario que se está explorando.'],['Facilita el recorrido','Organiza la navegación alrededor de ubicaciones y campañas para acercar la propuesta al visitante.'],['Concreta una conversación','La demo sirve como punto de partida para estudiar un producto digital adaptado a este sector.']],
    audience:'Personas interesadas en explorar cómo podría presentarse y consultarse una oferta de publicidad exterior desde una web.',
    example:'Un visitante quiere entender las opciones de una campaña. Recorre una presentación de espacios ilustrativos y utiliza la experiencia para concretar lo que necesitaría consultar.',
    steps:['Visita la demo del proyecto.','Explora la presentación de espacios.','Comenta cómo adaptarías el recorrido a un caso real.'],flow:['Ubicación','Campaña','Consulta'],
    faq:[['¿Las ubicaciones están disponibles para contratar?','No se confirma disponibilidad real. Las ubicaciones de esta demo son ilustrativas.'],['¿Puedo reservar o pagar una campaña?','La demo es conceptual y no permite contratar ni pagar campañas reales.'],['¿Se puede estudiar una adaptación?','Sí. Puedes contactar para comentar el catálogo, el tipo de cliente y el proceso de consulta que necesitaría un proyecto real.']]
  },
  tugta: {
    image:'creative-tools.png',alt:'Ilustración de medios visuales y contenidos digitales.',caption:'Ilustración editorial · Visita TuGTA para ver la web real.',concept:true,
    short:['Actualidad GTA','Lectura y descubrimiento','Medio independiente'],heading:'Contenido pensado para una comunidad concreta.',
    benefits:[['Una temática reconocible','La web centra su propuesta editorial en noticias y contenidos del universo Grand Theft Auto.'],['Descubre y lee','Explora una experiencia de publicación orientada a encontrar contenidos y continuar la lectura.'],['Un proyecto en abierto','Puedes visitar la web y conocer directamente su presentación, organización y enfoque editorial.']],
    audience:'Lectores interesados en GTA y personas que quieren conocer un ejemplo de medio digital especializado.',
    example:'Entras para consultar contenidos del universo GTA y recorres las publicaciones de un medio centrado en una temática que conoces.',
    steps:['Visita la web pública.','Explora los contenidos disponibles.','Abre las publicaciones que te interesen.'],flow:['Actualidad','Descubrimiento','Lectura'],
    faq:[['¿Es una web oficial de GTA?','No. TuGTA es un proyecto editorial independiente, sin afiliación con los titulares de la saga.'],['¿Se puede visitar ahora?','Sí. El botón «Visitar TuGTA» abre la web pública del proyecto.'],['¿Puedo consultar sobre un proyecto editorial similar?','Sí. Puedes contactar para explicar el tipo de contenido, público y experiencia que te gustaría desarrollar.']]
  },
  'noticias-tcg': {
    image:'creative-tools.png',alt:'Ilustración de herramientas visuales para un proyecto de contenido digital.',caption:'Ilustración editorial · La web pública muestra el contenido del proyecto.',concept:true,
    short:['Noticias de TCG','Información de cartas','Referencias de precios'],heading:'Contenido y consulta para explorar los juegos de cartas.',
    benefits:[['Sigue la temática','Encuentra contenidos centrados en el mundo de los juegos de cartas coleccionables.'],['Consulta información','Explora referencias sobre cartas dentro de una experiencia que combina publicación y consulta.'],['Amplía el contexto','Utiliza las referencias de precios como información orientativa y contrástalas antes de tomar una decisión.']],
    audience:'Aficionados a los TCG que disfrutan leyendo sobre cartas y consultando información relacionada con sus juegos.',
    example:'Lees una noticia y continúas explorando información sobre cartas. El proyecto reúne el contenido editorial y la consulta en una misma web.',
    steps:['Abre la web del proyecto.','Explora noticias e información de cartas.','Contrasta las referencias que quieras utilizar.'],flow:['Noticias','Cartas','Consulta'],
    faq:[['¿Es una tienda de cartas?','La propuesta presentada es un portal de contenido y consulta. Las referencias de precios no son una oferta de compraventa.'],['¿Los precios son definitivos?','No. Pueden variar según la fuente, el momento y las características de cada carta.'],['¿La web está disponible?','Sí. Puedes visitarla desde esta ficha para conocer sus contenidos y su experiencia de consulta.']]
  },
  'itflow-manager': {
    image:'industrial-systems.png',alt:'Ilustración de infraestructura, equipos y conexiones de sistemas.',caption:'Ilustración conceptual · Gestión y mantenimiento de sistemas IT.',concept:true,
    short:['Procesos de soporte','Mantenimiento de sistemas','Aplicación de gestión'],heading:'Un caso de portfolio sobre la organización del soporte.',
    benefits:[['Acerca el proceso al equipo','Explora una aplicación orientada a la gestión del soporte y el mantenimiento de sistemas.'],['Relaciona tareas y recursos','Estudia cómo una herramienta de gestión puede dar contexto al trabajo de servicio IT.'],['Conversa sobre tu operativa','Utiliza la presentación del proyecto como base para identificar qué información y recorridos necesita tu equipo.']],
    audience:'Personas interesadas en aplicaciones de gestión IT y equipos que quieren comentar un posible flujo de soporte.',
    example:'Un equipo quiere ordenar su operativa de soporte. El proyecto sirve para recorrer una propuesta de gestión y discutir cómo encajarían sus procesos.',
    steps:['Explica cómo se organiza el soporte actualmente.','Consulta una presentación del proyecto.','Identifica qué partes requerirían una adaptación.'],flow:['Soporte','Organización','Seguimiento'],
    faq:[['¿Hay una edición comercial abierta?','No se ofrece una edición comercial abierta desde esta página. Se presenta como proyecto de portfolio.'],['¿Cómo puedo conocerlo con más detalle?','Solicita una presentación e indica qué parte de la gestión IT te interesa explorar.'],['¿Se puede adaptar a mi equipo?','Es posible estudiar una adaptación. Primero hay que revisar el alcance, el entorno y los requisitos de tu operativa.']]
  },
  opsdesk: {
    image:'connected-work.png',alt:'Ilustración de documentos e indicadores conectados para representar el seguimiento de trabajo.',caption:'Ilustración conceptual · Atención y seguimiento de incidencias.',concept:true,
    short:['Tickets y prioridades','Asignación y comentarios','Actividad y métricas'],heading:'Sigue el recorrido completo de una incidencia.',
    benefits:[['Registra y clasifica','Da contexto al aviso con su estado y prioridad para facilitar el seguimiento del trabajo.'],['Coordina la atención','Explora la asignación y los comentarios como parte de la conversación que acompaña cada ticket.'],['Observa el avance','Consulta el histórico y las métricas del prototipo para estudiar cómo se refleja la actividad del equipo.']],
    audience:'Equipos de soporte y operaciones que quieren conocer un prototipo de Service Desk y valorar un flujo de atención.',
    example:'Se registra un aviso, se asigna a una persona y se añaden comentarios durante la atención. El histórico permite seguir la evolución del ticket.',
    steps:['Crea y clasifica el ticket.','Asigna la atención y registra comentarios.','Consulta el histórico y el estado del trabajo.'],flow:['Ticket','Atención','Seguimiento'],
    faq:[['¿Qué estado tiene el proyecto?','Es un prototipo funcional y demostrativo. Una presentación permite conocer su alcance antes de estudiar un uso real.'],['¿Hay una demo pública sin registro?','Desde esta ficha se solicita una presentación. El acceso y las condiciones se concretan directamente.'],['¿Puedo plantear mi flujo de soporte?','Sí. Explica cómo entran los avisos, quién los atiende y qué seguimiento necesita el equipo.']]
  },
  edulabops: {
    image:'connected-work.png',alt:'Ilustración de servicios y procesos representados por módulos conectados.',caption:'Ilustración conceptual · Servicios y tareas en operación.',concept:true,
    short:['Servicios coordinados','Tareas en segundo plano','Observación de actividad'],heading:'Entiende qué pasa mientras una aplicación trabaja.',
    benefits:[['Observa los servicios','Estudia cómo se relacionan distintos componentes de una aplicación.'],['Sigue las tareas','Explora procesos que continúan en segundo plano y cómo se puede conocer su estado.'],['Evalúa decisiones','Utiliza un entorno demostrativo para conversar sobre arquitectura, funcionamiento y mantenimiento.']],
    audience:'Personas que aprenden o trabajan con software y quieren explorar servicios, procesos y observación de actividad en un laboratorio.',
    example:'Una acción inicia una tarea que tarda en completarse. El laboratorio permite estudiar el recorrido y cómo observar lo que está haciendo cada parte.',
    steps:['Revisa el recorrido de una tarea.','Observa qué servicios intervienen.','Consulta cómo se sigue su ejecución.'],flow:['Solicitud','Tarea','Observación'],
    faq:[['¿Es una plataforma comercial?','Se presenta como laboratorio técnico y entorno demostrativo.'],['¿Necesito conocimientos técnicos?','Para profundizar en su arquitectura resultan útiles. Una presentación guiada puede adaptar el recorrido a tu experiencia.'],['¿Cómo puedo ver el laboratorio?','Escribe indicando si te interesan los servicios, las tareas en segundo plano o el seguimiento de su actividad.']]
  },
  'laboratorio-industrial': {
    image:'industrial-systems.png',alt:'Ilustración de un servidor, sensores y controladores unidos por conexiones.',caption:'Ilustración conceptual · De las señales industriales a la supervisión.',concept:true,
    short:['Señales simuladas','Histórico de datos','Panel de supervisión'],heading:'Sigue el viaje de un dato industrial.',
    benefits:[['Parte de una señal','Explora señales de máquina, estados y alarmas generados en un entorno de simulación.'],['Construye un histórico','Observa el recorrido de recogida y almacenamiento de la información.'],['Llega al panel','Consulta cómo los datos se presentan en una interfaz web de supervisión.']],
    audience:'Profesionales y estudiantes de industria, automatización e IT que quieren estudiar la conexión entre señales y aplicaciones de supervisión.',
    example:'Cambia el estado de una máquina simulada. El laboratorio recoge la señal, la guarda y la presenta en el panel para seguir el recorrido completo.',
    steps:['Genera una señal en el entorno simulado.','Sigue su recogida y almacenamiento.','Consulta el histórico y la visualización web.'],flow:['Señal','Histórico','Panel'],
    faq:[['¿Está conectado a una planta real?','El entorno presentado utiliza señales simuladas. No debe confundirse con una instalación productiva.'],['¿Se puede estudiar una conexión con equipos reales?','Sí, como un proyecto distinto que requiere revisar equipos, protocolos, acceso y condiciones de operación.'],['¿Qué puedo solicitar?','Una presentación del recorrido de los datos y una conversación sobre el caso industrial que te interesa explorar.']]
  }
};

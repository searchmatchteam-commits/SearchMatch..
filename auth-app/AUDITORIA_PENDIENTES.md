# Auditoría de pendientes · SearchMatch

Fecha: 2026-11-08 · Rama `main` (commit `34aa4e4`) · Auditoría estática: se leyó el código, no se ejecutó la app.

## 1. Stack y estructura

- **Backend:** Node.js ≥ 18 + Express 5, MVC (`routes/` → `controllers/` → `models/`), vistas EJS renderizadas en servidor, formularios POST clásicos + algo de `fetch`.
- **Datos:** PostgreSQL de Supabase vía `pg` (consultas parametrizadas), Supabase Auth para jugadores (correo/contraseña + Google OAuth). El panel tiene su propia sesión (`admin_sesion`, cookie `sm_admin`).
- **Esquema:** no hay migraciones versionadas. Está en `sql/searchmatch.sql` (base, **escrita en sintaxis MySQL**), `sql/nuevas_tablas.sql` (cambios incrementales de Postgres por secciones F8, SA-1…SA-7, EQ-UB), `sql/seed.sql` y `sql/completar_perfil.sql`. Se aplican con `scripts/ejecutar-sql.js`.
- **Módulos:** auth/cuenta/legal, jugador (carta), equipos (plantel, alineación, solicitudes, invitaciones, capitanía), desafíos y matchmaking, canchas y reservas, partidos y agenda, notificaciones, torneos (jugador + panel), panel `/admin` (`routes/adminRoutes.js`).
- **Tareas programadas:** `models/tareasProgramadas.js` (un `setInterval` por minuto en el proceso). Hoy solo cierra torneos vencidos.
- **Tests:** `node --test` con 4 archivos (`test/`): reglas puras de torneos, listados/CSV, rendimiento y el fondo animado. No hay tests de rutas, permisos ni base de datos.

## 2. Conteo

| Módulo | ✅ Completa | 🟡 Parcial | ❌ No existe | Total |
|---|---:|---:|---:|---:|
| Torneos | 9 | 9 | 10 | 28 |
| Partidos | 1 | 0 | 3 | 4 |
| Perfil y equipos | 3 | 0 | 1 | 4 |
| Inicio, agenda y notificaciones | 2 | 0 | 5 | 7 |
| Panel de administración | 6 | 9 | 18 | 33 |
| **Total** | **21** | **18** | **37** | **76** |

> "Completa" significa que hay UI, backend y datos conectados en el código. No reemplaza una prueba manual contra los criterios de aceptación de Trello, que no están en el repositorio.

## 3. Detalle por módulo

### Torneos

| Código | Historia | Estado | Evidencia (archivos) | Qué falta |
|---|---|---|---|---|
| TO-001 | Crear un torneo | ✅ | `routes/adminRoutes.js` (`POST /admin/torneos`), `controllers/adminTorneosController.js` (`crear`, `revisar`), `middlewares/validadoresAdmin.js` (`validarTorneo`, `subirImagenesTorneo`), `models/torneoModel.js` (`crear`), `config/torneos.js`, `views/admin/torneo-form.ejs`, `test/torneos-reglas.test.js` | Nace en Borrador. Valida cupos, fechas, niveles, recinto/canchas, foto y patrocinadores. |
| TO-002 | Precio de inscripción y medios de pago | ✅ | `adminTorneosController.js` (`revisar`, `renderFormulario`), `config/torneos.js` (`aUSD`, `MEDIOS_PAGO`), `pasarelaModel.habilitadas`, restricción `torneo_medios_check` en `sql/nuevas_tablas.sql` | Solo se configura. Cobrar no existe (ver TO-019…022). |
| TO-003 | Editar un torneo | ✅ | `adminTorneosController.js` (`editar`, `aplicarRestricciones`), `torneoModel.editar`, `config/torneos.js` (`camposEditables`) | Campos bloqueados según el estado, el cupo solo crece, la fecha límite solo se extiende, se notifica a los inscritos. |
| TO-004 | Publicar y abrir inscripciones | ✅ | `adminTorneosController.publicar`, `torneoModel.publicar` | Comprueba datos completos, medios activos y fecha. Notifica a los capitanes compatibles. |
| TO-005 | Cerrar inscripciones | ✅ | `adminTorneosController.cerrar`, `torneoModel.cerrarInscripciones` / `cerrarVencidos`, `models/tareasProgramadas.js`, `models/alertaModel.js` | Cierre manual y automático por fecha. Si no se llega al cupo mínimo, queda una alerta. |
| TO-006 | Gestionar inscripciones y retirar equipos | 🟡 | `POST /admin/torneos/:id/equipos/:idEquipo/quitar`, `torneoModel.quitarEquipo`, `views/admin/torneo.ejs` | Solo saca equipos **sin pago aprobado** (`'con-pago'` → "fase 4"). Falta gestionar los estados `pendiente_pago`, `retiro_pendiente` y `reembolsada`, y quitar equipos una vez cerradas las inscripciones. |
| TO-007 | Generar el fixture | 🟡 | `adminTorneosController.empezar`, `torneoModel.empezar`, `config/torneos.js` (`fixtureLiga`, `primeraRondaLlave`) | Funciona en liga y en eliminación directa solo con 4/8/16/32 equipos. **Faltan los byes** (otras cantidades) y **todo el formato "grupos"** (devuelve `'grupos'` / `'byes'`). El formulario deja crear torneos de grupos que después no se pueden empezar. |
| TO-008 | Reprogramar un partido del torneo | ❌ | — (`torneo_partido` no tiene fecha, hora ni cancha: `sql/nuevas_tablas.sql` SA-3) | Todo: columnas de fecha/hora/cancha, la reserva de cancha, UI, endpoint y notificación. |
| TO-009 | Registrar resultado de un partido del torneo | 🟡 | `POST /admin/torneos/:id/partidos/:idPartido`, `adminTorneosController.registrarResultado`, `torneoModel.registrarResultado` | Funciona en liga y llave (penales). En la llave solo se puede editar la última ronda. Falta el formato grupos. No notifica a los equipos. Los capitanes no pueden informar el resultado (solo el panel). |
| TO-010 | Actualizar tabla de posiciones y llaves | 🟡 | `config/torneos.js` (`tablaLiga`), el avance de ronda en `torneoModel.registrarResultado`, `views/partials/torneo-llave.ejs`, `torneo-competencia.ejs`, `torneo-cuadrante.ejs` | La tabla se calcula al vuelo y la llave avanza sola. Faltan las tablas por grupo y el paso de grupos a llave. Requiere prueba manual de los desempates. |
| TO-011 | Finalizar torneo y declarar campeón | 🟡 | `torneoModel.registrarResultado` (fija `estado='finalizado'` e `id_campeon`), modal de victoria en `controllers/torneoController.detalle` | Es automático al cargar el último resultado. No hay acción explícita de "Finalizar", ni confirmación, ni notificación a los equipos, ni registro en actividad específico de la finalización. |
| TO-012 | Cancelar un torneo | ❌ | Solo existe el estado `cancelado` y la columna `cancelado_en` (`sql/nuevas_tablas.sql` SA-7) y el texto en `config/torneos.js` | Endpoint, UI, motivo, notificación y reembolsos en cascada. Hoy solo se puede **eliminar** (`torneoModel.eliminar`), y eso se bloquea si hay pagos. |
| TO-013 | Configurar pasarelas de pago | ✅ | `controllers/adminConfigController.js`, `models/pasarelaModel.js`, `models/pasarelasApi.js` (`probarConexion`), `config/pasarelas.js`, `config/cifrado.js` (AES-256-GCM), `views/admin/pasarelas.ejs`, tabla `pasarela_config` | **Requiere prueba manual** con credenciales reales de integración/sandbox y `PASARELAS_CLAVE` en `.env`. |
| TO-014 | Reembolsar una inscripción | ❌ | Solo estados en `torneo_pago` (`reembolso_solicitado`, `reembolsado`, `reembolso_fallido`, `monto_reembolso`) | Todo: llamadas de reembolso a las 3 APIs, UI en el panel, reglas de monto y plazo. |
| TO-015 | Consultar recaudación y pagos del torneo | 🟡 | `torneoModel` (`recaudado`, `pagos_aprobados` desde `torneo_pago`), columna "Recaudación" en el listado y el CSV (`adminTorneosController.COLUMNAS_CSV`) | La suma existe, pero no hay listado de pagos por torneo, ni detalle de cada pago, ni comprobantes. Hoy siempre da 0, porque nada inserta en `torneo_pago`. |
| TO-016 | Explorar torneos | ✅ | `GET /torneos`, `torneoController.listar`, `torneoModel.listar`, `views/torneos.ejs`, `public/js/torneos-lista.js` | Los filtros son del lado del cliente (pestañas y select). Requiere prueba manual. |
| TO-017 | Consultar detalle de un torneo | ✅ | `GET /torneos/:id`, `torneoController.detalle`, `views/torneos/detalle.ejs`, `views/partials/torneo-ficha.ejs` | — |
| TO-018 | Inscribir a mi equipo | 🟡 | `POST /torneos/:id/inscribir`, `torneoModel.inscribir` (con bloqueo `FOR UPDATE`), `habilitarModalidad` | **Solo torneos gratuitos**: si `precio > 0` responde `'con-pago'` ("se habilita muy pronto"). Falta crear la inscripción `pendiente_pago` con `reservada_hasta` y su expiración. Tampoco verifica `min_jugadores` ni el rango de nivel del equipo (requiere prueba manual). |
| TO-019 | Pagar la inscripción | ❌ | Tabla `torneo_pago` creada; `pasarelasApi.webpayCrear` existe pero nadie la usa | Todo el flujo: elegir medio, crear el pago, redirigir, volver, confirmar y pasar la inscripción a `confirmada`. |
| TO-020 | Pagar con Webpay | ❌ | Solo `pasarelasApi.webpayCrear` (crear transacción) | Falta el `commit` de la transacción en la URL de retorno, el manejo de anulación/timeout, la ruta de retorno y el comprobante. |
| TO-021 | Pagar con Mercado Pago | ❌ | Solo `cabecerasMP` y la prueba `/users/me` | Falta la preferencia de Checkout Pro, `back_urls`, el **webhook/IPN** y la consulta de estado del pago. |
| TO-022 | Pagar con PayPal | ❌ | Solo `paypalToken` y la conversión CLP→USD (`reglas.aUSD`) | Falta crear y capturar la orden (Orders v2), las rutas de retorno/cancelación y el webhook. |
| TO-023 | Mis inscripciones y comprobantes | ❌ | Columnas `comprobante` y `numero_comprobante` en `torneo_pago`; `torneoModel.idsMisTorneos` (solo marca "mío" en la lista) | Página de mis inscripciones con estado y pago, generación del comprobante y descarga. |
| TO-024 | Retirar a mi equipo | 🟡 | `POST /torneos/:id/retirar/:idEquipo`, `torneoModel.retirar` | Solo en torneos gratuitos y con inscripciones abiertas. Falta el retiro de torneos pagados (`retiro_pendiente` 48 h + reembolso, según el comentario en `tareasProgramadas.js`). No notifica a la administración. |
| TO-025 | Consultar fixture y tabla de posiciones | ✅ | `views/torneos/detalle.ejs`, `views/partials/torneo-competencia.ejs`, `torneo-llave.ejs`, `public/js/torneo-detalle.js` | Para liga y llave. Grupos depende de TO-007. Requiere prueba manual. |
| TO-026 | Recibir notificaciones del torneo | 🟡 | `notificarCapitanesEnTransaccion` en `torneoModel` (publicar, editar, cerrar, expirar, eliminar, quitar), `adminTorneosController.empezar`, tipo `torneo` en `sql/nuevas_tablas.sql` | No se notifica al registrar resultados, al finalizar/campeón, al inscribirse ni al retirarse, ni nada de pagos. Solo hay notificación in-app (sin correo). |
| TO-027 | Presentar una apelación | ❌ | — (solo el menú `/admin/apelaciones` → "próximamente") | Todo: modelo, UI del capitán, endpoint y plazos. |
| TO-028 | Resolver apelaciones | ❌ | `config/panel.js` (sección `apelaciones`, fase 4), `routes/adminRoutes.js` (`panel.proximamente`) | Todo. |

### Partidos

| Código | Historia | Estado | Evidencia (archivos) | Qué falta |
|---|---|---|---|---|
| PA-003 | Cancelar una reserva | ✅ | `POST /reservas/:id/cancelar` (`routes/partidoRoutes.js`), `controllers/reservaController.cancelar`, `models/reservaModel.cancelar`, `views/reservas/index.ejs` | Bloquea las pasadas y las ligadas a un partido. No notifica (requiere prueba manual contra los criterios). |
| PA-004 | Reprogramar un partido | ❌ | Solo el texto "cancela o reprograma el partido" en `views/reservas/index.ejs` y `reservaController` | Todo: endpoint, nueva reserva de cancha, acuerdo entre capitanes y notificación. Hoy solo existe cancelar (`partidoModel.cancelar`). |
| PA-006 | Actualizar nivel de los equipos | ❌ | `equipo.puntaje_nivel` se fija al crear el equipo (`equipoModel.js` ~l. 826-844) y nunca cambia; `partidoModel.registrarResultado` no lo toca | Fórmula de puntaje (tipo Elo), actualización al confirmar el resultado y cambio de `id_nivel` al cruzar umbrales. |
| PA-008 | Valorar a los jugadores después del partido | ❌ | Solo el texto en `views/perfil.ejs` ("Tus estadísticas cambian con las valoraciones…") | Tabla de valoraciones, UI post-partido, reglas (una por partido, solo participantes) y su impacto en la carta. **El texto actual promete algo que no existe.** |

### Perfil y equipos

| Código | Historia | Estado | Evidencia (archivos) | Qué falta |
|---|---|---|---|---|
| PE-014 | Abandonar un equipo | ✅ | `POST /equipos/:id/salir`, `equipoController.salir`, `equipoModel.salirDeEquipo` (el capitán no puede salir) | No notifica al capitán. Revisar si los criterios lo piden. |
| PE-015 | Expulsar a un integrante | ✅ | `POST /equipos/:id/plantel/:idJugador/sacar`, `equipoController.sacar`, `equipoModel.sacarJugador` | No pide motivo ni notifica al expulsado. Revisar los criterios. |
| PE-018 | Eliminar mi comentario | ❌ | Solo crear (`equipoFichaController.comentar`) y ocultar por moderación (`ocultarComentario`) | Endpoint y botón para que el autor borre su comentario, con comprobación de autoría. |
| PE-025 | Descargar y compartir mi carta | ✅ | `public/js/perfil.js` (canvas → PNG, Web Share API con descarga de respaldo), `views/partials/carta-jugador.ejs`, `views/perfil.ejs` | Requiere prueba manual en móvil (Web Share). |

### Inicio, agenda y notificaciones

| Código | Historia | Estado | Evidencia (archivos) | Qué falta |
|---|---|---|---|---|
| IN-003 | Confirmar asistencia al próximo partido | ❌ | — (no hay tabla ni ruta de asistencia; `participacion` es por equipo) | Tabla de asistencia por jugador y partido, botón en el inicio, conteo para el capitán. |
| IN-004 | Consultar nivel del equipo | ✅ | `views/partials/sm-equipo-inicio.ejs` (l. 39, "Nivel · pts"), `equipoModel.js` (l. 126/150, `puntaje_nivel`) | Se muestra, pero el número nunca cambia (depende de PA-006). |
| IN-006 | Ver la app ambientada según la fecha | ❌ | — (solo hay tema claro/oscuro: `views/partials/header.ejs`, `public/css/tema-claro.css`) | Todo: temporadas, recursos visuales y la lógica por fecha. |
| IN-007 | Desactivar la ambientación temática | ❌ | — | Depende de IN-006. Preferencia del usuario (se puede reutilizar el patrón `localStorage sm-tema` o guardarla en el perfil). |
| AD-015 | Gestionar temporadas temáticas | ❌ | — | Tabla de temporadas (nombre, rango de fechas, tema), CRUD en el panel. Base de IN-006. |
| AG-004 | Historial de resultados del equipo | ✅ | `models/equipoFichaModel.historial` (últimos 20, Ganado/Perdido/Empate), `views/equipos/ficha.ejs`, `controllers/agendaController.js` | Solo partidos amistosos (desafíos): **no incluye partidos de torneo**. Sin paginación más allá de 20. |
| NT-005 | Recordatorio antes del partido | ❌ | — (`tareasProgramadas.js` solo cierra torneos) | Una tarea programada que notifique X horas antes, idempotente (marca de "recordatorio enviado"). |

### Panel de administración

El acceso y la seguridad del panel están bien hechos. De las 17 secciones del menú, **9 son páginas "Próximamente"** (`routes/adminRoutes.js`, l. 92-93: desafíos, partidos, reservas, valoraciones, comentarios, anuncios, apelaciones, pagos, estadísticas). Equipos también lo es para el administrador normal.

| Código | Historia | Estado | Evidencia (archivos) | Qué falta |
|---|---|---|---|---|
| AP-001 | Ingresar al panel | ✅ | `controllers/adminAccesoController.js`, `middlewares/rolMiddleware.requireAdmin`, `models/panelModel.js`, tablas `admin_sesion` y `admin_intento`, `views/admin/login.ejs` | Sesión propia con hash SHA-256, expira a los 30 min de inactividad, bloqueo tras 5 intentos fallidos. |
| AP-002 | Navegar por las secciones | 🟡 | `config/panel.js` (`SECCIONES`), `views/partials/admin-nav.ejs`, `views/admin/proximamente.ejs` | El menú está completo, pero 9 de 17 secciones son marcadores de posición. |
| AP-003 | Buscar, filtrar, ordenar y exportar listados | 🟡 | `config/listados.js` (filtros, orden, paginación, CSV seguro), `test/listados.test.js` | Solo lo usan **Torneos, Actividad y Administradores**. Cuentas, equipos (super), jugadores (super) y recintos tienen búsqueda de texto simple, sin orden, paginación ni CSV. |
| AP-004 | Resumen general | 🟡 | `adminPanelController.resumen`, `superAdminModel.resumen`, `views/admin/resumen.ejs` | Cifras de cuentas, equipos, conectados y partidos próximos. Faltan torneos, reservas, pagos y tendencias. |
| AP-005 | Atender alertas pendientes | 🟡 | `models/alertaModel.js` (2 tipos: equipo sin capitán, torneo sin cupo mínimo) | Pocas alertas. No se pueden marcar como atendidas ni descartar. El enlace de "equipo sin capitán" lleva a `/admin/equipos`, que para un administrador normal es "Próximamente". |
| AP-006 | Consultar y filtrar cuentas | 🟡 | `adminCuentasController.listar`, `cuentaAdminModel.buscarCuentas`, `superAdminController.jugadores` (filtros conectados/activas/inactivas solo para el principal) | El administrador normal solo tiene búsqueda de texto. Sin paginación ni CSV. |
| AP-007 | Ficha completa de usuario | ❌ | — | Vista de detalle (perfil, equipos, partidos, reservas, actividad). |
| AP-008 | Activar/desactivar cuentas | ✅ | `POST /admin/cuentas/:id/(des)activar`, `cuentaAdminModel.cambiarEstadoCuenta` (con motivo y registro de actividad), lo mismo en `/admin/super/jugadores` | Requiere prueba manual de que la sesión de Supabase se invalida al instante. |
| AP-009 | Editar cuenta y perfil de jugador | ❌ | — | Formulario y endpoint en el panel. |
| AP-010 | Restablecer contraseña y cerrar sesiones de un usuario | ❌ | — (`panelModel.cerrarSesionesDe` es solo para sesiones del panel) | Acción de reset vía Supabase Admin y cierre de sesiones (`auth.admin.signOut`). |
| AP-011 | Seleccionar quién accede al panel | ✅ | `controllers/administradoresController.js` (crear, revocar, reactivar, traspasar), `requirePrincipal`, índice único de superadministrador (`sql/nuevas_tablas.sql` SA-1/SA-6) | — |
| AP-012 | Consultar y filtrar equipos | 🟡 | `/admin/super/equipos` (`superAdminController.equipos`, `superAdminModel.buscarEquipos`), **solo el Administrador principal** | El administrador normal ve "Próximamente" (`adminRoutes.js` l. 65-67). Sin filtros, orden ni CSV. |
| AP-013 | Ficha completa de equipo | ❌ | — | Vista de detalle en el panel. |
| AP-014 | Editar equipo | ❌ | — (solo la edición del capitán: `equipoFichaController.guardarEdicion`) | Endpoint y formulario del panel. |
| AP-015 | Activar/desactivar equipos | ❌ | — (solo el capitán: `equipoFichaModel.desactivarEquipo`; el principal solo puede **eliminar**) | Acción del panel con motivo. |
| AP-016 | Gestionar plantel y capitanía | ❌ | — (solo el capitán: `equipoController.sacar` / `transferirCapitania`) | Acción del panel. Útil para resolver la alerta "equipo sin capitán". |
| AP-017 | Ajustar puntaje de nivel | ❌ | — (el catálogo de niveles edita `puntaje_min`, no el puntaje del equipo) | Endpoint con motivo y registro de actividad. |
| AP-018 | Gestionar recintos y canchas | ✅ | `controllers/adminRecintosController.js`, `models/recintoModel.js`, `canchaModel.js`, `disponibilidadModel.js`, `validadoresAdmin` (`validarRecinto`, `validarCancha`, `validarBloque`), vistas `admin/recinto*.ejs`, `admin/cancha.ejs` | Avisa de partidos futuros al cambiar la modalidad de una cancha. |
| AP-019 | Ocupación de canchas | ❌ | — | Vista de calendario/ocupación por cancha (los datos ya existen en `reservar_cancha`). |
| AP-020 | Consultar y cancelar desafíos | ❌ | `/admin/desafios` → "Próximamente" | Todo. |
| AP-021 | Consultar y gestionar partidos | ❌ | `/admin/partidos` → "Próximamente" | Todo. |
| AP-022 | Corregir resultado de un partido | ❌ | — (`partidoModel.registrarResultado` impide modificar: `'ya-registrado'`) | Endpoint del panel con motivo. En torneos sí se puede corregir (`/admin/torneos/:id/partidos/:idPartido`). |
| AP-023 | Consultar y cancelar reservas | ❌ | `/admin/reservas` → "Próximamente" | Todo. |
| AP-024 | Moderar valoraciones | ❌ | `/admin/valoraciones` → "Próximamente" | Depende de PA-008 (no existen valoraciones). |
| AP-025 | Moderar comentarios | 🟡 | `POST /comentarios/:id/ocultar` (`routes/equipoFichaRoutes.js`), `equipoFichaModel.ocultarComentario`, botón en `views/equipos/ficha.ejs` l. 160, columnas `comentario.oculto` | **Esta ruta no puede funcionar** (ver riesgo R1). Falta la sección `/admin/comentarios`, que hoy es "Próximamente". |
| AP-026 | Enviar anuncios | ❌ | `/admin/anuncios` → "Próximamente"; mencionado en `tareasProgramadas.js` | Todo. |
| AP-027 | Gestionar torneos | 🟡 | `controllers/adminTorneosController.js` (listado con filtros/CSV, crear, editar, publicar, cerrar, empezar, resultados, quitar equipo, eliminar), `views/admin/torneos.ejs`, `torneo.ejs` | Falta cancelar (TO-012), grupos/byes (TO-007), reprogramar (TO-008), pagos y reembolsos (TO-014/015). |
| AP-028 | Pagos y reembolsos de la plataforma | ❌ | `/admin/pagos` → "Próximamente" | Depende de TO-019…022 y TO-014. |
| AP-029 | Gestionar catálogos | ✅ | `controllers/adminCatalogosController.js`, `models/catalogoModel.js` (modalidades, posiciones, niveles), `validarCatalogo`, `views/admin/catalogos.ejs` | — |
| AP-030 | Configurar parámetros | 🟡 | Solo pasarelas (`/admin/configuracion/pasarelas`) | Los parámetros generales están fijos en código: `config/panel.js` (`ACCESO`, `MOTIVO`), `config/partidos.js` (`DURACION_PARTIDO_MIN`), `config/torneos.js` (`LIMITES`). Falta una tabla de parámetros con su UI. |
| AP-031 | Publicar nueva versión de términos | ❌ | La versión está fija en `config/legal.js` (`version: '1.0'`). El forzado a re-aceptar ya existe (`middlewares/terminosMiddleware.js`, `aceptoVersionesVigentes`) | Tabla de versiones con su texto, UI para publicar y el historial de aceptación. |
| AP-032 | Registro de actividad | ✅ | `models/actividadModel.js`, `adminPanelController.listarActividad` / `detalleActividad`, tabla `admin_actividad` con trigger que impide editar o borrar | Filtros, CSV y detalle con valor anterior/nuevo. |
| AP-033 | Estadísticas y reportes | ❌ | `/admin/estadisticas` → "Próximamente" | Todo. |

## 4. Bloqueos y dependencias

1. **Pagos (TO-018 con pago, TO-019…023, TO-014, TO-015, TO-024 con pago, AP-028)**
   - Ya existe: la tabla `torneo_pago` (bien diseñada: un solo pago aprobado por inscripción, `orden_compra` única, comprobante JSONB), `pasarela_config` con credenciales cifradas y la prueba de conexión.
   - **Falta y bloquea todo lo demás:**
     - Un modelo/servicio de pagos (`pagoModel`) con la máquina de estados `iniciado → aprobado/rechazado/en_verificacion`.
     - Rutas de **retorno** (Webpay `return_url`, MP `back_urls`, PayPal `return_url`/`cancel_url`).
     - **Webhooks** de Mercado Pago y PayPal. Son rutas públicas sin sesión: hay que verificar la firma y tienen que ser idempotentes. Hoy `app.js` solo parsea `urlencoded`, así que falta `express.json()`/`raw` en esas rutas.
     - La confirmación (`commit`/`capture`) contra la pasarela.
     - Expirar las inscripciones `pendiente_pago` (`reservada_hasta`) en `tareasProgramadas`.
     - Generar `numero_comprobante`.
   - **Externos:** credenciales de integración (Transbank 597055555532 + API key de integración; usuario de prueba de MP; app sandbox de PayPal), `PASARELAS_CLAVE` en `.env` y una **URL pública HTTPS** (ngrok o deploy) para que las pasarelas puedan llamar al retorno y a los webhooks.
2. **Reembolsos (TO-014) → cancelar torneo (TO-012) y retiro pagado (TO-024).** Cancelar un torneo con pagos necesita reembolsar en lote.
3. **Formato grupos y byes (TO-007) → TO-009, TO-010, TO-025 para grupos.** Hoy se pueden crear torneos de grupos que no se pueden empezar. Mientras no exista, conviene bloquear la creación de torneos "grupos".
4. **TO-008 y PA-004 (reprogramar)** necesitan que `torneo_partido` tenga fecha, hora y cancha, y que se integre con `reservar_cancha` (como ya hace `partidoModel.programar` para los amistosos).
5. **PA-006 (nivel) → IN-004, AP-017 y el matchmaking (DE-007).** El puntaje es estático: el emparejamiento por cercanía de puntaje nunca evoluciona.
6. **PA-008 (valoraciones) → AP-024** y las estadísticas de la carta prometidas en `views/perfil.ejs`.
7. **AD-015 (temporadas) → IN-006 → IN-007.**
8. **NT-005 e IN-003** dependen de ampliar `tareasProgramadas.js`, que corre dentro del proceso web: con más de una instancia se duplicarían los envíos (ver R5).
9. **Secciones de moderación del panel (AP-020…026)** necesitan habilitar `/admin/*` sobre esas entidades. Hay que reutilizar `config/listados.js` y `actividad.registrar` para que todas registren actividad.

## 5. Riesgos técnicos detectados

| # | Riesgo | Evidencia | Impacto |
|---|---|---|---|
| R1 | **La moderación de comentarios no puede funcionar.** `POST /comentarios/:id/ocultar` usa `requireAdmin`, pero la cookie del panel `sm_admin` tiene `path: '/admin'`, así que el navegador no la envía a `/comentarios/...` y siempre redirige a `/admin/login`. Además, las cuentas del panel son redirigidas a `/admin` por `requireRol`, así que no pueden abrir `/equipos/:id` para ver el botón. | `middlewares/rolMiddleware.js` (`OPCIONES_COOKIE.path`), `routes/equipoFichaRoutes.js` l. 10, `middlewares/authMiddleware.js` l. 149 | AP-025 inutilizable. Mover la acción bajo `/admin/comentarios`. |
| R2 | **Sin protección CSRF.** Todas las acciones son POST con cookie de sesión. Solo protege `SameSite=lax`. No hay tokens. | grep `csrf` sin resultados | Las acciones del panel (eliminar cuentas o torneos, credenciales de pago) quedan expuestas a navegadores o subdominios mal configurados. Con pagos y webhooks el riesgo sube. |
| R3 | **El esquema base está en MySQL** (`CREATE DATABASE … utf8mb4`, `AUTO_INCREMENT`, `DATETIME`, `USE`), pero la base es PostgreSQL. No hay migraciones versionadas, solo un `nuevas_tablas.sql` acumulativo. | `sql/searchmatch.sql` | No se puede recrear la base desde cero de forma fiable. El esquema real vive solo en Supabase. |
| R4 | **Promesas en la UI sin backend:** "las estadísticas cambian con las valoraciones", "reprograma el partido", "la inscripción con pago se habilita muy pronto", torneos de grupos que se pueden crear pero no empezar. | `views/perfil.ejs` l. 161, `views/reservas/index.ejs` l. 46, `torneoController` (`AVISOS['con-pago']`), `torneoModel.empezar` | Confunde al usuario y genera torneos de grupos atascados en "cerrado". |
| R5 | **Tareas programadas dentro del proceso web** (`setInterval`). Sin lock distribuido. | `models/tareasProgramadas.js`, `app.js` | Con más de una instancia o reinicios, los recordatorios y expiraciones (NT-005, TO-018) se duplican. Hoy es tolerable porque `cerrarVencidos` es idempotente. |
| R6 | **Funciones del panel solo para el principal que deberían ser de cualquier administrador:** equipos y filtros avanzados de jugadores están bajo `requirePrincipal`. La alerta "equipo sin capitán" enlaza a una página que el administrador normal no puede usar. | `routes/adminRoutes.js` l. 65-67 y 100-105, `models/alertaModel.js` | AP-012…016 bloqueadas para el rol normal. |
| R7 | **Sin tests de integración** de rutas y permisos por rol. Solo hay reglas puras. | `test/` | Una ruta nueva sin `requireAuth`/`requireRol` no se detectaría. El panel mitiga con `router.use(requireAdmin)`, pero las rutas de jugador ponen el middleware a mano en cada línea. |
| R8 | **Resultados de amistosos sin disputa:** el primer capitán que registra fija el marcador para siempre (`'ya-registrado'`), sin confirmación del rival ni corrección del panel (AP-022 ❌). | `models/partidoModel.registrarResultado` | Cuando exista PA-006, un capitán podría manipular el puntaje. |
| R9 | **Torneos:** en la llave solo se edita la última ronda. En la liga se puede editar un resultado con el torneo ya `finalizado` (recalcula el campeón sin aviso). No se valida `min_jugadores` ni el rango de nivel al inscribirse (requiere prueba manual). | `torneoModel.registrarResultado`, `torneoModel.inscribir` | Cambios silenciosos de campeón e inscripciones que no cumplen el reglamento. |
| R10 | Las rutas `/perfil/foto`, `/jugadores/:id/foto` y `/equipos/:id/escudo` solo usan `requireAuth`: cualquier usuario con sesión puede leer la foto de cualquier jugador por id. | `routes/indexRoutes.js` | Probablemente intencional (cartas del plantel), pero conviene confirmarlo con la política de privacidad. |

No se encontraron `TODO`/`FIXME` en el código. Lo que está a medias se marca con comentarios "fase 2 / fase 3 / fase 4 / fase 5" (`models/torneoModel.js`, `models/pasarelasApi.js`, `models/tareasProgramadas.js`, `config/panel.js`, `controllers/adminTorneosController.js` → `AVISOS`).

## 6. Orden de trabajo sugerido

> Las prioridades (Alta/Media/Baja) están en Trello y no en el repositorio, así que este orden se basa en dependencias y en impacto. Conviene contrastarlo con las prioridades reales.

1. **Correcciones rápidas y de seguridad (1-2 días):** R1 (mover la moderación a `/admin/comentarios`, lo que cierra AP-025), protección CSRF (R2), quitar o bloquear el formato "grupos" en el formulario hasta que exista TO-007, y corregir los textos de R4.
2. **Base de pagos (bloqueante):** `pagoModel` con su máquina de estados → TO-018 (inscripción `pendiente_pago` + expiración en `tareasProgramadas`) → TO-019 → **TO-020 Webpay primero** (es el flujo más simple: redirect + commit, sin webhook) → TO-023 (comprobantes) → TO-015 (recaudación detallada).
3. **Otras pasarelas:** TO-021 Mercado Pago y TO-022 PayPal (webhooks con firma e idempotencia, URL pública).
4. **Reembolsos y ciclo de vida:** TO-014 → TO-024 con pago → TO-012 cancelar torneo → TO-006 completo → AP-028 pagos del panel.
5. **Competencia completa:** TO-007 (byes y grupos) → TO-010 / TO-025 para grupos → TO-008 (fecha, hora y cancha en `torneo_partido`) → TO-011 explícito + TO-026 (notificaciones de resultados y campeón).
6. **Núcleo de partidos:** PA-006 (puntaje de nivel), junto con AP-022 (corregir resultado) y la confirmación del rival (R8) → PA-004 reprogramar → NT-005 recordatorio + IN-003 asistencia.
7. **Panel, gestión de entidades:** abrir Equipos a todos los administradores (AP-012) → AP-013…017 → AP-007 / AP-009 / AP-010 → AP-003 en todos los listados → AP-020 / AP-021 / AP-023 / AP-019.
8. **Comunidad:** PE-018, PA-008 valoraciones → AP-024; TO-027 / TO-028 apelaciones.
9. **Comunicación y configuración:** AP-026 anuncios, AP-031 versiones de términos, AP-030 parámetros, AP-005 más alertas, AP-004 / AP-033 estadísticas.
10. **Ambientación (baja dependencia):** AD-015 → IN-006 → IN-007.

Durante todo el trabajo: agregar tests de integración de permisos por rol (R7) a medida que se sumen rutas, y migrar el esquema a migraciones versionadas en Postgres (R3).

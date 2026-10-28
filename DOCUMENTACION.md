# SearchMatch — Documentación del código

Este documento explica qué hace cada parte de `auth-app`, la aplicación web de **SearchMatch** (plataforma de fútbol amateur en Chile). Reemplaza a los comentarios que antes había dentro del código.

El nivel de detalle depende de la complejidad: las partes simples (configuración, rutas, estilos) se describen en pocas líneas, y las delicadas (sesión, transacciones de equipos, reservas y partidos, la pelota 3D) se explican paso a paso.

---

## Índice

1. [Visión general](#1-visión-general)
2. [Arranque: `app.js`](#2-arranque-appjs)
3. [Configuración: `config/`](#3-configuración-config)
4. [Middlewares: `middlewares/`](#4-middlewares-middlewares)
5. [Rutas: `routes/`](#5-rutas-routes)
6. [Módulos funcionales (controladores + modelos + vistas)](#6-módulos-funcionales)
7. [Base de datos: `sql/`](#7-base-de-datos-sql)
8. [Navegador: `public/js/`](#8-navegador-publicjs)
9. [Estilos: `public/css/`](#9-estilos-publiccss)
10. [Vistas: `views/`](#10-vistas-views)
11. [Scripts de mantenimiento: `scripts/`](#11-scripts-de-mantenimiento-scripts)
12. [Reglas de negocio](#12-reglas-de-negocio)
13. [Patrones que se repiten en todo el código](#13-patrones-que-se-repiten-en-todo-el-código)

---

## 1. Visión general

**Tecnologías:** Node.js + Express 5, vistas EJS, Supabase Auth para las cuentas (`@supabase/supabase-js` y `@supabase/ssr`) y PostgreSQL de Supabase (`pg`) para los datos.

**Arquitectura MVC:**

| Capa | Carpeta | Responsabilidad |
|---|---|---|
| Rutas | `routes/` | Solo definen la URL y encadenan middlewares y controladores. No contienen lógica. |
| Middlewares | `middlewares/` | Sesión, permisos, validación de formularios y manejo de errores. |
| Controladores | `controllers/` | Deciden qué hacer con la petición: llaman a los modelos y eligen qué vista mostrar o a dónde redirigir. |
| Modelos | `models/` | Única capa que habla con la base de datos y con Supabase Auth. |
| Vistas | `views/` | Plantillas EJS que arman el HTML. |
| Navegador | `public/` | CSS, JavaScript del lado del cliente e imágenes. |

**Recorrido de una petición típica** (por ejemplo `POST /canchas/5/reservar`):

```
Navegador
  → express.static (si es un archivo de /public, termina aquí)
  → express.urlencoded / cookieParser       (lee el formulario y las cookies)
  → cargarSesion                            (¿quién es? → req.usuario)
  → exigirTerminos                          (¿aceptó los términos vigentes?)
  → contadorSinLeer                         (número de la campana)
  → router: requireAuth → requireRol → validarReserva → reservaController.reservar
       → reservaModel.reservar (transacción en PostgreSQL)
  → res.render(vista) o res.redirect(...)
  → si nada respondió: noEncontrado (404); si hubo error: manejarErrores (500)
```

Los códigos como `AR-008`, `AD-002`, `PE-009`, `DE-006`, `NT-003`, `PA-001` o `AG-001` que aparecen en nombres y en este documento son los identificadores de las historias de usuario del proyecto (AR = acceso/registro, AD = administración, PE = perfil/equipos, DE = descubrir canchas y desafíos, NT = notificaciones, PA = partidos/reservas, AG = agenda, IN = inicio).

---

## 2. Arranque: `app.js`

Es el punto de entrada (`npm start` o `npm run dev`). Configura todo en este orden:

1. **Variables de entorno** con `dotenv` (`.env`).
2. **Proxy:** en producción activa `trust proxy` para que las cookies `secure` funcionen detrás de HTTPS (Render, Railway, etc.).
3. **Motor de vistas:** EJS, con las plantillas en `views/`.
4. **Archivos estáticos:** sirve `public/`. En producción el navegador los guarda 7 días; para que un despliegue nuevo no muestre CSS/JS viejo, se genera `app.locals.versionAssets` (un valor distinto en cada arranque) y las vistas piden los archivos con `?v=<versionAssets>`.
5. **Middlewares globales:** lectura de formularios, cookies, `cargarSesion`, `exigirTerminos` y `contadorSinLeer`.
6. **Rutas:** monta cada router (`/`, `/admin`, `/canchas`, `/notificaciones`, `/desafios`, etc.).
7. **Errores:** `noEncontrado` (404) y `manejarErrores` van al final, después de todas las rutas.
8. **Servidor:** escucha en `PORT` (3000 por defecto) y prueba la conexión a la base de datos. Si la base falla, solo lo informa en la consola; el servidor sigue arriba.

---

## 3. Configuración: `config/`

Archivos con constantes y clientes compartidos. Son sencillos.

| Archivo | Qué contiene |
|---|---|
| `db.js` | El **pool de conexiones** a PostgreSQL (reutiliza conexiones en vez de abrir una por consulta). Usa `ssl: { rejectUnauthorized: false }`, necesario con Supabase. `probarConexion()` hace `SELECT NOW()` al arrancar y muestra en consola un mensaje claro si falla (falta `DATABASE_URL`, contraseña incorrecta, etc.). |
| `supabase.js` | Tres formas de hablar con Supabase: **`crearClienteServidor(req, res)`**, un cliente por petición que lee la sesión desde las cookies y escribe las cookies nuevas en la respuesta (convierte `maxAge` de segundos a milisegundos y fuerza `httpOnly`, para que el JavaScript del navegador nunca vea los tokens); **`supabaseAdmin`**, un cliente con la *service role key* (opcional) que solo se usa para borrar una cuenta de Auth si falló el registro del perfil; y **`crearClienteTemporal()`**, un cliente sin sesión ni cookies para comprobar la contraseña actual de alguien sin tocar su sesión. También limpia `SUPABASE_URL` si quedó con `/rest/v1` al final. |
| `canchas.js` | Días de la semana (clave sin tildes que se guarda en la base y su número ISO, 1 = lunes), límites geográficos de Chile para validar coordenadas, rango de precio por hora, largo mínimo de búsqueda (3 letras), días de disponibilidad que se muestran (7) y la zona horaria `America/Santiago`. |
| `equipo.js` | Modalidades (5, 7 y 11 jugadores), textos y "barras de señal" de cada nivel, y `MAX_EQUIPOS_COMO_CAPITAN = 1` (regla 5). |
| `perfilJugador.js` | Catálogos del perfil: posiciones (con sigla y los nombres posibles en la base), pies, niveles y las 6 estadísticas de la carta (ritmo, tiro, pase, regate, defensa, físico). Funciones: `sortearEstadisticas()` (todas parten en 50, regla 8), `calcularMedia()` (promedio redondeado de las 6), `nombreEnCarta()` (el apodo, o el nombre si no tiene) y `urlFoto()` (URL con versión para evitar que el navegador muestre una foto vieja). |
| `partidos.js` | Duración de un partido (60 minutos), duración mínima y máxima de una reserva (30 minutos a 6 horas) y marcador máximo (99). |
| `panel.js` | Panel de administración (AP-000): reglas de acceso (`ACCESO`: 30 min de inactividad, 5 intentos fallidos, 15 min de bloqueo), nombre de la cookie de la sesión del panel (`sm_admin`), largo del motivo (5 a 500) y las **secciones del menú lateral** en orden (`SECCIONES`, con `soloPrincipal` para Administradores y `fase` para las que aún no existen). `seccionesPara(esPrincipal)` filtra las que ve cada cuenta. |
| `listados.js` | **Listados del panel (AP-003)**, funciones puras: `leerListado(query, def)` lee texto, filtros, `orden`, `dir`, `pagina` y `por` (25/50/100) desde la URL con **listas blancas** (lo que no calza se ignora); `construirSQL(estado, def, paramsBase)` arma el `WHERE` (búsqueda en las columnas de la definición + filtros, todos con `AND`), el `ORDER BY` (columna de una lista fija + desempate) y `LIMIT/OFFSET`, con los valores siempre como parámetros `$n`; `vistaListado(...)` entrega a la vista las etiquetas quitables de cada filtro, el enlace de Limpiar filtros, los enlaces de orden (alternan asc/desc) y de páginas, el enlace del CSV (mismos filtros y orden, sin paginar) y los campos ocultos para no perder el estado; `aCSV`/`enviarCSV` generan el CSV (BOM + `;`, fechas en hora de Chile; las celdas que empiezan con `=`, `+`, `-` o `@` se neutralizan). Pruebas en `test/listados.test.js` (`npm test`). |
| `legal.js` | Texto completo de los **términos y condiciones** y de la **política de privacidad**, cada uno con versión y fecha. `aceptoVersionesVigentes(usuario)` dice si la cuenta aceptó las versiones actuales. Para publicar una versión nueva basta con cambiar `version` y `actualizado`: todas las cuentas tendrán que aceptarla al entrar. |

---

## 4. Middlewares: `middlewares/`

### 4.1 `authMiddleware.js` — sesión del usuario (complejidad alta)

La sesión no se guarda en el servidor: vive en cookies `httpOnly` llamadas `sb-<proyecto>-auth-token`, que el cliente de `@supabase/ssr` lee, renueva y borra.

**`cargarSesion`** (se ejecuta en todas las peticiones):

1. Crea el cliente de Supabase de la petición y lo deja en `req.supabase`.
2. Borra cookies de una versión antigua de la app (`sm_access_token`, `sm_refresh_token`) si aparecen.
3. Si no hay cookie de sesión, termina aquí (ahorra una llamada a Supabase) y `req.usuario` queda en `null`.
4. Llama a `getUser()`, que valida el token con Supabase. Si el *access token* expiró, el cliente lo renueva con el *refresh token* y escribe las cookies nuevas; si la sesión ya no es válida, las borra.
5. Arma el objeto `usuario` con `construirUsuario()`: combina la cuenta de Supabase con la fila de la tabla `usuario`/`jugador`. Incluye nombre, correo, rol elegido al empezar (`rolInicio`), si está activo, si es administrador y qué versión de los términos aceptó. Si la base de datos falla, la sesión sigue siendo válida con los datos de `user_metadata`.
6. **Cuenta desactivada (regla 7):** cierra la sesión y manda a `/login?msg=Cuenta_desactivada`. Así, si un administrador desactiva una cuenta, la persona pierde el acceso en su siguiente clic.
7. **Correo cambiado (AR-012):** si Supabase ya confirmó un correo nuevo y la tabla `usuario` tiene el anterior, lo sincroniza.
8. Deja el usuario en `req.usuario` y `res.locals.usuario`, disponible en todas las vistas.

Nunca corta la petición: si algo no cuadra, simplemente no hay usuario.

**Otras funciones:**

- `requireAuth`: sin sesión, redirige a `/login`. Además manda cabeceras para que el navegador no guarde la página (así "Atrás" después de cerrar sesión no muestra datos de la cuenta anterior).
- `requireRol`: si la cuenta no eligió todavía "jugador" o "equipo", la manda a `/select-role`.
- `redirectIfAuthenticated`: quien ya tiene sesión no ve `/login` ni `/registro`; va a su página de inicio.
- `rutaDeInicio(rol)`: `/select-role` si no eligió rol, o `/dashboard` si ya lo hizo.

### 4.2 `terminosMiddleware.js` — aceptar términos (AR-011)

Si la cuenta no aceptó la versión vigente de los términos y de la privacidad, cualquier página interna la lleva a `/aceptar-terminos`. Quedan libres las páginas de los documentos, la de aceptarlos, cerrar sesión y los flujos de acceso (login, registro, confirmación y recuperación). Si la petición viene de `fetch` (espera JSON), responde un error JSON en lugar de redirigir.

### 4.3 `rolMiddleware.js` — acceso al panel (AR-004, AP-001, AP-011)

Las **cuentas del panel** (rol "Administrador" o "Superadministrador") son distintas de las de jugador: `cargarSesion` marca `req.usuario.esCuentaPanel`, y `esAdmin` / `esSuperAdmin` solo valen si la selección no está revocada (`usuario.admin_revocado_en`). El **Administrador principal** de las historias es el rol Superadministrador (hay uno solo).

- `requireAdmin` (todo el router `/admin`, salvo `/admin/login` y `/admin/logout`): exige sesión de Supabase **y** la sesión propia del panel (cookie `sm_admin`, abierta en `/admin/login`). En cada petición `panelModel.tocarSesion` renueva la última actividad; si pasaron más de 30 minutos, la cierra. Si falta la cookie, la sesión venció o la cuenta fue revocada o desactivada, cierra la sesión del panel y la de Supabase y manda a `/admin/login` (con `fetch` responde 401 JSON). También deja en `res.locals` las secciones del menú y el contador de alertas.
- `requirePrincipal` (alias `requireSuperAdmin`): solo el Administrador principal (sección Administradores y lo que aún vive en `/admin/super/*`); los demás ven "Sin permiso" (403).

Las cuentas del panel no entran por `/login` (se responde como credenciales incorrectas), `requireRol` las manda a `/admin`, no se les piden los términos de jugador y la app de jugadores no tiene ningún enlace al panel.

### 4.4 `errorHandler.js` — errores

- `noEncontrado`: si ninguna ruta respondió, muestra la vista de error con código 404.
- `manejarErrores`: registra el detalle completo en la consola (los errores de `pg` a veces traen el mensaje vacío, así que también mira `detail` y `code`) y al usuario le muestra solo un mensaje genérico, nunca detalles internos.

### 4.5 Validadores

Todos siguen la misma idea: limpian los datos del formulario y dejan el resultado en `req` para que el controlador decida. **Las mismas reglas se repiten en el navegador** (como ayuda para el usuario), pero la validación que vale es la del servidor.

| Archivo | Qué valida |
|---|---|
| `validators.js` | **Registro** (nombre, correo, celular chileno normalizado a `+569XXXXXXXX`, fecha de nacimiento real con edad en rango, contraseña segura con letras y números de 8+ caracteres, confirmación y aceptación de términos), **login**, **perfil de jugador** (apodo, posiciones sin repetir —la primera es la principal—, pie, nivel, altura y peso), **editor de perfil** (ignora a propósito cualquier estadística enviada a mano: solo el sistema las cambia, regla 8), **crear equipo** (nombre, correo, nivel, comuna de la lista y modalidad), **desafío** (fecha y hora tentativas y mensaje opcionales, que se juntan en un texto) y **mensaje de solicitud de unión**. Para detectar fechas inexistentes como el 30 de febrero, crea la fecha y comprueba que vuelva igual. Registro y login vuelven a mostrar el formulario con los errores; el resto deja los errores en `req.erroresPerfil`, `req.erroresEquipo`, etc., indicando el primer paso del asistente con error. |
| `validadoresCuenta.js` | Recuperar contraseña (correo), contraseña nueva, cambio de contraseña (actual + nueva + confirmación) y datos de la cuenta (correo principal, secundario opcional, teléfono y contraseña actual). Reutiliza las reglas de `validators.js`. |
| `validadoresAdmin.js` | Recinto (nombre, teléfono chileno fijo o celular, dirección, comuna, coordenadas dentro de Chile), cancha (nombre, precio por hora —acepta "25.000"— y modalidad), bloque de disponibilidad (día, apertura y cierre posterior) y elementos de catálogos. |
| `validadoresPartido.js` | Reserva (fecha real, no pasada, hora de fin posterior y duración dentro de los límites), programación de partido (fecha, hora, modalidad y cancha) y resultado (dos marcadores enteros entre 0 y 99). Usa la hora actual **de Chile** para decidir qué es "pasado". |

---

## 5. Rutas: `routes/`

Solo conectan URL → middlewares → controlador. Resumen:

| Archivo | Montado en | Contenido |
|---|---|---|
| `indexRoutes.js` | `/` | Landing, `/select-role`, perfil de jugador (`/perfil-jugador`, `/perfil`, `/perfil/editar`, fotos), equipos (`/crear-equipo`, `/mi-equipo`, solicitudes, desafíos, invitaciones, `/mis-equipos`, `/equipos`, plantel, escudo), `/torneos` y `/dashboard`. Las subidas de imagen usan `express.raw` con un tope de tamaño (el cuerpo es la imagen ya reducida en el navegador). `/registro-equipo` redirige a `/mi-equipo` por compatibilidad. |
| `authRoutes.js` | `/` | `/registro`, `/login`, `/auth/confirmar` y `/logout`. |
| `cuentaRoutes.js` | `/` | `/terminos`, `/privacidad`, `/aceptar-terminos`, `/recuperar` (+ `/recuperar/nueva`), `/cuenta` y `/cuenta/contrasena`. |
| `adminRoutes.js` | `/admin` | `/admin/login` y `/admin/logout` sin protección; después aplica `requireAdmin` a **todo** el router (así ninguna ruta nueva queda sin proteger). Resumen (`/admin`), Administradores (solo el principal), Registro de actividad, recintos, canchas, disponibilidad, cuentas, catálogos, las secciones de fases siguientes (página "se habilita en la fase N") y lo que aún está en `/admin/super/*`. |
| `canchasRoutes.js` | `/canchas` | Listado/búsqueda y ficha de cancha. |
| `notificacionRoutes.js` | `/notificaciones` | Bandeja, marcar todas como leídas y abrir una. |
| `desafioRoutes.js` | `/desafios` | Listar, detalle, aceptar, rechazar y cancelar. |
| `equipoFichaRoutes.js` | `/` | Ficha pública de equipo, comentarios (y ocultarlos, solo admin), posiciones buscadas, desactivar/reactivar equipo, mis solicitudes y desactivar cuenta. |
| `partidoRoutes.js` | `/` | Reservar cancha, mis reservas, programar partido, detalle, resultado, cancelar, `/agenda` e `/inicio/equipo`. |

---

## 6. Módulos funcionales

Cada módulo combina controlador, modelo y vistas. Están ordenados de forma parecida a como los usa una persona.

### 6.1 Registro, login y confirmación de correo (complejidad alta)

**Archivos:** `controllers/authController.js`, `models/userModel.js`, `views/login.ejs`, `views/registro.ejs`.

**Registro (`POST /registro`):**

1. Si el correo ya tiene perfil en la base, avisa sin llamar a Supabase.
2. Crea la cuenta en Supabase Auth (`signUp`) con la URL de vuelta `/auth/confirmar`.
3. Con "confirmar correo" activo, Supabase **no** da error si el correo ya existe (para no revelar qué correos están registrados): devuelve un usuario sin identidades. El código detecta ese caso y muestra "correo ya registrado".
4. Crea el perfil con `userModel.create()` en **una transacción**: busca el rol "jugador", inserta en `usuario` (vinculada por `auth_id`) e inserta en `jugador`. Si algo falla, `ROLLBACK`.
5. Si el perfil no se pudo crear, **deshace la cuenta de Auth** (cierra la sesión si se abrió y la borra con `supabaseAdmin`). Si falta la *service role key*, lo informa en la consola. El error `23505` (correo duplicado por una carrera entre el paso 1 y el INSERT) se muestra como "correo ya registrado".
6. Guarda qué versión de términos y privacidad aceptó (si falla, se le pedirá aceptar al entrar).
7. Si Supabase ya entregó la sesión → `/select-role`. Si no, muestra el aviso "revisa tu correo".

**Confirmación (`GET /auth/confirmar`):** acepta los dos formatos de enlace de Supabase (flujo PKCE con `code`, o `token_hash`). Confirma, abre la sesión y lleva a la página de inicio.

**Login (`POST /login`):** `signInWithPassword`. Si la cuenta está desactivada, cierra la sesión de inmediato.

**Logout (`POST /logout`):** revoca la sesión en Supabase y borra las cookies.

`traducirErrorSupabase()` convierte los mensajes de Supabase (en inglés) a mensajes en español para el usuario.

### 6.2 Elegir cómo empezar y dashboard

- **`rolController.js`** + `views/seleccionar-rol.ejs`: pantalla "¿Cómo quieres empezar?" (jugador o equipo). El rol se guarda en `user_metadata.rol_inicio` de Supabase, así que viaja con la sesión en cualquier dispositivo.
- **`pageController.js`**: la landing (`/`), `/torneos` (sin backend todavía: muestra "Próximamente") y el **dashboard**. El dashboard reúne en paralelo el perfil del jugador (si no tiene perfil completo lo manda a crearlo), su equipo, sus equipos, las invitaciones pendientes y el resumen de la carta.

### 6.3 Perfil del jugador (complejidad media)

**Archivos:** `controllers/jugadorController.js`, `models/jugadorModel.js`, vistas `perfil-jugador.ejs`, `perfil.ejs`, `editar-perfil.ejs` y los partials de carta.

- **Asistente `/perfil-jugador`** (4 pasos: tipo de cuenta, datos personales, perfil deportivo y confirmación). Es obligatorio la primera vez; si el perfil ya existe, redirige al editor. Al guardar, las 6 estadísticas parten en 50.
- **Carta `/perfil`**: muestra la carta (media, posición, estadísticas y foto) y un resumen de datos.
- **Editor `/perfil/editar`**: cambia datos y perfil deportivo con la carta actualizándose en vivo. Las estadísticas no se editan (regla 8).
- **Foto:** el navegador la recorta y comprime antes de subirla. El servidor **no confía en el tipo que dice el navegador**: mira los primeros bytes del archivo (`detectarTipoImagen`) para reconocer JPEG (`FF D8 FF`), PNG (firma de 8 bytes) o WebP (`RIFF....WEBP`). Se guarda en la base (columna binaria) y se sirve con `/perfil/foto` o `/jugadores/:id/foto`.
- `jugadorModel` lee y escribe la tabla `jugador` y la relación `jugador_posicion` (la primera posición es la principal), dentro de transacciones.

### 6.4 Equipos (complejidad alta)

**Archivos:** `controllers/equipoController.js`, `controllers/equipoFichaController.js`, `controllers/avisosEquipo.js`, `models/equipoModel.js`, `models/equipoFichaModel.js`, vistas `crear-equipo.ejs`, `equipo-panel.ejs`, `equipos.ejs`, `mis-equipos.ejs`, `equipos/*`.

**Conceptos clave:**

- El **capitán** de un equipo es siempre quien lo creó (`equipo.id_usuario_creador`).
- El plantel está en `equipo_jugador`, con rol "capitan" o "integrante".
- Una cuenta puede capitanear como máximo `MAX_EQUIPOS_COMO_CAPITAN` equipos activos (regla 5), pero puede ser integrante de varios.

**Crear equipo (`/crear-equipo`):** asistente de 2 pasos (identidad: nombre y correo; configuración: nivel, región/comuna y modalidad) más una confirmación. `equipoModel.crearEquipo` trabaja en **una transacción**: busca los ids del rol capitán, del nivel (y su puntaje mínimo, que es el puntaje inicial del equipo, regla 10) y de la modalidad; inserta el equipo con la comuna elegida (regla 11) y mete al creador en el plantel como capitán. Si falla cualquier paso, `ROLLBACK`: nunca queda un equipo sin capitán.

**Panel `/mi-equipo`:** cabecera del equipo, solicitudes pendientes (solo el capitán), rivales para desafiar y el plantel dibujado sobre una **cancha táctica**.

- `plantelEnCancha()` calcula dónde va cada carta: si el capitán ya la ubicó, usa sus coordenadas (en % del ancho y alto); si no, la reparte automáticamente: la altura depende de la línea (arquero, defensa, medio, delantero) y la posición horizontal se reparte en partes iguales entre los jugadores de esa línea.
- El capitán arrastra las cartas y cada posición se guarda al soltar (`POST /equipos/:id/plantel/:idJugador/posicion`).
- El capitán puede subir el escudo y sacar jugadores; un jugador puede salir de un equipo (salvo si es su capitán).

**Solicitudes e invitaciones** (dos caminos para entrar a un equipo):

- *Solicitud:* el jugador pide unirse desde el directorio `/equipos` con un mensaje. El capitán la acepta o la rechaza. `responderSolicitud` es una transacción que bloquea la solicitud, comprueba que siga pendiente y que el equipo sea de ese capitán, cambia el estado y, si se acepta, inserta al jugador en el plantel. Si el equipo también lo había invitado, esa invitación se cancela (regla 6).
- *Invitación:* el capitán invita desde el modal "Invitar jugador +" (lista todos los jugadores, con su media y si son agentes libres). El jugador responde desde el dashboard. No se puede invitar a quien ya pidió unirse ni pedir unirse a quien ya te invitó (regla 6).

**Desafíos desde el panel:** `enviarDesafio` (transacción) bloquea el equipo del capitán para evitar desafíos dobles por doble clic, comprueba que el rival sea de la misma modalidad (regla 12) y que no haya otro desafío pendiente entre los dos.

**Ficha pública y extras (`equipoFichaController` / `equipoFichaModel`):**

- `/equipos/:id`: ficha con plantel, historial de partidos y comentarios.
- Comentarios: cualquier usuario comenta; un administrador puede **ocultarlos** (no se borran, quedan de respaldo).
- `/equipos/:id/posiciones`: el capitán marca qué posiciones busca; el equipo aparece entonces en "Equipos que buscan jugadores".
- Desactivar/reactivar equipo (solo el capitán). Al desactivar se cancelan sus desafíos pendientes.
- `/solicitudes`: el jugador ve las solicitudes que envió y cancela las pendientes.
- `/cuenta/desactivar`: para desactivar la cuenta hay que confirmar con la contraseña, y si capitanea equipos activos primero debe desactivarlos (regla 4: ningún equipo queda sin capitán).

**`avisosEquipo.js`:** funciones pequeñas que crean la notificación de cada evento de equipo (solicitud enviada o respondida, invitación enviada o aceptada, desafío enviado). Nunca lanzan error: si fallan, la acción del usuario ya se hizo y solo se registra en la consola.

### 6.5 Cuenta y documentos legales (complejidad media)

**Archivos:** `controllers/cuentaController.js`, `controllers/legalController.js`, `models/cuentaModel.js`, vistas `cuenta/*` y `legal/*`.

- **Recuperar contraseña (AR-008):** se pide el correo (sirve el principal o el secundario); se envía el enlace de Supabase. Siempre se muestra el mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados. El enlace abre una sesión temporal donde se escribe la contraseña nueva.
- **Cambiar contraseña (AR-009):** pide la actual y la comprueba con `crearClienteTemporal()` (un cliente aparte, así no se toca la sesión real).
- **Datos de la cuenta (AR-012):** correo principal, secundario y teléfono, confirmando con la contraseña. Un correo principal nuevo lo confirma Supabase por correo; cuando se confirma, `cargarSesion` lo sincroniza.
- **Términos y privacidad (AR-010 / AR-011):** `/terminos` y `/privacidad` muestran el documento con su versión y fecha; `/aceptar-terminos` guarda la versión aceptada.

### 6.6 Administración (complejidad media)

**Panel (AP-000 a AP-003, AP-011, AP-032)**: `controllers/adminAccesoController.js`, `adminPanelController.js`, `administradoresController.js`, `models/panelModel.js`, `actividadModel.js`, `alertaModel.js`, vistas `admin/login`, `admin/resumen`, `admin/administradores`, `admin/actividad(-detalle)`, `admin/proximamente`, `admin/sin-permiso` y los partials `admin-inicio` / `admin-fin` (encabezado + menú lateral + nombre de la sección), `admin-nav` (menú), `listado-barra` / `listado-th` / `listado-pie` / `listado-vacio` (AP-003) y `admin-accion-motivo`.

- **Ingreso (`/admin/login`)**: correo y contraseña con Supabase; solo pasan cuentas del panel activas y no revocadas. Cualquier otra falla muestra el mismo mensaje que unas credenciales incorrectas. Los fallos se cuentan **por correo** en `admin_intento` (exista o no la cuenta, así no se revela cuáles existen): al 5.º seguido el correo queda bloqueado 15 minutos, se registra en la actividad (sección Acceso) y se avisa al Administrador principal (lo ve en "Avisos para ti" del Resumen). Al entrar se abre una fila en `admin_sesion` (solo se guarda el SHA-256 del token de la cookie). **Cerrar sesión** pide confirmar, cierra la sesión del panel y la de Supabase y vuelve a `/admin/login`.
- **Menú lateral (AP-002)**: todas las secciones de `config/panel.js`, la activa destacada y su nombre arriba del contenido; en pantallas angostas se contrae en un botón "Menú" (casilla + etiqueta, sin JavaScript). Junto a Resumen va la cantidad de alertas (`alertaModel`, que calcula cada alerta con el estado actual: desaparece sola al resolverse).
- **Administradores (AP-011, solo el principal)**: listado con nombre, correo, estado, último acceso y fecha de selección. **Crear** pide nombre y correo, rechaza correos de cualquier otra cuenta, crea el usuario en Supabase Auth con una **invitación** (`inviteUserByEmail`, necesita `SUPABASE_SERVICE_ROLE_KEY`) y la fila `usuario` con rol Administrador (si la base falla, se borra el usuario de Auth). La persona define su contraseña en `/recuperar/nueva`, que acepta el enlace de invitación con `token_hash`, `code` o los tokens del fragmento, y luego va a `/admin/login`. **Revocar / Reactivar** piden motivo, cierran de inmediato sus sesiones del panel y le avisan. **Traspasar** el rol de principal pide motivo y la contraseña del principal actual (se comprueba con un cliente aparte de Supabase).
- **Registro de actividad (AP-032)**: tabla `admin_actividad` de **solo inserción** (un trigger rechaza `UPDATE`, `DELETE` y `TRUNCATE`, incluso al dueño de la tabla, y se quitan esos permisos). `actividadModel.registrar(cliente, {...})` se llama con el **cliente de la transacción** de la acción: si la acción se deshace, la entrada también. Guarda fecha, administrador (id y nombre copiados), sección, acción, elemento, motivo y los valores anterior y nuevo (JSONB). El listado filtra por administrador, sección, acción y rango de fechas (hora de Chile); el detalle muestra anterior y nuevo lado a lado.
- **Motivo y aviso (AP-000 c4)**: las acciones que afectan a un usuario usan `partials/admin-accion-motivo` (formulario desplegable con motivo obligatorio + confirmación). El servidor vuelve a exigirlo con `leerMotivo` (`validadoresAdmin.js`), lo guarda en el registro y lo incluye en la notificación (tipo `moderacion`). Ya lo usan: activar/desactivar cuentas, eliminar equipos y cuentas (Administrador principal) y revocar/reactivar/traspasar administradores. `notificacionModel.notificarEnTransaccion` crea el aviso dentro de la transacción con un `SAVEPOINT` (si falla, la acción sigue) y también para cuentas desactivadas.

**Módulos que ya existían:**

**Archivos:** `controllers/admin*Controller.js`, `models/recintoModel.js`, `canchaModel.js`, `disponibilidadModel.js`, `cuentaAdminModel.js`, `catalogoModel.js`, vistas `admin/*`.

- **Recintos:** listado con búsqueda y filtros, crear, editar, activar y desactivar. Cada recinto tiene dirección, comuna, teléfono y coordenadas (validadas dentro de Chile).
- **Canchas:** se crean dentro de un recinto con nombre (único en el recinto, sin distinguir mayúsculas), precio por hora y modalidad. Al cambiar la modalidad, el sistema avisa si hay partidos futuros con otra modalidad.
- **Disponibilidad:** bloques de horario por día de la semana (apertura y cierre), que no se pueden superponer el mismo día.
- **Cuentas:** buscar por correo o nombre, desactivar y reactivar.
- **Catálogos:** modalidades, posiciones y niveles. Se pueden agregar, editar y eliminar, pero solo si no están en uso (se indica dónde se usan). Los elementos "protegidos" (los que el código busca por nombre, como "Portero" o "Principiante") se pueden editar pero no renombrar ni eliminar. Los nombres de tabla salen de una lista fija del código, nunca de lo que escribe el usuario.

**Superadministración** (`/admin/super`, solo rol "Superadministrador"; `controllers/superAdminController.js`, `models/superAdminModel.js`, vistas `admin/super-*`):

- **Resumen:** cuentas, jugadores, equipos, partidos próximos y conectados en las últimas 24 h / 7 días (según `auth.users.last_sign_in_at` de Supabase), más las 10 últimas conexiones.
- **Equipos:** buscar y **eliminar definitivamente** un equipo. En una transacción se borran sus desafíos y partidos (también del historial del rival), sus solicitudes y participaciones; las reservas ligadas a esos partidos se conservan sin el vínculo. Se notifica a los integrantes (tipo "moderacion").
- **Jugadores:** buscar y filtrar (todos, conectados últimos 7 días, cuentas activas, desactivadas) y **eliminar la cuenta completa** (perfil, solicitudes, comentarios, reservas, notificaciones, fila `usuario` y usuario de Supabase Auth). No se puede eliminar la propia cuenta, a otro superadministrador ni a quien creó equipos (hay que eliminar sus equipos primero). Si falla el borrado en Supabase Auth, se hace `ROLLBACK` y no se borra nada.
- **Torneos** (`controllers/adminTorneosController.js`, `models/torneoModel.js`, reglas puras en `config/torneos.js`; tablas `torneo`, `torneo_patrocinador`, `torneo_equipo` y `torneo_partido` en `sql/nuevas_tablas.sql` SA-2/SA-3):
  - **Crear/editar:** nombre, foto (obligatoria), tipo, modalidad, cantidad de equipos, cancha, premios y patrocinadores (cada uno con nombre y logo). El formulario es multipart: `subirImagenesTorneo` (multer, en memoria, 2 MB por imagen) y luego `validarTorneo`. Las imágenes se guardan en la base (BYTEA) y se sirven en `/torneos/:id/foto` y `/torneos/patrocinadores/:id/logo`. La cancha se elige con un `<datalist>` cuyo texto termina en `[#id]`.
  - **Cantidad:** relámpago 4, 8, 16 o 32 (llaves de eliminación directa: cada ronda deja a la mitad); liga 3 a 20, también impar (cada fecha descansa uno).
  - **Estados:** `inscripcion` → `en_curso` → `finalizado`. Los capitanes inscriben sus equipos (que jueguen la modalidad) desde `/torneos/:id`; la inscripción bloquea el torneo (`FOR UPDATE`) para no pasarse de los cupos. **Empezar torneo** solo se habilita con todos los cupos llenos: arma el fixture de liga (método del círculo) o sortea la primera ronda de la llave, y avisa a los integrantes.
  - **Resultados:** los carga el superadmin en el panel del torneo. Liga: tabla de posiciones (3/1/0; desempate por diferencia y goles a favor) y finaliza al jugarse todo. Relámpago: sin empates (si empatan se indica quién ganó por penales); al completar una ronda se crea la siguiente con los ganadores, y la final define al campeón. Un resultado de la llave solo se corrige mientras no exista la ronda siguiente. Tras empezar, el formato, la modalidad y la cantidad quedan fijos.
  - **Jugadores:** `/torneos` (tarjetas) y `/torneos/:id` (ficha, inscripción, tabla, fixture o llave), en `controllers/torneoController.js` y `routes/torneoRoutes.js`.

### 6.7 Canchas para usuarios (complejidad media)

**Archivos:** `controllers/canchasController.js`, `models/canchaModel.js`, `views/canchas/*`, `public/js/canchas-mapa.js`.

- `/canchas`: búsqueda por nombre de cancha o recinto (mínimo 3 letras) y filtros de región, comuna y modalidad (combinables). Muestra lista y **mapa** (Leaflet + OpenStreetMap, un marcador por recinto).
- `/canchas/:id`: ficha con datos, teléfono del recinto, mapa y la **disponibilidad de los próximos 7 días**, con las horas ya reservadas marcadas como ocupadas.
- Los usuarios solo ven canchas activas de recintos activos; si no, aparece "no disponible".

### 6.8 Notificaciones (complejidad baja-media)

**Archivos:** `controllers/notificacionController.js`, `models/notificacionModel.js`, `views/notificaciones/index.ejs`.

- `notificarUsuario`, `notificarCapitan` y `notificarIntegrantes` crean notificaciones (nunca para cuentas inactivas). Cada una tiene tipo, mensaje (máximo 500 caracteres) y un **enlace** opcional al elemento relacionado (por ejemplo `/desafios/12`).
- Bandeja con filtro por tipo; las no leídas van primero.
- `abrir` la marca como leída y redirige al enlace, pero solo si es una ruta interna (evita redirecciones a sitios externos).
- `contadorSinLeer` es un middleware global que pone en todas las vistas el número de la campana.

### 6.9 Desafíos (complejidad media)

**Archivos:** `controllers/desafioController.js`, `models/desafioModel.js`, `views/desafios/*`.

Estados: pendiente, aceptado, rechazado y cancelado.

- `/desafios?equipo=&ver=recibidos|enviados&estado=`: listas de enviados y recibidos de un equipo.
- `/desafios/:id`: detalle, visible solo para integrantes de los dos equipos.
- **Aceptar/rechazar** solo el capitán del desafiado; **cancelar** solo el capitán del desafiante.
- `cambiarEstado` trabaja en una transacción con `SELECT ... FOR UPDATE` (bloquea la fila): si dos personas responden a la vez, la segunda ve que ya no está pendiente. Devuelve un resultado (`ok`, `inexistente`, `sin-permiso`, `respondido`) que el controlador traduce a un mensaje. No basta con conocer la URL: el permiso lo comprueba el modelo.
- Al aceptarse, el desafío se puede convertir en partido (siguiente sección).

### 6.10 Reservas y partidos (complejidad alta)

**Archivos:** `controllers/reservaController.js`, `controllers/partidoController.js`, `models/reservaModel.js`, `models/partidoModel.js`, `views/reservas/*`, `views/partidos/*`, `public/js/sm-reserva.js`.

**Reservar una cancha (`reservaModel.insertarReserva`)**, siempre dentro de una transacción:

1. **Bloquea la cancha** con `SELECT ... FOR UPDATE`: si dos personas reservan a la vez, la segunda espera a que termine la primera, así nunca se crean dos reservas cruzadas.
2. Comprueba que la cancha y su recinto estén activos.
3. Comprueba que el horario pedido caiga completo dentro de un bloque de disponibilidad de ese día de la semana (el día se obtiene en SQL con `EXTRACT(ISODOW ...)` y se traduce a la clave `lunes`…`domingo`).
4. Comprueba que no se cruce con otra reserva confirmada. Dos intervalos se cruzan si `inicio_existente < fin_nuevo` y `fin_existente > inicio_nuevo`.
5. Calcula el costo (precio por hora × horas, redondeado) y lo guarda en la reserva, así no cambia si después sube el precio.
6. Inserta la reserva como "confirmada".

Devuelve un resultado (`creada`, `cancha-inactiva`, `fuera-de-horario`, `ocupado`) y la transacción hace `COMMIT` o `ROLLBACK` según corresponda. En el formulario, `sm-reserva.js` muestra el costo estimado en vivo (el servidor lo recalcula al guardar).

**Mis reservas (`/reservas`):** primero las futuras (la más próxima arriba) y luego las pasadas. Se pueden cancelar las propias, confirmadas y futuras; las que pertenecen a un partido solo se cancelan cancelando el partido.

**Programar un partido (`partidoModel.programar`)** desde un desafío aceptado, en una transacción:

1. Bloquea el desafío y comprueba: que exista, que quien programa sea capitán de alguno de los dos equipos, que esté aceptado y sin partido, y que ambos equipos estén activos.
2. Bloquea la cancha y comprueba que su modalidad sea la elegida.
3. **Regla 15:** comprueba que ninguno de los dos equipos tenga otro partido no cancelado que se cruce con ese horario (cada partido dura `DURACION_PARTIDO_MIN` = 60 minutos).
4. Inserta el partido y la **participación** de ambos equipos (desafiante y desafiado).
5. Crea la reserva de la cancha con `insertarReserva` (que revisa disponibilidad y choques en la cancha). Si la reserva falla, se deshace todo.

**Resultado (regla 16):** solo después de la fecha y hora del partido, una sola vez y solo por un capitán de los dos equipos.

**Cancelar partido:** con motivo opcional; también cancela su reserva y notifica a los integrantes.

Todas las horas se comparan con la hora de Chile (`now() AT TIME ZONE 'America/Santiago'`).

### 6.11 Agenda e inicio (complejidad baja-media)

**Archivos:** `controllers/agendaController.js`, `views/agenda/index.ejs`, `views/partials/sm-equipo-inicio.ejs`.

- `/agenda?mes=AAAA-MM&dia=AAAA-MM-DD&lista=proximos|pasados`: calendario mensual. `celdasDelMes` arma la grilla (incluye los días vacíos antes del día 1 para que el mes empiece en la columna correcta, con lunes como primer día) y marca los días con partido de los equipos de la cuenta. Debajo, los partidos del día elegido y la lista de próximos o pasados.
- `/inicio/equipo?id=`: guarda en una cookie qué equipo muestra el panel del inicio (para quien tiene varios equipos). `datosEquipoInicio` arma ese panel con su próximo partido.

---

## 7. Base de datos: `sql/`

| Archivo | Qué hace |
|---|---|
| `searchmatch.sql` | Esquema **original en MySQL** (referencia histórica; no se ejecuta en Supabase). |
| `seed.sql` | El mismo esquema **portado a PostgreSQL**, re-ejecutable (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). Las secciones A–R crean las tablas, la S carga los datos iniciales (roles, niveles, posiciones, estados, modalidades, etc.) y la T es una verificación opcional. Las secciones U en adelante son ampliaciones: **U** integra Supabase Auth (`usuario.auth_id`, contraseña opcional, RLS activado sin políticas para que la API pública no lea `usuario` ni `jugador`); **V** agrega el perfil deportivo y las estadísticas; **W** los datos del equipo creado desde la app; **X** la foto de la carta; **Y** el apodo; **Z** el mensaje de la solicitud; **AA** el escudo y las posiciones en la cancha; **AB** las invitaciones. |
| `nuevas_tablas.sql` (SA-6) | Panel de administración: columnas `admin_nombre`, `admin_seleccionado_en`, `admin_seleccionado_por` y `admin_revocado_en` en `usuario`; tablas `admin_sesion`, `admin_intento` y `admin_actividad` (con el trigger que la hace inmutable). |
| `nuevas_tablas.sql` | Agregados del "avance al 75 %". Se ejecuta **después** de `seed.sql`, solo agrega (no borra nada) y es re-ejecutable: estados "cancelada", regiones y comunas, aceptación de términos, nombre de cancha único por recinto, costo guardado en la reserva, tipos de notificación y enlace, moderación de comentarios, posiciones buscadas por un equipo, partidos cancelados y resultado, y reserva asociada a un partido. |

**Tablas principales:** catálogos (`rol_aplicacion`, `nivel`, `posicion`, `rol_equipo`, `estado_*`, `tipo_notificacion`, `modalidad`), ubicación (`region`, `comunas`, `direccion`), personas (`usuario`, `jugador`, `jugador_posicion`), equipos (`equipo`, `equipo_jugador`, `solicitud_union_equipo`, `invitacion_equipo`, `equipo_posicion_buscada`), canchas (`recinto_deportivo`, `cancha`, `disponibilidad_cancha`, `reservar_cancha`), competencia (`desafio`, `partido`, `participacion`) y comunidad (`comentario`, `notificacion`).

---

## 8. Navegador: `public/js/`

Todo es JavaScript puro, sin frameworks. **Regla general:** las páginas funcionan sin JavaScript (los formularios se envían normalmente y el servidor valida); el JavaScript solo mejora la experiencia.

| Archivo | Qué hace |
|---|---|
| `main.js` | Se carga en todas las páginas: animaciones de aparición al hacer scroll (`IntersectionObserver`), formato del teléfono chileno mientras se escribe, brillo de las tarjetas que sigue al cursor, inclinación 3D de la carta de jugador, línea del "Cómo funciona" que se rellena con el scroll, botón "Volver" (vuelve atrás si se llegó desde el mismo sitio; si no, va a una página de respaldo) y **`confirmarAccion()`**, un modal de confirmación con el estilo del sitio que usan otros archivos en lugar de `window.confirm`. |
| `auth.js` | Formularios de login, registro y crear equipo: valida en el navegador con las mismas reglas que el servidor, muestra los errores bajo cada campo y un resumen, pone el botón en "cargando" mientras responde el servidor y muestra/oculta contraseñas. |
| `sm-formularios.js` | Comportamientos reutilizables que se activan con atributos `data-*`: marcar campos obligatorios vacíos, pedir confirmación antes de enviar, habilitar el botón solo con la casilla de términos marcada, ver contraseñas y filtrar las comunas según la región elegida. |
| `wizard.js` | Asistente del perfil de jugador: muestra un paso a la vez, valida antes de avanzar, llena el resumen del último paso y envía. |
| `crear-equipo.js` | Asistente de equipo: pasos, validación y vista previa en vivo ("así te verán los rivales"). |
| `rol.js` | Pantalla "¿Cómo quieres empezar?": habilita el botón al elegir y cambia su texto según el rol. |
| `editar-perfil.js` | Carta en vivo mientras se edita. La foto se **recorta al centro en un cuadrado y se comprime a JPEG** con un `<canvas>` (queda en ~100 KB). Al guardar, primero sube o elimina la foto con `fetch` y después envía el formulario. |
| `perfil.js` | "Descargar carta" (dibuja la carta completa, con foto, bandera y estadísticas, en un `<canvas>` y la descarga como PNG) y "Compartir carta" (menú nativo con Web Share; si no existe, la descarga). |
| `equipo.js` | Directorio y panel del equipo: buscador que filtra tarjetas al escribir, modal de "Solicitar unirme" enviado con `fetch`, evitar doble envío en aceptar/rechazar, modal de desafío, **cancha táctica arrastrable** (también con flechas del teclado; guarda la posición en % al soltar), sacar jugadores, subir el escudo reducido e invitar jugadores. |
| `dashboard.js` | Avisos de "próximamente", parallax del encabezado según el mouse y confirmación de "Salir del equipo". |
| `cyber.js` | Efectos del estilo "cyber-sport": detecta navegadores sin aceleración gráfica (modo liviano), pausa animaciones de fondo durante el scroll, onda al hacer clic (*ripple*) y círculo de luz que sigue al cursor. |
| `canchas-mapa.js` | Dibuja el mapa de canchas con Leaflet. Los datos vienen del servidor en un `<script type="application/json">`; el contenido de cada globo se arma con `textContent` (nunca HTML del usuario). |
| `sm-reserva.js` | Costo estimado de la reserva en vivo (precio por hora × duración). |
| `visualizador-corporal.js` | Silueta que se ajusta a la altura (escala hasta tocar esa marca de la regla) y al peso (el IMC ensancha torso, brazos y piernas, sin deformar la cabeza), con animación de ~300 ms al cambiar. |

### `ball.js` — la pelota 3D de la landing (complejidad alta)

Dibuja con **Three.js** (cargado desde un CDN con `import()` dinámico) un balón de fútbol de paneles de carbono con costuras de luz neón.

**Geometría:**

- El balón clásico es un **icosaedro truncado**: 12 pentágonos y 20 hexágonos. `buildTruncatedIcosahedron` parte de los 12 vértices de un icosaedro: cada cara (triángulo) se convierte en un hexágono y cada vértice en un pentágono, usando puntos a 1/3 de cada arista proyectados sobre la esfera.
- `buildPanelGeometry` convierte cada polígono en un panel "acolchado": acerca las esquinas al centro para abrir la costura (`gap`), arma el panel como un abanico de triángulos subdivididos desde el centro y hace que el centro sobresalga (`bulge`) y baje redondeado hacia el borde. Comprueba que cada triángulo mire hacia afuera.
- Dentro hay un **núcleo de luz neón** que solo se ve a través de las costuras.

**Escena:** halo con efecto Fresnel en el borde, luz principal, contraluces neón, foco de estadio desde arriba y una luz que sigue al cursor, órbitas con cometas (cabeza + estela que se apaga), polvo de luz flotante, chispas y ondas expansivas.

**Interacción:**

- **Arrastrar:** gira la pelota sobre los ejes de la pantalla (arrastrar hacia arriba siempre la gira hacia arriba) y al soltar sigue girando con inercia, que luego vuelve al giro lento automático.
- **Mover el mouse:** la pelota se inclina hacia el cursor.
- **Clic corto sin arrastrar = "remate":** giro fuerte (más giro si se golpea cerca del borde; al centro sale más "derecha" y rápida), chispas, dos ondas expansivas, retroceso y rebote (*squash & stretch*) y un marcador con la velocidad en km/h. Mientras más rápido gira, más brillan las costuras.

**Rendimiento:** se pausa cuando la pelota no está en pantalla, limita a 60 fps (30 en modo liviano), limita la densidad de píxeles a 1,5 y en modo liviano usa menos triángulos y materiales más simples. Si no hay WebGL o Three.js no carga, el escenario recibe la clase `sin-3d` y se muestra un balón de respaldo hecho en CSS. Respeta `prefers-reduced-motion`.

---

## 9. Estilos: `public/css/`

| Archivo | Para qué |
|---|---|
| `style.css` | Hoja base de todo el sitio (modo oscuro con acento verde neón): variables de color, tipografía, barra de navegación, botones, landing y balón de respaldo, tarjetas, formularios, alertas, página de error, pie y animaciones. |
| `cyber.css` | Sistema visual "cyber-sport" compartido (dashboard, login, registro, equipo): variables, fondo animado (aurora, cancha táctica, haz de luz, ruido), cursor de luz y *ripple*. Lo que se anima en bucle usa solo `transform` y `opacity` (lo procesa la GPU) y se pausa durante el scroll. |
| `dashboard.css` | Dashboard: encabezado con parallax, paneles de vidrio, carta holográfica, estadísticas, esqueletos de carga, accesos, aviso flotante y la barra de navegación inferior (*dock*). |
| `auth.css` | Login y registro: escena, panel de marca, tarjeta, pestañas, campos y estados de envío. |
| `equipo.css` | Panel del capitán y directorio: encabezado, tarjetas, solicitudes, cancha táctica con las cartas del plantel. |
| `crear-equipo.css` | Asistente de equipo (reutiliza la base del asistente de jugador). |
| `modulos.css` | Estilos de las funciones nuevas, todos con prefijo `sm-` para no chocar con lo anterior. |

---

## 10. Vistas: `views/`

Plantillas EJS. Cada página incluye `partials/header` y `partials/footer`.

- **Páginas principales:** `index` (landing), `login`, `registro`, `seleccionar-rol`, `dashboard`, `perfil-jugador`, `perfil`, `editar-perfil`, `crear-equipo`, `equipo-panel`, `equipos`, `mis-equipos`, `solicitud-jugador`, `torneos`, `error` y `mensaje` (mensaje genérico para elementos que no existen o sin permiso).
- **Por módulo:** `admin/`, `agenda/`, `canchas/`, `cuenta/`, `desafios/`, `equipos/`, `legal/`, `notificaciones/`, `partidos/`, `reservas/`.
- **Partials reutilizables:**
  - `header` / `footer`: `<head>`, fuentes (una sola petición a Google Fonts), hojas de estilo según la página (con `?v=versionAssets`), barra superior con la campana, y los scripts al final.
  - `carta-jugador`: la carta grande (modo editor con botón de foto y modo mini para el plantel en la cancha).
  - `dock`: barra de navegación inferior con la sección activa.
  - `boton-volver`, `auth-marca`, `admin-nav`, `escudo-equipo`, `fondo-cyber`, `perfil-resumen`, `mis-equipos`, `visualizador-corporal`, `sm-ojo` (ícono de ver contraseña), `sm-ubicacion` (listas de región y comuna), `sm-cancha-campos`, `sm-equipo-inicio` y `sm-equipos-buscan`.

EJS escapa el texto con `<%= %>` (seguro frente a HTML del usuario); `<%- %>` se usa solo para incluir partials o HTML generado por el propio código.

---

## 11. Scripts de mantenimiento: `scripts/`

| Script | Uso |
|---|---|
| `ejecutar-sql.js` | `node scripts/ejecutar-sql.js sql/nuevas_tablas.sql` — ejecuta un archivo `.sql` completo en **una transacción**: si una sentencia falla, se deshace todo. |
| `hacer-admin.js` | Para la **instalación** (después, los administradores se crean en `/admin/administradores`). `node scripts/hacer-admin.js correo@ejemplo.com --crear "Nombre"` crea la cuenta del panel y envía la invitación; sin `--crear` convierte una cuenta existente en Administrador; `--super` la deja como Administrador principal (`--reemplazar` traspasa si ya hay uno). Si todavía no existe un Administrador principal, la primera cuenta del panel queda como principal (AP-011 c1). |

---

## 12. Reglas de negocio

Reglas numeradas del proyecto que el código aplica:

| Regla | Qué dice | Dónde se aplica |
|---|---|---|
| 1 | El capitán también es jugador de su equipo: completa su perfil (posiciones y carta) igual que todos, también con el rol "equipo". | `pageController.leerPerfilJugador` |
| 4 | Ningún equipo queda sin capitán: para desactivar la cuenta hay que desactivar antes los equipos que capitanea. | `cuentaModel.equiposActivosComoCapitan`, `equipoFichaController.desactivarCuenta` |
| 5 | Máximo de equipos activos que una cuenta puede crear (`MAX_EQUIPOS_COMO_CAPITAN`). | `config/equipo.js`, `equipoController` |
| 6 | Solicitud e invitación no se duplican; al aceptar una, la otra pendiente se cancela. | `equipoModel.responderSolicitud`, `invitarJugador`, `solicitarUnion` |
| 7 | Una cuenta desactivada pierde la sesión en su siguiente petición. | `authMiddleware.cargarSesion` |
| 8 | Todas las estadísticas parten en 50 y solo las cambia el sistema. | `config/perfilJugador.js`, `validarEdicionPerfil` |
| 10 | El puntaje inicial del equipo es el mínimo de su nivel. | `equipoModel.crearEquipo` |
| 11 | La ubicación del equipo es una comuna de la lista oficial. | `validarEquipo`, `ubicacionModel` |
| 12 | Solo se desafía a equipos de la misma modalidad. | `equipoModel.listarRivales`, `enviarDesafio` |
| 15 | Sin choques de horario, ni por equipo ni por cancha. | `partidoModel.equipoOcupado`, `reservaModel.cruzaConReserva` |
| 16 | El resultado se registra una sola vez, después del partido y solo por un capitán. | `partidoModel.registrarResultado` |
| P1 | Al panel solo entran cuentas del panel seleccionadas por el Administrador principal, por `/admin/login`; 5 fallos seguidos bloquean 15 min y 30 min sin actividad cierran la sesión. | `adminAccesoController`, `rolMiddleware.requireAdmin`, `panelModel` |
| P2 | Solo el Administrador principal gestiona administradores; hay uno solo y el rol se traspasa con su contraseña. | `requirePrincipal`, `panelModel.traspasarPrincipal`, índice `ux_un_solo_superadmin` |
| P3 | Toda acción del panel que cambia datos queda en el registro de actividad, en la misma transacción, con valor anterior y nuevo; el registro no se edita ni se borra. | `actividadModel.registrar`, trigger `tr_admin_actividad_inmutable` |
| P4 | Toda acción del panel que afecta a un usuario exige un motivo, que se le notifica. | `leerMotivo`, `partials/admin-accion-motivo`, `notificarEnTransaccion` |
| P5 | Todo listado del panel se busca, filtra, ordena, pagina y exporta a CSV con los mismos filtros, y la URL guarda el estado. | `config/listados.js`, `partials/listado-*` |

---

## 13. Patrones que se repiten en todo el código

- **Consultas parametrizadas** (`$1`, `$2`, …) en todos los modelos: los datos del usuario nunca se pegan dentro del SQL, lo que evita la inyección SQL. Cuando una parte del SQL sí es dinámica (una columna o una tabla), sale de una lista fija del código.
- **Transacciones** (`BEGIN` / `COMMIT` / `ROLLBACK`) en toda operación que toca varias filas o que debe comprobar algo antes de escribir. Siempre con el mismo esquema: `pool.connect()`, `try` con `BEGIN`, `catch` con `ROLLBACK`, `finally` con `release()`.
- **`SELECT ... FOR UPDATE`** para bloquear la fila que se va a decidir (cancha, desafío, solicitud, equipo) y evitar que dos peticiones simultáneas pasen las mismas comprobaciones.
- **Los modelos devuelven un "resultado" en texto** (`'creada'`, `'ocupado'`, `'sin-permiso'`, …) en vez de lanzar errores por casos esperados; el controlador tiene un mapa de esos resultados a mensajes en español.
- **Permisos en el modelo:** que una URL exista no basta. El modelo comprueba en la misma consulta que quien actúa sea el capitán o integrante correspondiente.
- **Validación doble:** en el navegador (ayuda) y en el servidor (la que vale), con las mismas reglas.
- **HTML o JSON según quién pregunta:** las acciones que el JavaScript envía con `fetch` reciben JSON; los mismos formularios sin JavaScript reciben una redirección con un aviso.
- **Mejora progresiva:** cada página funciona sin JavaScript; el JavaScript agrega animaciones, modales y envíos sin recargar.
- **Fallos no críticos no rompen la acción principal:** notificaciones, sincronización de correo o aceptación de términos solo registran el error en la consola.
- **Hora de Chile** para todo lo que es "antes" o "después" (`America/Santiago`).
- **Acciones del panel:** transacción + `actividadModel.registrar(cliente, …)` con valor anterior y nuevo + motivo (`leerMotivo`) cuando afecta a un usuario + aviso con `notificarEnTransaccion` o, tras el `COMMIT`, `notificarUsuario`.
- **Listados del panel:** una definición (`buscar`, `filtros`, `orden`) por listado en su modelo, `leerListado` → `construirSQL` → `vistaListado`, los partials `listado-*` en la vista y `?formato=csv` para exportar.

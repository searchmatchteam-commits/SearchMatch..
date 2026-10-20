# auth-app

Aplicación web de autenticación de usuarios (registro, inicio de sesión, cierre de sesión y rutas protegidas) construida con **Node.js + Express** siguiendo el patrón **MVC**, motor de vistas **EJS** y **PostgreSQL alojado en Supabase** (conectado con el paquete `pg`).

> La autenticación es 100% propia: se usa `express-session` para las sesiones y `bcrypt` para cifrar contraseñas. **No** se usa supabase-js ni Supabase Auth.

---

## Características

- Registro con validación (email válido, contraseña mínima de 8 caracteres, campos obligatorios) y mensajes de error en la vista.
- Control de email duplicado con mensaje claro.
- Inicio y cierre de sesión con cookies firmadas (`express-session`).
- Rutas protegidas mediante middleware (`/dashboard`).
- Consultas parametrizadas de PostgreSQL (`$1, $2...`) contra inyección SQL.
- Middleware de errores al final de `app.js` (404 y 500).
- Separación de responsabilidades: **rutas → controladores → modelos**; solo los modelos tocan la base de datos.

---

## Requisitos

- **Node.js** 18 o superior y **npm**.
- Una cuenta en [Supabase](https://supabase.com).
- (Opcional) `psql` o cualquier cliente PostgreSQL.

---

## Estructura del proyecto

```
auth-app/
├── .gitignore
├── app.js                  → punto de entrada (Express, middlewares, vistas, rutas, errores)
├── .env.example            → plantilla de variables de entorno
├── package.json
├── README.md
├── config/
│   └── db.js               → Pool de pg con SSL + función de prueba de conexión
├── controllers/
│   ├── authController.js   → registro, login, logout y formularios
│   └── pageController.js   → raíz y dashboard
├── middlewares/
│   ├── authMiddleware.js   → requireAuth y redirectIfAuthenticated
│   ├── validators.js       → validación de formularios
│   └── errorHandler.js     → 404 y manejo centralizado de errores
├── models/
│   └── userModel.js        → findByEmail, create, findById (única capa de acceso a datos)
├── public/
│   ├── css/style.css
│   ├── js/main.js
│   └── img/
├── routes/
│   ├── authRoutes.js       → /login, /registro, /logout
│   └── indexRoutes.js      → / y /dashboard
├── sql/
│   ├── seed.sql              → esquema COMPLETO en PostgreSQL: tabla "usuarios" (app) + todas las tablas de searchmatch + datos iniciales
│   └── searchmatch.sql       → DDL MySQL original de searchmatch (solo referencia, no se ejecuta)
└── views/
    ├── partials/header.ejs
    ├── partials/footer.ejs
    ├── login.ejs
    ├── registro.ejs
    ├── dashboard.ejs
    └── error.ejs
```

---

## Configuración de Supabase (paso a paso)

1. **Crear el proyecto**
   - Entra a [supabase.com](https://supabase.com) → *New project*.
   - Elige nombre, región y guarda la **database password** que generes (anótala).

2. **Copiar la cadena de conexión**
   - En el Dashboard: **Project Settings → Database → Connection string → URI**.
   - Copia la cadena. Te quedará algo como:
     ```
     postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxx.supabase.co:5432/postgres
     ```
   - Reemplaza `[YOUR-PASSWORD]` por la contraseña real de la base de datos.

3. **Ejecutar el seed (refleja searchmatch completo en Supabase)**
   - En el Dashboard: **SQL Editor** → *New query*.
   - Pega todo el contenido de [`sql/seed.sql`](sql/seed.sql) → **Run**.
   - Este script crea **todo el esquema** de searchmatch en PostgreSQL (catálogos, usuarios, jugadores, equipos, canchas, reservas, desafíos, partidos, etc.), más la tabla `usuarios` que usa auth-app, y carga los datos iniciales.
   - Es re-ejecutable: usa `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`.
   - Para verificar: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`

4. **Configurar el `.env`**
   - Copia la plantilla:
     ```bash
     cp .env.example .env
     ```
   - Pega la cadena de conexión en `DATABASE_URL` y define `SESSION_SECRET` y `PORT` (ver abajo).

> **Nota:** la conexión usa `ssl: { rejectUnauthorized: false }` (configurado en `config/db.js`) porque Supabase termina SSL con certificados que Node no valida contra una CA local.

> **Nota sobre searchmatch:** el esquema completo de searchmatch (originariamente en MySQL) ya está portado a PostgreSQL dentro de `sql/seed.sql`, por lo que se refleja en Supabase al ejecutarlo. `sql/searchmatch.sql` conserva el DDL MySQL original solo como referencia histórica. La app (auth) usa la tabla `usuarios`; las tablas de negocio (`usuario`, `jugador`, `equipo`, etc.) quedan listas en la misma base para el resto del proyecto.

---

## Variables de entorno

Crea un archivo `.env` en la raíz del proyecto (ya existe `.env.example` como plantilla):

```env
DATABASE_URL=postgresql://postgres:TU_PASSWORD@db.TU_PROYECTO.supabase.co:5432/postgres
SESSION_SECRET=cambia-esta-cadena-por-una-larga-y-aleatoria
PORT=3000
```

| Variable         | Descripción                                                        |
|------------------|--------------------------------------------------------------------|
| `DATABASE_URL`   | Cadena de conexión URI de Supabase (Project Settings → Database).  |
| `SESSION_SECRET` | Secreto para firmar la cookie de sesión.Usa una cadena larga y aleatoria. |
| `PORT`           | Puerto del servidor (por defecto `3000`).                          |

El archivo `.env` está incluido en `.gitignore`: **nunca se sube a Git**.

---

## Instalación y ejecución

```bash
# 1) Entrar a la carpeta del proyecto
cd auth-app

# 2) Instalar dependencias
npm install

# 3) Crear el archivo de entorno y editarlo
cp .env.example .env

# 4) Ejecutar sql/seed.sql en el SQL Editor de Supabase

# 5) Arrancar el servidor
npm start
```

Abrí [http://localhost:3000](http://localhost:3000).

En desarrollo (reinicia al guardar cambios):

```bash
npm run dev
```

Si la conexión a Supabase falla, verás en consola un mensaje claro tipo:

```
❌ No se pudo conectar a Supabase (PostgreSQL).
   Mensaje: ...
   Revisa en .env: DATABASE_URL, contraseña y el parámetro ssl { rejectUnauthorized: false }.
```

---

## Rutas

| Método | Ruta        | Acción                                        | Protegida |
|--------|-------------|-----------------------------------------------|-----------|
| GET    | `/`         | Redirige a `/dashboard` o `/login`            | No        |
| GET    | `/registro` | Muestra el formulario de registro             | No        |
| POST   | `/registro` | Valida y crea el usuario                      | No        |
| GET    | `/login`    | Muestra el formulario de login                | No        |
| POST   | `/login`    | Valida credenciales y crea la sesión          | No        |
| POST   | `/logout`   | Destruye la sesión                            | Sí*       |
| GET    | `/dashboard`| Página protegida                              | **Sí**    |

\* `logout` solo tiene sentido con sesión; sin ella simplemente no hay nada que destruir.

---

## Flujo de inicio de sesión (login → dashboard)

1. El usuario abre `/login` y el **navegador envía un POST** a `/login` con `email` y `password`.
2. `routes/authRoutes.js` encadena el middleware `validarLogin` (`middlewares/validators.js`): si falta un campo o el email tiene mal formato, se re-renderiza `views/login.ejs` con la lista de errores y el formulario se cierra ahí.
3. Con los datos válidos, el router llama a `authController.iniciarSesion`.
4. El controlador llama a `userModel.findByEmail(email)`, que ejecuta en `config/db.js` una consulta **parametrizada**: `SELECT ... FROM usuarios WHERE email = $1`.
5. Si no hay usuario, o `bcrypt.compare(password, usuario.password_hash)` devuelve `false`, se responde 401 con el mensaje genérico *"Email o contraseña incorrectos"* (sin revelar si el email existe).
6. Si la contraseña coincide, se guarda el usuario en la sesión: `req.session.usuario = { id, nombre, email }`. `express-session` crea la cookie de sesión (firmada, `httpOnly`) y la envía al navegador.
7. El controlador responde con `res.redirect('/dashboard')`.
8. En la petición a `/dashboard`, el middleware `requireAuth` (`middlewares/authMiddleware.js`) comprueba `req.session.usuario`; como existe, hace `next()` y llega al `pageController.dashboard`.
9. El controlador renderiza `views/dashboard.ejs` con los datos del usuario → el navegador muestra el dashboard.

Si alguien accede a `/dashboard` **sin sesión**, `requireAuth` lo redirige a `/login?msg=Debes_iniciar_sesion` y la vista muestra el aviso.

---

## Seguridad aplicada

- Contraseñas cifradas con `bcrypt` (10 rondas); jamás se guarda la contraseña en texto plano.
- Consultas parametrizadas (`$1, $2...`) en todo el modelo: sin inyección SQL.
- Cookie de sesión `httpOnly` (inaccesible desde JS) firmada con `SESSION_SECRET`.
- Mensajes de error genéricos en login (no se filtra qué emails existen).
- `.env` ignorado por Git.
- Validación de datos en el servidor (la del cliente es solo cosmética).

---

## License

MIT

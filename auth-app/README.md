# auth-app (SearchMatch)

Landing page y autenticación de **SearchMatch**, plataforma de fútbol amateur en Chile. Construida con **Node.js + Express** (patrón **MVC**), vistas **EJS**, **Supabase Auth** (`@supabase/supabase-js` + `@supabase/ssr`) para registro/login y **PostgreSQL de Supabase** (`pg`) para el perfil en las tablas `usuario` y `jugador`.

---

## Características

- Landing en `/` (modo oscuro + verde neón) con balón 3D interactivo en Three.js (CDN), con respaldo sin WebGL y respeto a `prefers-reduced-motion`.
- Registro con Supabase Auth (`signUp`) + perfil en `usuario`/`jugador` dentro de una transacción.
- Login con `signInWithPassword`. La sesión la maneja `@supabase/ssr` en cookies `sb-<proyecto>-auth-token` (`httpOnly`, `sameSite=lax`, `secure` en producción).
- Verificación de la sesión con Supabase en cada petición y renovación automática con el refresh token.
- Confirmación de correo en `/auth/confirmar` (flujo PKCE o `token_hash`): el enlace del correo abre la sesión directamente.
- Validación en el servidor (correo, celular chileno, contraseña ≥ 8, confirmación) con mensajes en español.
- Errores de Supabase traducidos al español; página de error sin detalles internos.

---

## Estructura

```
auth-app/
├── app.js                  → Express, cookies, sesión, rutas y errores
├── config/
│   ├── db.js               → Pool de pg (tablas usuario / jugador)
│   └── supabase.js         → cliente @supabase/ssr por petición + cliente admin (solo servidor)
├── controllers/
│   ├── authController.js   → registro, confirmación de correo, login, logout, traducción de errores
│   └── pageController.js   → landing y dashboard
├── middlewares/
│   ├── authMiddleware.js   → cargarSesion (crea req.supabase), requireAuth, redirectIfAuthenticated
│   ├── validators.js       → validación de formularios
│   └── errorHandler.js     → 404 y errores
├── models/userModel.js     → Supabase Auth + tablas usuario/jugador
├── public/                 → css/style.css, js/main.js, js/ball.js, img/
├── routes/                 → authRoutes.js, indexRoutes.js
├── sql/seed.sql            → esquema PostgreSQL + integración con Supabase Auth (sección U)
└── views/                  → index, login, registro, dashboard, error + partials
```

---

## Configuración

1. **Base de datos:** en Supabase → *SQL Editor*, ejecuta `sql/seed.sql` (re-ejecutable). La sección **U** agrega `usuario.id_auth` (vínculo con `auth.users`), deja `contrasena` y `jugador.fecha_nacimiento` opcionales y activa RLS en `usuario` y `jugador`.
2. **Variables de entorno:** copia `.env.example` a `.env` y complétalo:

| Variable                    | Descripción                                                              |
|-----------------------------|--------------------------------------------------------------------------|
| `SUPABASE_URL`              | URL base del proyecto (`https://xxxx.supabase.co`, sin `/rest/v1`).       |
| `SUPABASE_ANON_KEY`         | Clave anon / publishable (también se acepta `SUPABASE_PUBLISHABLE_KEY`).  |
| `SUPABASE_SERVICE_ROLE_KEY` | Opcional, solo servidor: deshace el registro si falla el guardado del perfil. |
| `DATABASE_URL`              | URI de conexión de Postgres (Project Settings → Database).                |
| `APP_URL`                   | URL pública de la app, para el enlace del correo de confirmación.         |
| `PORT`                      | Puerto (por defecto `3000`).                                              |

3. **Supabase Auth:** en *Authentication → URL Configuration* define *Site URL* = `APP_URL` y agrega `APP_URL/auth/confirmar` a *Redirect URLs*.
   - Opcional (recomendado): para que el enlace funcione aunque se abra en otro navegador o en el celular, cambia la plantilla *Confirm signup* (*Authentication → Emails*) para que apunte a `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`.

---

## Ejecución

```bash
cd auth-app
npm install
npm run dev     # o npm start
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Rutas

| Método | Ruta         | Acción                                         | Protegida |
|--------|--------------|------------------------------------------------|-----------|
| GET    | `/`          | Landing page                                   | No        |
| GET    | `/registro`  | Formulario de registro (logueado → dashboard)  | No        |
| POST   | `/registro`  | Valida, crea la cuenta en Auth y el perfil     | No        |
| GET    | `/auth/confirmar` | Enlace del correo: confirma y abre la sesión | No   |
| GET    | `/login`     | Formulario de login (logueado → dashboard)     | No        |
| POST   | `/login`     | Valida credenciales con Supabase               | No        |
| POST   | `/logout`    | Revoca la sesión y borra las cookies           | —         |
| GET    | `/dashboard` | Panel del usuario                              | **Sí**    |

---

## License

MIT

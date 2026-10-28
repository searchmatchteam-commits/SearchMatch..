// controllers/administradoresController.js
// AP-011 · Sección Administradores (solo el Administrador principal): listar, crear, revocar,
// reactivar y traspasar el rol de principal. Las cuentas se crean en Supabase Auth con una invitación
// por correo para que la persona defina su contraseña (no hay registro de administradores en la app).

const panelModel = require('../models/panelModel');
const cuentaModel = require('../models/cuentaModel');
const userModel = require('../models/userModel');
const { notificarUsuario } = require('../models/notificacionModel');
const { supabaseAdmin, crearClienteTemporal } = require('../config/supabase');
const { leerListado, vistaListado, enviarCSV } = require('../config/listados');
const { idValido, leerMotivo, MSG_MOTIVO } = require('../middlewares/validadoresAdmin');

const AVISOS = {
  creado: 'Administrador creado: le enviamos un correo para que defina su contraseña.',
  'creado-sin-correo': 'Administrador creado, pero el correo de invitación no se pudo enviar: pídele que use "¿Olvidaste tu contraseña?".',
  revocado: 'Acceso revocado: su sesión del panel se cerró y ya no puede entrar.',
  reactivado: 'Acceso reactivado: ya puede volver a ingresar al panel.',
  traspasado: 'Traspasaste el rol de Administrador principal. Ahora eres administrador.',
  inexistente: 'Ese administrador ya no existe.',
  principal: 'El acceso del Administrador principal no se puede revocar: primero traspasa el rol.',
  propia: 'No puedes hacer esto con tu propia cuenta.',
  'sin-cambio': 'No hubo cambios: ya estaba en ese estado.',
  'no-disponible': 'Solo puedes traspasar el rol a un administrador con acceso vigente.',
  motivo: MSG_MOTIVO,
  contrasena: 'La contraseña no es correcta: no se traspasó el rol.',
};

const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function urlApp() {
  return process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
}

function principal(req) {
  return { id: req.usuario.id, nombre: req.usuario.nombre || req.usuario.correo };
}

async function render(req, res, { status = 200, datos = {}, erroresCampo = {} } = {}) {
  const estado = leerListado(req.query, panelModel.LISTADO);
  const { filas, total } = await panelModel.listar(estado);
  const activos = (await panelModel.listar({ ...estado, texto: '', filtros: { estado: 'activo' }, pagina: 1, por: 100 })).filas
    .filter((a) => !a.esPrincipal);
  return res.status(status).render('admin/administradores', {
    titulo: 'Administradores',
    pagina: 'equipo',
    seccion: 'administradores',
    administradores: filas,
    candidatosPrincipal: activos,
    listado: vistaListado('/admin/administradores', estado, panelModel.LISTADO, total),
    filtrosVista: [
      { clave: 'estado', etiqueta: 'Estado', tipo: 'opcion', opciones: [{ valor: 'activo', texto: 'Activo' }, { valor: 'revocado', texto: 'Revocado' }] },
      { clave: 'desde', etiqueta: 'Seleccionado desde', tipo: 'fecha' },
      { clave: 'hasta', etiqueta: 'Seleccionado hasta', tipo: 'fecha' },
    ],
    datos,
    erroresCampo,
    miId: req.usuario.id,
    aviso: AVISOS[req.query.aviso] || null,
  });
}

async function listar(req, res, next) {
  try {
    if (req.query.formato === 'csv') {
      const { filas } = await panelModel.listar(leerListado(req.query, panelModel.LISTADO), { todo: true });
      return enviarCSV(res, 'administradores', [
        { titulo: 'Nombre', valor: (a) => a.nombre },
        { titulo: 'Correo', valor: (a) => a.correo },
        { titulo: 'Rol', valor: (a) => a.rolTexto },
        { titulo: 'Estado', valor: (a) => a.estadoTexto },
        { titulo: 'Último acceso', valor: (a) => a.ultimoAcceso },
        { titulo: 'Seleccionado el', valor: (a) => a.seleccionadoEn },
        { titulo: 'Seleccionado por', valor: (a) => a.seleccionadoPor },
      ], filas);
    }
    return await render(req, res);
  } catch (err) {
    return next(err);
  }
}

/** AP-011 c2 y c5: crea la cuenta (si el correo no pertenece a ninguna otra) y envía la invitación. */
async function crear(req, res, next) {
  const datos = {
    nombre: String(req.body.nombre || '').trim().replace(/\s+/g, ' '),
    correo: String(req.body.correo || '').trim().toLowerCase(),
  };
  const erroresCampo = {};
  if (datos.nombre.length < 2 || datos.nombre.length > 100) erroresCampo.nombre = 'Escribe el nombre (2 a 100 caracteres).';
  if (!REGEX_CORREO.test(datos.correo) || datos.correo.length > 150) erroresCampo.correo = 'Escribe un correo válido.';
  try {
    if (!erroresCampo.correo && await panelModel.correoEnUso(datos.correo)) {
      erroresCampo.correo = 'Ese correo ya pertenece a otra cuenta (de jugador o de administrador).';
    }
    if (Object.keys(erroresCampo).length > 0) return await render(req, res, { status: 400, datos, erroresCampo });
    if (!supabaseAdmin) {
      erroresCampo.correo = 'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor para crear cuentas.';
      return await render(req, res, { status: 500, datos, erroresCampo });
    }

    // La invitación crea el usuario en Supabase Auth y le manda el correo para definir su contraseña.
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(datos.correo, {
      redirectTo: `${urlApp()}/recuperar/nueva`,
      data: { nombre: datos.nombre, cuenta_panel: true },
    });
    let authId = data && data.user ? data.user.id : null;
    let correoEnviado = !error;
    if (error) {
      if (error.code === 'email_exists' || /already been registered/i.test(error.message || '')) {
        erroresCampo.correo = 'Ese correo ya pertenece a otra cuenta (de jugador o de administrador).';
        return await render(req, res, { status: 400, datos, erroresCampo });
      }
      if (error.code === 'email_address_invalid') {
        erroresCampo.correo = 'Supabase rechazó ese correo: revisa que la dirección exista.';
        return await render(req, res, { status: 400, datos, erroresCampo });
      }
      // Sin correo (límite de envíos, SMTP): se crea igual la cuenta y se informa.
      console.error('⚠️  No se pudo enviar la invitación de administrador:', error.code, error.message);
      const creado = await supabaseAdmin.auth.admin.createUser({ email: datos.correo, email_confirm: true, user_metadata: { nombre: datos.nombre, cuenta_panel: true } });
      if (creado.error) {
        erroresCampo.correo = 'No se pudo crear la cuenta en Supabase. Inténtalo de nuevo en unos minutos.';
        return await render(req, res, { status: 502, datos, erroresCampo });
      }
      authId = creado.data.user.id;
      correoEnviado = false;
    }

    // Si la base falla, se deshace también la cuenta de Supabase Auth (no quedan cuentas sin fila).
    const resultado = await panelModel.crearAdministrador(principal(req), { authId, ...datos }).catch(async (err) => {
      await userModel.eliminarDeAuth(authId);
      throw err;
    });
    if (resultado !== 'creado') {
      await userModel.eliminarDeAuth(authId);
      erroresCampo.correo = 'Ese correo ya pertenece a otra cuenta (de jugador o de administrador).';
      return await render(req, res, { status: 400, datos, erroresCampo });
    }
    if (!correoEnviado) {
      // Segundo intento por el flujo de recuperación (AR-008). Con un cliente aparte (flujo implícito): el
      // enlace se abre en el navegador de la persona invitada, no en el del principal.
      const r = await cuentaModel.enviarEnlaceRecuperacion(crearClienteTemporal(), datos.correo, `${urlApp()}/recuperar/nueva`).catch((err) => ({ error: err }));
      correoEnviado = !r.error;
    }
    return res.redirect(`/admin/administradores?aviso=${correoEnviado ? 'creado' : 'creado-sin-correo'}`);
  } catch (err) {
    return next(err);
  }
}

function cambiarAcceso(revocar) {
  return async (req, res, next) => {
    try {
      const motivo = leerMotivo(req.body.motivo);
      const idUsuario = idValido(req.params.id);
      if (!motivo) return res.redirect('/admin/administradores?aviso=motivo');
      const resultado = idUsuario ? await panelModel.cambiarAcceso(principal(req), idUsuario, revocar, motivo) : 'inexistente';
      if (resultado === 'revocado' || resultado === 'reactivado') {
        await notificarUsuario(idUsuario, 'moderacion',
          revocar ? `Tu acceso al panel de administración de SearchMatch fue revocado. Motivo: ${motivo}`
            : `Tu acceso al panel de administración de SearchMatch fue reactivado. Motivo: ${motivo}`);
      }
      return res.redirect(`/admin/administradores?aviso=${resultado}`);
    } catch (err) {
      return next(err);
    }
  };
}

/** AP-011 c6: confirma con la contraseña del principal actual. */
async function traspasar(req, res, next) {
  try {
    const motivo = leerMotivo(req.body.motivo);
    const idNuevo = idValido(req.body.id_nuevo);
    if (!motivo) return res.redirect('/admin/administradores?aviso=motivo');
    if (!idNuevo) return res.redirect('/admin/administradores?aviso=inexistente');
    if (!(await cuentaModel.passwordEsCorrecta(req.usuario.correo, String(req.body.password || '')))) {
      return res.redirect('/admin/administradores?aviso=contrasena');
    }
    const resultado = await panelModel.traspasarPrincipal(principal(req), idNuevo, motivo);
    if (resultado !== 'traspasado') return res.redirect(`/admin/administradores?aviso=${resultado}`);
    await notificarUsuario(idNuevo, 'moderacion', `Ahora eres el Administrador principal de SearchMatch. Motivo: ${motivo}`, '/admin/administradores');
    return res.redirect('/admin?aviso=traspasado');
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listar, crear, revocar: cambiarAcceso(true), reactivar: cambiarAcceso(false), traspasar, AVISOS,
};

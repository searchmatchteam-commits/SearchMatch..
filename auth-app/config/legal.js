const TERMINOS = {
  clave: 'terminos',
  titulo: 'Términos y condiciones',
  version: '1.0',
  actualizado: '2026-10-22',
  secciones: [
    {
      titulo: '1. Quiénes pueden usar SearchMatch',
      parrafos: [
        'SearchMatch es una plataforma para fútbol amateur en Chile. Solo pueden crear una cuenta personas mayores de 18 años.',
        'Cada persona puede tener una sola cuenta y un único perfil de jugador. Los datos que registres deben ser reales.',
      ],
    },
    {
      titulo: '2. Equipos, desafíos y partidos',
      parrafos: [
        'Quien crea un equipo queda como su capitán y es responsable de gestionar su plantel, sus desafíos y sus partidos.',
        'Los desafíos, partidos y resultados que registres deben corresponder a encuentros reales. Registrar resultados falsos puede significar la desactivación de la cuenta.',
      ],
    },
    {
      titulo: '3. Reservas de canchas',
      parrafos: [
        'Las canchas pertenecen a recintos deportivos independientes. SearchMatch muestra su disponibilidad y el costo estimado de cada reserva; el pago y las condiciones de uso se acuerdan con el recinto.',
        'Si no vas a usar una reserva, cancélala para liberar el horario.',
      ],
    },
    {
      titulo: '4. Conducta en la comunidad',
      parrafos: [
        'No se permiten comentarios ofensivos, discriminatorios ni con datos personales de terceros. Los administradores pueden retirar comentarios y desactivar cuentas que no cumplan estas reglas.',
      ],
    },
    {
      titulo: '5. Cambios a estos términos',
      parrafos: [
        'Si estos términos cambian, publicaremos una nueva versión con su fecha y te pediremos aceptarla al iniciar sesión antes de seguir usando la plataforma.',
      ],
    },
  ],
};

const PRIVACIDAD = {
  clave: 'privacidad',
  titulo: 'Política de privacidad',
  version: '1.0',
  actualizado: '2026-10-22',
  secciones: [
    {
      titulo: '1. Qué datos guardamos',
      parrafos: [
        'Datos de la cuenta: correo principal, correo secundario opcional y teléfono.',
        'Datos del perfil de jugador: nombre, apodo, apellido, fecha de nacimiento, altura, peso, posiciones, foto y estadísticas.',
        'Actividad en la plataforma: equipos, solicitudes, desafíos, partidos, reservas, comentarios y notificaciones.',
      ],
    },
    {
      titulo: '2. Qué ven otros usuarios',
      parrafos: [
        'Otros usuarios pueden ver tu carta de jugador, tu apodo, tu edad, tus posiciones y los equipos en que juegas.',
        'Nunca mostramos a otros usuarios tu correo, tu correo secundario, tu teléfono ni tu fecha de nacimiento exacta.',
      ],
    },
    {
      titulo: '3. Para qué los usamos',
      parrafos: [
        'Para que puedas acceder a tu cuenta, recuperar tu contraseña, encontrar equipos y rivales de tu nivel, reservar canchas y recibir notificaciones de la actividad que te involucra.',
      ],
    },
    {
      titulo: '4. Tus derechos',
      parrafos: [
        'Puedes actualizar tus datos desde "Mi cuenta" y "Editar perfil" en cualquier momento, y desactivar tu cuenta cuando lo decidas.',
      ],
    },
  ],
};

const DOCUMENTOS = { terminos: TERMINOS, privacidad: PRIVACIDAD };

function aceptoVersionesVigentes(usuario) {
  return usuario.terminosVersion === TERMINOS.version && usuario.privacidadVersion === PRIVACIDAD.version;
}

module.exports = { TERMINOS, PRIVACIDAD, DOCUMENTOS, aceptoVersionesVigentes };

const TERMINOS = {
  clave: 'terminos',
  titulo: 'Términos y condiciones',
  version: '1.1',
  actualizado: '2026-11-09',
  secciones: [
    {
      titulo: '1. Quiénes pueden usar SearchMatch',
      parrafos: [
        'SearchMatch es una plataforma para fútbol amateur en Chile. Solo pueden crear una cuenta personas mayores de 18 años.',
        'Cada persona puede tener una sola cuenta y un único perfil de jugador. Los datos que registres deben ser reales.',
      ],
    },
    {
      titulo: '2. Cuenta con Google',
      parrafos: [
        'Puedes crear tu cuenta o entrar con tu cuenta de Google. Si tu correo de Google aún no tiene una cuenta en SearchMatch, la creamos automáticamente con tu nombre, apellido, correo y foto de perfil de Google.',
        'Antes de usar la plataforma te pediremos tu fecha de nacimiento (para confirmar que eres mayor de 18 años), tu altura, tu peso y tu posición, y deberás aceptar estos términos y la política de privacidad. Si no los aceptas, la cuenta no podrá usarse.',
        'Eres responsable de la seguridad de tu cuenta de Google. Si entras con Google y también tienes contraseña, ambas formas de acceso llevan a la misma cuenta.',
      ],
    },
    {
      titulo: '3. Equipos, desafíos y partidos',
      parrafos: [
        'Quien crea un equipo queda como su capitán y es responsable de gestionar su plantel, sus desafíos y sus partidos.',
        'Los desafíos, partidos y resultados que registres deben corresponder a encuentros reales. Registrar resultados falsos puede significar la desactivación de la cuenta.',
      ],
    },
    {
      titulo: '4. Reservas de canchas',
      parrafos: [
        'Las canchas pertenecen a recintos deportivos independientes. SearchMatch muestra su disponibilidad y el costo estimado de cada reserva; el pago y las condiciones de uso se acuerdan con el recinto.',
        'Si no vas a usar una reserva, cancélala para liberar el horario.',
      ],
    },
    {
      titulo: '5. Conducta en la comunidad',
      parrafos: [
        'No se permiten comentarios ofensivos, discriminatorios ni con datos personales de terceros. Los administradores pueden retirar comentarios y desactivar cuentas que no cumplan estas reglas.',
      ],
    },
    {
      titulo: '6. Cambios a estos términos',
      parrafos: [
        'Si estos términos cambian, publicaremos una nueva versión con su fecha y te pediremos aceptarla al iniciar sesión antes de seguir usando la plataforma.',
      ],
    },
  ],
};

const PRIVACIDAD = {
  clave: 'privacidad',
  titulo: 'Política de privacidad',
  version: '1.1',
  actualizado: '2026-11-09',
  secciones: [
    {
      titulo: '1. Qué datos guardamos',
      parrafos: [
        'Datos de la cuenta: correo principal, correo secundario opcional y teléfono.',
        'Datos del perfil de jugador: nombre, apodo, apellido, fecha de nacimiento, altura, peso, posiciones, foto y estadísticas.',
        'Actividad en la plataforma: equipos, solicitudes, desafíos, partidos, reservas, comentarios y notificaciones.',
        'Datos de tus equipos: nombre, escudo, colores del equipo y colores de sus camisetas de local y de visita.',
      ],
    },
    {
      titulo: '2. Datos que recibimos de Google',
      parrafos: [
        'Si entras con Google, Google nos entrega solo tu nombre, apellido, correo y foto de perfil. Con ellos creamos tu cuenta y tu carta de jugador; la foto se guarda comprimida y puedes cambiarla o borrarla cuando quieras.',
        'No accedemos a tu contraseña de Google, a tus contactos, a tu correo, a tus archivos ni a ningún otro dato de tu cuenta de Google.',
        'Puedes quitarle el acceso a SearchMatch desde la configuración de seguridad de tu cuenta de Google (Apps y servicios de terceros). Tu cuenta de SearchMatch seguirá existiendo y podrás entrar con tu correo recuperando la contraseña.',
      ],
    },
    {
      titulo: '3. Qué ven otros usuarios',
      parrafos: [
        'Otros usuarios pueden ver tu carta de jugador, tu apodo, tu edad, tus posiciones y los equipos en que juegas.',
        'Nunca mostramos a otros usuarios tu correo, tu correo secundario, tu teléfono ni tu fecha de nacimiento exacta.',
      ],
    },
    {
      titulo: '4. Para qué los usamos',
      parrafos: [
        'Para que puedas acceder a tu cuenta, recuperar tu contraseña, encontrar equipos y rivales de tu nivel, reservar canchas y recibir notificaciones de la actividad que te involucra.',
        'Los colores del equipo personalizan su carta, y los colores de sus camisetas sirven para elegir la equipación de cada partido sin que ambos equipos jueguen con el mismo color.',
      ],
    },
    {
      titulo: '5. Tus derechos',
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

/* =====================================================================
 * auth.js
 * ---------------------------------------------------------------------
 * Logica de login (pantalla index.html).
 * Firebase Authentication trabaja con email, por eso el usuario "Admin"
 * se convierte internamente en "admin@mascotita.local".
 * El usuario puede escribir "Admin" o un email completo.
 * ===================================================================== */

/* Convierte lo que escribe el usuario a un email valido para Firebase. */
function normalizarEmail(entrada) {
  const v = (entrada || "").trim();
  if (v.indexOf("@") !== -1) return v.toLowerCase();
  return v.toLowerCase() + "@" + DOMINIO_INTERNO;
}

/* Muestra un mensaje de error en la pantalla de login (espera al DOM si hace falta). */
function mostrarErrorLogin(texto) {
  function pintar() {
    const box = document.getElementById("login-error");
    if (!box) return;
    box.textContent = texto;
    box.style.display = "block";
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", pintar);
  else pintar();
}

/* Mensaje dejado por otra pagina antes de redirigir al login (p. ej. "sin perfil"). */
(function () {
  try {
    const m = sessionStorage.getItem("mascotita-msg");
    if (m) { sessionStorage.removeItem("mascotita-msg"); mostrarErrorLogin(m); }
  } catch (e) { /* ignorar */ }
})();

/* Evita que este listener compita con el login manual (condicion de carrera). */
let loginEnCurso = false;

/* Si ya hay una sesion activa, entra al panel SOLO si el perfil existe y esta activo.
 * Antes redirigia siempre, y el panel te devolvia al login: de ahi el parpadeo. */
auth.onAuthStateChanged(async function (user) {
  if (!user || loginEnCurso) return;
  if (!location.pathname.match(/index\.html$|\/$/)) return;
  try {
    const snap = await db.collection("users").doc(user.uid).get();
    if (snap.exists && snap.data().active !== false) {
      location.href = "dashboard.html";
      return;
    }
    await auth.signOut();
    mostrarErrorLogin(mensajeErrorAuth(snap.exists ? "auth/cuenta-inactiva" : "auth/sin-perfil"));
  } catch (e) {
    console.error(e);
    await auth.signOut().catch(function () {});
    mostrarErrorLogin(mensajeErrorAuth(e && e.code === "permission-denied" ? "auth/permiso" : null));
  }
});

function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;
  const inpUser = document.getElementById("login-user");
  const inpPass = document.getElementById("login-pass");
  const btn = document.getElementById("login-btn");
  const errBox = document.getElementById("login-error");
  const togglePass = document.getElementById("toggle-pass");

  if (togglePass) {
    togglePass.onclick = function () {
      const t = inpPass.type === "password" ? "text" : "password";
      inpPass.type = t;
      togglePass.innerHTML = t === "password"
        ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
    };
  }

  form.onsubmit = async function (e) {
    e.preventDefault();
    errBox.style.display = "none";
    const email = normalizarEmail(inpUser.value);
    const pass = inpPass.value;
    if (!inpUser.value.trim() || !pass) {
      errBox.textContent = "Ingresa usuario y contrasena.";
      errBox.style.display = "block"; return;
    }
    btn.disabled = true;
    loginEnCurso = true;
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Ingresando...';
    try {
      const cred = await auth.signInWithEmailAndPassword(email, pass);
      // Verificar perfil y estado activo.
      const snap = await db.collection("users").doc(cred.user.uid).get();
      if (!snap.exists || snap.data().active === false) {
        await auth.signOut();
        throw { code: snap.exists ? "auth/cuenta-inactiva" : "auth/sin-perfil" };
      }
      // Actualizar ultimo acceso + auditoria.
      await db.collection("users").doc(cred.user.uid).update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      });
      window.MASCOTITA.usuario = {
        uid: cred.user.uid, email: cred.user.email,
        nombre: snap.data().nombre || cred.user.email,
        role: snap.data().role || "user"
      };
      if (window.registrarAuditoria) {
        await registrarAuditoria("login", "auth", "Inicio de sesion correcto");
      }
      location.href = "dashboard.html";
    } catch (err) {
      console.error(err);
      errBox.textContent = mensajeErrorAuth(err.code);
      errBox.style.display = "block";
      loginEnCurso = false;
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Ingresar';
    }
  };
}

/* Traduce codigos de error de Firebase a mensajes amigables en espanol. */
function mensajeErrorAuth(code) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Usuario o contrasena incorrectos.";
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera unos minutos.";
    case "auth/cuenta-inactiva":
      return "Tu cuenta esta desactivada. Contacta al administrador.";
    case "auth/sin-perfil":
      return "Tu cuenta existe pero no tiene perfil en Firestore (coleccion users, ID = tu UID).";
    case "auth/permiso":
      return "Sin permiso para leer tu perfil. Revisa que las reglas de Firestore esten publicadas.";
    case "auth/network-request-failed":
      return "Error de red. Revisa tu conexion.";
    default:
      return "No se pudo iniciar sesion. Intenta de nuevo.";
  }
}

document.addEventListener("DOMContentLoaded", initLogin);

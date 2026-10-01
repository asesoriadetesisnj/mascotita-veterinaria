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

/* Si ya hay una sesion activa, saltar directo al panel. */
auth.onAuthStateChanged(function (user) {
  if (user && location.pathname.match(/index\.html$|\/$/)) {
    location.href = "dashboard.html";
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
    btn.innerHTML = '<span class="spinner spinner-sm"></span> Ingresando...';
    try {
      const cred = await auth.signInWithEmailAndPassword(email, pass);
      // Verificar perfil y estado activo.
      const snap = await db.collection("users").doc(cred.user.uid).get();
      if (!snap.exists || snap.data().active === false) {
        await auth.signOut();
        throw { code: "auth/cuenta-inactiva" };
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
    case "auth/network-request-failed":
      return "Error de red. Revisa tu conexion.";
    default:
      return "No se pudo iniciar sesion. Intenta de nuevo.";
  }
}

document.addEventListener("DOMContentLoaded", initLogin);

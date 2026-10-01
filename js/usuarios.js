/* =====================================================================
 * usuarios.js  (solo ADMIN)
 * ---------------------------------------------------------------------
 * Gestion de usuarios:
 *  - Crear usuarios (crea cuenta en Firebase Auth + perfil en Firestore).
 *  - Editar nombre y rol, activar/desactivar, ver ultimo acceso.
 *
 * NOTA sobre crear usuarios desde el cliente: al llamar a
 * createUserWithEmailAndPassword, Firebase inicia sesion con la cuenta
 * nueva. Para no desloguear al admin usamos una app secundaria de
 * Firebase, creamos la cuenta ahi y luego la cerramos. Asi el admin
 * mantiene su sesion. (Patron oficial recomendado para apps sin backend.)
 * ===================================================================== */

let _usuarios = [];

async function initUsuarios() {
  await protegerPagina({ soloAdmin: true, pagina: "usuarios.html" });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-users"></i> Usuarios</h1>' +
    '<button class="btn btn-primary" id="u-nuevo"><i class="fa-solid fa-user-plus"></i> Nuevo usuario</button></div>' +
    '<div class="table-wrap"><table class="tabla" id="tabla-u">' +
    '<thead><tr><th>Nombre</th><th>Usuario/Email</th><th>Rol</th><th>Estado</th><th>Ultimo acceso</th><th>Acciones</th></tr></thead>' +
    '<tbody></tbody></table></div>';
  document.getElementById("u-nuevo").onclick = function () { abrirFormUsuario(null); };
  await cargarUsuarios();
}

async function cargarUsuarios() {
  mostrarLoading(true);
  try {
    const snap = await db.collection("users").orderBy("nombre").get();
    _usuarios = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    pintarUsuarios();
  } catch (e) { console.error(e); toast("Error cargando usuarios.", "error"); }
  finally { mostrarLoading(false); }
}

function pintarUsuarios() {
  const tb = document.querySelector("#tabla-u tbody");
  if (!_usuarios.length) { tb.innerHTML = '<tr><td colspan="6" class="vacio">Sin usuarios</td></tr>'; return; }
  tb.innerHTML = _usuarios.map(function (u) {
    const activo = u.active !== false;
    return '<tr><td>' + escHTML(u.nombre) + '</td><td>' + escHTML(u.email) + '</td>' +
      '<td><span class="role-tag ' + escHTML(u.role) + '">' + escHTML((u.role || "user").toUpperCase()) + '</span></td>' +
      '<td>' + (activo ? '<span class="pill pill-ok">activo</span>' : '<span class="pill pill-danger">inactivo</span>') + '</td>' +
      '<td>' + (u.lastLogin ? fmtFecha(u.lastLogin) : "nunca") + '</td>' +
      '<td class="acciones">' +
      '<button class="btn-icono" title="Editar" onclick="abrirFormUsuario(\'' + u.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
      '<button class="btn-icono" title="Activar/Desactivar" onclick="toggleUsuario(\'' + u.id + '\')"><i class="fa-solid fa-power-off"></i></button>' +
      '</td></tr>';
  }).join("");
}

function abrirFormUsuario(id) {
  const u = id ? _usuarios.find(function (x) { return x.id === id; }) : {};
  const campos = '<div class="grid-2">' +
    campo("unombre", "Nombre", u.nombre) +
    selectCampo("urol", "Rol", [{ value: "user", texto: "USER (empleado)" }, { value: "admin", texto: "ADMIN" }], u.role || "user") +
    '</div>' +
    (id ? '' :
      campo("uusuario", "Usuario (o email)", "") +
      campo("upass", "Contrasena", "", "password") +
      '<p class="hint">Si escribes solo un usuario (ej: juan), se guardara como juan@' + DOMINIO_INTERNO + '</p>');
  const ov = modalForm((id ? "Editar" : "Nuevo") + " usuario", campos);
  ov.querySelector("[data-guardar]").onclick = async function () {
    if (id) await actualizarUsuario(id);
    else await crearUsuario();
  };
}

async function actualizarUsuario(id) {
  const datos = { nombre: val("unombre"), role: val("urol") };
  mostrarLoading(true);
  try {
    await db.collection("users").doc(id).update(datos);
    await registrarAuditoria("editar", "usuarios", "Edito usuario " + datos.nombre);
    cerrarModales(); toast("Usuario actualizado.", "ok"); await cargarUsuarios();
  } catch (e) { console.error(e); toast("Error al actualizar.", "error"); } finally { mostrarLoading(false); }
}

async function crearUsuario() {
  const nombre = val("unombre");
  let entrada = val("uusuario");
  const pass = document.getElementById("f-upass").value;
  if (!nombre || !entrada || !pass) { toast("Completa todos los campos.", "warn"); return; }
  if (pass.length < 6) { toast("La contrasena debe tener al menos 6 caracteres.", "warn"); return; }
  const email = entrada.indexOf("@") !== -1 ? entrada.toLowerCase() : entrada.toLowerCase() + "@" + DOMINIO_INTERNO;
  mostrarLoading(true);
  // App secundaria para no cerrar la sesion del admin actual.
  let appSec;
  try {
    appSec = firebase.initializeApp(firebase.app().options, "secundaria_" + Date.now());
    const cred = await appSec.auth().createUserWithEmailAndPassword(email, pass);
    await db.collection("users").doc(cred.user.uid).set({
      nombre: nombre, email: email, role: val("urol"), active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(), lastLogin: null
    });
    await appSec.auth().signOut();
    await registrarAuditoria("crear", "usuarios", "Creo usuario " + nombre + " (" + email + ")");
    cerrarModales(); toast("Usuario creado.", "ok"); await cargarUsuarios();
  } catch (e) {
    console.error(e);
    toast(e.code === "auth/email-already-in-use" ? "Ese usuario ya existe." : "Error al crear el usuario.", "error");
  } finally {
    if (appSec) appSec.delete().catch(function () {});
    mostrarLoading(false);
  }
}

async function toggleUsuario(id) {
  const u = _usuarios.find(function (x) { return x.id === id; });
  if (u.id === window.MASCOTITA.usuario.uid) { toast("No puedes desactivarte a ti mismo.", "warn"); return; }
  const nuevo = u.active === false;
  if (!(await confirmar((nuevo ? "Activar" : "Desactivar") + " a " + u.nombre + "?"))) return;
  mostrarLoading(true);
  try {
    await db.collection("users").doc(id).update({ active: nuevo });
    await registrarAuditoria("editar", "usuarios", (nuevo ? "Activo" : "Desactivo") + " a " + u.nombre);
    toast("Hecho.", "ok"); await cargarUsuarios();
  } catch (e) { console.error(e); toast("Error.", "error"); } finally { mostrarLoading(false); }
}

window.abrirFormUsuario = abrirFormUsuario;
window.toggleUsuario = toggleUsuario;

if (location.pathname.match(/usuarios\.html$/)) {
  document.addEventListener("DOMContentLoaded", initUsuarios);
}

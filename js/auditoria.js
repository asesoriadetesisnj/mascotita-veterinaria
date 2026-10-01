/* =====================================================================
 * auditoria.js
 * ---------------------------------------------------------------------
 * 1) registrarAuditoria(): funcion GLOBAL usada por todos los modulos
 *    para dejar constancia de cada accion critica en la coleccion
 *    "auditoria" (solo create, nunca update/delete por reglas Firestore).
 * 2) Render de la pagina auditoria.html (solo ADMIN): tabla filtrable y
 *    exportable a Excel/CSV.
 * ===================================================================== */

/* Intenta obtener la IP publica del cliente (servicio gratuito, opcional). */
let _ipCache = null;
async function obtenerIP() {
  if (_ipCache) return _ipCache;
  try {
    const r = await fetch("https://api.ipify.org?format=json");
    const j = await r.json();
    _ipCache = j.ip || "desconocida";
  } catch (e) { _ipCache = "desconocida"; }
  return _ipCache;
}

/* Registra una accion. No lanza errores hacia arriba para no romper flujos. */
async function registrarAuditoria(accion, modulo, detalle) {
  try {
    const u = window.MASCOTITA.usuario || {};
    const ip = await obtenerIP();
    await db.collection("auditoria").add({
      usuario: u.nombre || u.email || "anonimo",
      usuarioUid: u.uid || null,
      accion: accion,          // login, logout, crear, editar, eliminar...
      modulo: modulo,          // stock, consultas, cirugias, etc.
      detalle: detalle || "",
      ip: ip,
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.warn("No se pudo registrar auditoria:", e);
  }
}
window.registrarAuditoria = registrarAuditoria;

/* ---------------- Pagina auditoria.html ---------------- */
let _audRegistros = [];

async function initAuditoria() {
  await protegerPagina({ soloAdmin: true, pagina: "auditoria.html" });
  const cont = document.getElementById("content");
  cont.innerHTML =
    '<div class="page-head">' +
    '  <h1><i class="fa-solid fa-clipboard-list"></i> Log de auditoria</h1>' +
    '  <button class="btn btn-primary" id="aud-export"><i class="fa-solid fa-file-excel"></i> Exportar</button>' +
    '</div>' +
    '<div class="filtros">' +
    '  <input type="text" id="f-usuario" placeholder="Usuario...">' +
    '  <select id="f-modulo"><option value="">Todos los modulos</option></select>' +
    '  <select id="f-accion"><option value="">Todas las acciones</option></select>' +
    '  <input type="date" id="f-fecha">' +
    '</div>' +
    '<div class="table-wrap"><table class="tabla" id="tabla-aud">' +
    '  <thead><tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Modulo</th><th>Detalle</th><th>IP</th></tr></thead>' +
    '  <tbody></tbody></table></div>';

  mostrarLoading(true);
  try {
    const snap = await db.collection("auditoria").orderBy("fecha", "desc").limit(500).get();
    _audRegistros = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    poblarFiltrosAud();
    pintarAud();
  } catch (e) {
    console.error(e); toast("Error cargando auditoria.", "error");
  } finally { mostrarLoading(false); }

  document.getElementById("f-usuario").oninput = debounce(pintarAud, 250);
  document.getElementById("f-modulo").onchange = pintarAud;
  document.getElementById("f-accion").onchange = pintarAud;
  document.getElementById("f-fecha").onchange = pintarAud;
  document.getElementById("aud-export").onclick = function () {
    exportarAExcel(filtrarAud(), ["fecha", "usuario", "accion", "modulo", "detalle", "ip"],
      "auditoria", { fecha: fmtFecha });
  };
}

function poblarFiltrosAud() {
  const mods = Array.from(new Set(_audRegistros.map(function (r) { return r.modulo; }))).filter(Boolean);
  const accs = Array.from(new Set(_audRegistros.map(function (r) { return r.accion; }))).filter(Boolean);
  const fm = document.getElementById("f-modulo");
  const fa = document.getElementById("f-accion");
  mods.forEach(function (m) { fm.innerHTML += '<option>' + escHTML(m) + '</option>'; });
  accs.forEach(function (a) { fa.innerHTML += '<option>' + escHTML(a) + '</option>'; });
}

function filtrarAud() {
  const u = document.getElementById("f-usuario").value.toLowerCase();
  const m = document.getElementById("f-modulo").value;
  const a = document.getElementById("f-accion").value;
  const f = document.getElementById("f-fecha").value;
  return _audRegistros.filter(function (r) {
    if (u && (r.usuario || "").toLowerCase().indexOf(u) === -1) return false;
    if (m && r.modulo !== m) return false;
    if (a && r.accion !== a) return false;
    if (f) {
      const d = r.fecha && r.fecha.toDate ? r.fecha.toDate() : null;
      if (!d || d.toISOString().slice(0, 10) !== f) return false;
    }
    return true;
  });
}

function pintarAud() {
  const tb = document.querySelector("#tabla-aud tbody");
  const filas = filtrarAud();
  if (!filas.length) { tb.innerHTML = '<tr><td colspan="6" class="vacio">Sin registros</td></tr>'; return; }
  tb.innerHTML = filas.map(function (r) {
    return '<tr><td>' + escHTML(fmtFecha(r.fecha)) + '</td>' +
      '<td>' + escHTML(r.usuario) + '</td>' +
      '<td><span class="badge badge-' + escHTML(r.accion) + '">' + escHTML(r.accion) + '</span></td>' +
      '<td>' + escHTML(r.modulo) + '</td>' +
      '<td>' + escHTML(r.detalle) + '</td>' +
      '<td>' + escHTML(r.ip) + '</td></tr>';
  }).join("");
}

if (location.pathname.match(/auditoria\.html$/)) {
  document.addEventListener("DOMContentLoaded", initAuditoria);
}

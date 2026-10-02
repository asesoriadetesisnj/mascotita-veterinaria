/* =====================================================================
 * main.js
 * ---------------------------------------------------------------------
 * Nucleo compartido por todas las paginas:
 *  - Guard de sesion y de roles (redirige al login si no hay sesion).
 *  - Render del layout (barra superior + menu lateral) segun rol.
 *  - Utilidades globales: toasts, modales de confirmacion, loading,
 *    formato de fechas/moneda, debounce, escape de HTML.
 * Todas las paginas internas incluyen este archivo.
 * ===================================================================== */

/* Estado del usuario actual (se completa cuando Auth confirma la sesion). */
window.MASCOTITA = window.MASCOTITA || {};
window.MASCOTITA.usuario = null;   // { uid, email, nombre, role, active }

/* ---------- Utilidades de formato ---------- */
function fmtMoneda(n) {
  const v = Number(n || 0);
  return "Gs " + v.toLocaleString("es-PY");
}
function fmtFecha(ts) {
  if (!ts) return "";
  let d = ts;
  if (ts.toDate) d = ts.toDate();          // Timestamp de Firestore
  else if (typeof ts === "string" || typeof ts === "number") d = new Date(ts);
  if (!(d instanceof Date) || isNaN(d)) return "";
  return d.toLocaleDateString("es-PY") + " " +
    d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
}
function fmtFechaCorta(ts) {
  if (!ts) return "";
  let d = ts; if (ts.toDate) d = ts.toDate(); else d = new Date(ts);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("es-PY");
}
/* ---------- Fechas "solo dia" (sin desfase de zona horaria) ----------
 * BUG corregido: new Date("2026-10-01") se interpreta en UTC y en Paraguay
 * (UTC-3) mostraba el dia ANTERIOR; y toISOString().slice(0,10) hacia lo
 * mismo al editar. Estos helpers trabajan siempre en hora local. */
function fechaInput(ts) {                 // Timestamp/Date -> "YYYY-MM-DD" local
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return "";
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function parseFechaLocal(str, hora) {     // "YYYY-MM-DD" (+ "HH:MM") -> Date local
  if (!str) return null;
  const p = str.split("-").map(Number);
  const h = (hora || "00:00").split(":").map(Number);
  return new Date(p[0], p[1] - 1, p[2], h[0] || 0, h[1] || 0, 0, 0);
}
function hoyISO() { return fechaInput(new Date()); }
function inicioDelDia(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function finDelDia(d) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

/* Lee ?q=... de la URL (lo usa la busqueda global para pre-filtrar). */
function paramQ() { try { return new URLSearchParams(location.search).get("q") || ""; } catch (e) { return ""; } }

/* ---------- Configuracion general (con cache de 60 s) ---------- */
let _cfgCache = null, _cfgCacheTs = 0;
async function cargarConfig(forzar) {
  if (!forzar && _cfgCache && Date.now() - _cfgCacheTs < 60000) return _cfgCache;
  try {
    const snap = await db.collection("config").doc("general").get();
    _cfgCache = snap.exists ? snap.data() : {};
    _cfgCacheTs = Date.now();
    window.MASCOTITA.config = _cfgCache;   // lo usan los PDFs (datos de la clinica)
    return _cfgCache;
  } catch (e) { console.warn("No se pudo leer config:", e); }
  return _cfgCache || {};
}
window.cargarConfig = cargarConfig;

/* Escapa texto para inyectarlo de forma segura como contenido HTML. */
function escHTML(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}
/* Debounce para busquedas en tiempo real. */
function debounce(fn, ms) {
  let t; return function () {
    const args = arguments, ctx = this;
    clearTimeout(t); t = setTimeout(function () { fn.apply(ctx, args); }, ms);
  };
}

/* ---------- Toasts (mensajes amigables) ---------- */
function toast(msg, tipo) {
  tipo = tipo || "info"; // info | ok | error | warn
  let cont = document.getElementById("toast-container");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toast-container";
    document.body.appendChild(cont);
  }
  const el = document.createElement("div");
  el.className = "toast toast-" + tipo;
  el.innerHTML = escHTML(msg);
  cont.appendChild(el);
  setTimeout(function () { el.classList.add("show"); }, 10);
  setTimeout(function () {
    el.classList.remove("show");
    setTimeout(function () { el.remove(); }, 300);
  }, 3500);
}

/* ---------- Confirmacion antes de acciones destructivas ---------- */
function confirmar(mensaje) {
  return new Promise(function (resolve) {
    const ov = document.createElement("div");
    ov.className = "modal-overlay show";
    ov.innerHTML =
      '<div class="modal-box modal-sm">' +
      '  <h3><i class="fa-solid fa-triangle-exclamation"></i> Confirmar</h3>' +
      '  <p>' + escHTML(mensaje) + '</p>' +
      '  <div class="modal-actions">' +
      '    <button class="btn btn-ghost" data-no>Cancelar</button>' +
      '    <button class="btn btn-danger" data-yes>Si, continuar</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.querySelector("[data-yes]").onclick = function () { ov.remove(); resolve(true); };
    ov.querySelector("[data-no]").onclick = function () { ov.remove(); resolve(false); };
  });
}

/* ---------- Loading global ---------- */
function mostrarLoading(mostrar) {
  let el = document.getElementById("global-loading");
  if (!el) {
    el = document.createElement("div");
    el.id = "global-loading";
    el.className = "global-loading";
    el.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(el);
  }
  el.style.display = mostrar ? "flex" : "none";
}

/* ---------- Definicion del menu lateral ----------
 * Cada item declara el rol minimo requerido. Los items "soloAdmin"
 * no se renderizan para el rol USER. */
const MENU = [
  { href: "dashboard.html",     icon: "fa-gauge-high",       texto: "Panel",        admin: false },
  { href: "stock.html",         icon: "fa-boxes-stacked",    texto: "Stock",        admin: false },
  { href: "consultas.html",     icon: "fa-stethoscope",      texto: "Consultas",    admin: false },
  { href: "cirugias.html",      icon: "fa-syringe",          texto: "Cirugias",     admin: false },
  { href: "vacunas.html",       icon: "fa-shield-virus",     texto: "Vacunas",      admin: false },
  { href: "citas.html",         icon: "fa-calendar-days",    texto: "Agenda",       admin: false },
  { href: "facturas.html",      icon: "fa-file-invoice-dollar", texto: "Facturas",  admin: true  },
  { href: "reportes.html",      icon: "fa-chart-pie",        texto: "Reportes",     admin: true  },
  { href: "usuarios.html",      icon: "fa-users",            texto: "Usuarios",     admin: true  },
  { href: "auditoria.html",     icon: "fa-clipboard-list",   texto: "Auditoria",    admin: true  },
  { href: "configuracion.html", icon: "fa-gear",             texto: "Configuracion",admin: true  }
];

/* Renderiza barra superior + menu lateral dentro de #app-shell. */
function renderLayout(paginaActiva) {
  const u = window.MASCOTITA.usuario;
  const esAdmin = u && u.role === "admin";
  const items = MENU.filter(function (m) { return !m.admin || esAdmin; })
    .map(function (m) {
      const activo = m.href === paginaActiva ? " activo" : "";
      return '<a class="nav-item' + activo + '" href="' + m.href + '">' +
        '<i class="fa-solid ' + m.icon + '"></i><span>' + m.texto + '</span></a>';
    }).join("");

  const shell = document.getElementById("app-shell");
  if (!shell) return;
  shell.innerHTML =
    '<aside class="sidebar" id="sidebar">' +
    '  <div class="brand">' +
    '    <img src="assets/logo.svg" alt="Mascotita" class="brand-logo">' +
    '    <span class="brand-name">Mascotita</span>' +
    '  </div>' +
    '  <nav class="nav">' + items + '</nav>' +
    '  <button class="nav-item logout" id="btn-logout">' +
    '    <i class="fa-solid fa-right-from-bracket"></i><span>Salir</span></button>' +
    '</aside>' +
    '<div class="main-wrap">' +
    '  <header class="topbar">' +
    '    <button class="icon-btn only-mobile" id="btn-menu"><i class="fa-solid fa-bars"></i></button>' +
    '    <button class="search-trigger" id="btn-search">' +
    '      <i class="fa-solid fa-magnifying-glass"></i> Buscar' +
    '      <kbd>Ctrl</kbd><kbd>K</kbd></button>' +
    '    <div class="topbar-right">' +
    '      <button class="icon-btn" id="btn-theme" title="Modo claro / oscuro">' +
    '        <i class="fa-solid fa-moon"></i></button>' +
    '      <div class="user-chip">' +
    '        <i class="fa-solid fa-user-circle"></i>' +
    '        <span>' + escHTML(u ? u.nombre : "") + '</span>' +
    '        <small class="role-tag">' + (esAdmin ? "ADMIN" : "USER") + '</small>' +
    '      </div>' +
    '    </div>' +
    '  </header>' +
    '  <main class="content" id="content"></main>' +
    '</div>';

  document.getElementById("btn-logout").onclick = cerrarSesion;
  document.getElementById("btn-menu").onclick = function () {
    document.getElementById("sidebar").classList.toggle("abierto");
  };
  // El boton de busqueda y el de tema se enganchan en sus modulos (global-search.js, theme.js).
  const bs = document.getElementById("btn-search");
  if (bs && window.abrirBusquedaGlobal) bs.onclick = window.abrirBusquedaGlobal;
}

/* Guard de pagina: asegura sesion y rol. Devuelve una Promesa que
 * resuelve con el usuario cuando todo esta OK. Si no hay permiso, redirige. */
function protegerPagina(opciones) {
  opciones = opciones || {};
  const soloAdmin = !!opciones.soloAdmin;
  const pagina = opciones.pagina || "";
  return new Promise(function (resolve) {
    auth.onAuthStateChanged(async function (user) {
      if (!user) { location.href = "index.html"; return; }
      try {
        const snap = await db.collection("users").doc(user.uid).get();
        if (!snap.exists) { try { sessionStorage.setItem("mascotita-msg", "Tu cuenta no tiene perfil en Firestore (users/<UID>)."); } catch (x) {} await auth.signOut(); location.href = "index.html"; return; }
        const data = snap.data();
        if (data.active === false) { try { sessionStorage.setItem("mascotita-msg", "Usuario desactivado. Contacta al administrador."); } catch (x) {} await auth.signOut(); location.href = "index.html"; return; }
        window.MASCOTITA.usuario = {
          uid: user.uid, email: user.email,
          nombre: data.nombre || user.email, role: data.role || "user",
          active: data.active !== false
        };
        if (soloAdmin && window.MASCOTITA.usuario.role !== "admin") {
          toast("No tienes permiso para esta seccion.", "error");
          location.href = "dashboard.html"; return;
        }
        renderLayout(pagina);
        resolve(window.MASCOTITA.usuario);
      } catch (e) {
        console.error("protegerPagina:", e);
        let msg = "Error cargando tu perfil.";
        if (e && e.code === "permission-denied") {
          msg = "Sin permiso para leer tu perfil. Revisa las reglas de Firestore y que exista users/<tu UID> con active: true.";
        } else if (e && e.code === "unavailable") {
          msg = "Sin conexion con Firestore. Revisa tu internet.";
        }
        toast(msg, "error");
      }
    });
  });
}

/* Cierre de sesion con registro en auditoria. */
async function cerrarSesion() {
  try {
    if (window.registrarAuditoria) {
      await registrarAuditoria("logout", "auth", "Cierre de sesion");
    }
  } catch (e) { /* no bloquear el logout */ }
  await auth.signOut();
  location.href = "index.html";
}

/* ---------- Helpers de formularios dentro de modal ----------
 * Convencion: cada campo usa id = "f-<clave>" para que val("clave") lo lea. */
function campo(clave, label, valor, tipo) {
  tipo = tipo || "text";
  return '<div class="form-field"><label>' + escHTML(label) + '</label>' +
    '<input id="f-' + clave + '" type="' + tipo + '" value="' + escHTML(valor == null ? "" : valor) + '"></div>';
}
function areaCampo(clave, label, valor) {
  return '<div class="form-field full"><label>' + escHTML(label) + '</label>' +
    '<textarea id="f-' + clave + '" rows="3">' + escHTML(valor || "") + '</textarea></div>';
}
function selectCampo(clave, label, opciones, seleccion) {
  const ops = opciones.map(function (o) {
    const v = typeof o === "object" ? o.value : o;
    const t = typeof o === "object" ? o.texto : o;
    return '<option value="' + escHTML(v) + '"' + (v === seleccion ? " selected" : "") + '>' + escHTML(t) + '</option>';
  }).join("");
  return '<div class="form-field"><label>' + escHTML(label) + '</label>' +
    '<select id="f-' + clave + '">' + ops + '</select></div>';
}
/* Lee el valor de un campo del formulario modal. */
function val(clave) {
  const el = document.getElementById("f-" + clave);
  return el ? el.value.trim() : "";
}
/* Abre un modal con contenido de formulario y botones Guardar/Cancelar.
 * Devuelve el overlay para poder enganchar el boton [data-guardar]. */
function modalForm(titulo, htmlCampos) {
  const ov = document.createElement("div");
  ov.className = "modal-overlay show";
  ov.innerHTML =
    '<div class="modal-box">' +
    '  <div class="modal-head"><h3>' + escHTML(titulo) + '</h3>' +
    '    <button class="icon-btn" data-cerrar><i class="fa-solid fa-xmark"></i></button></div>' +
    '  <div class="modal-body">' + htmlCampos + '</div>' +
    '  <div class="modal-actions">' +
    '    <button class="btn btn-ghost" data-cerrar>Cancelar</button>' +
    '    <button class="btn btn-primary" data-guardar><i class="fa-solid fa-floppy-disk"></i> Guardar</button>' +
    '  </div>' +
    '</div>';
  document.body.appendChild(ov);
  ov.querySelectorAll("[data-cerrar]").forEach(function (b) {
    b.onclick = function () { ov.remove(); };
  });
  // Clic en el fondo oscuro cierra el modal (no cierra si se hace clic dentro).
  ov.addEventListener("mousedown", function (e) { if (e.target === ov) ov.remove(); });
  const primero = ov.querySelector("input:not([type=hidden]), select, textarea");
  if (primero) setTimeout(function () { primero.focus(); }, 50);
  return ov;
}
function cerrarModales() {
  document.querySelectorAll(".modal-overlay").forEach(function (m) { m.remove(); });
}

/* Atajo global Ctrl+K / Cmd+K para la busqueda. */
document.addEventListener("keydown", function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (window.abrirBusquedaGlobal) window.abrirBusquedaGlobal();
  }
});

/* Tecla Esc cierra el modal abierto mas reciente. */
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  const m = document.querySelectorAll(".modal-overlay");
  if (m.length) m[m.length - 1].remove();
});

/* ---------- Cierre de sesion por inactividad ----------
 * Util en PCs compartidas de la clinica: tras 30 min sin actividad se
 * cierra la sesion. Cambia el valor si quieres otro tiempo (0 = desactivar). */
const MINUTOS_INACTIVIDAD = 30;
(function () {
  if (!MINUTOS_INACTIVIDAD || /index\.html$|\/$/.test(location.pathname)) return;
  let t;
  function reiniciar() {
    clearTimeout(t);
    t = setTimeout(async function () {
      try { sessionStorage.setItem("mascotita-msg", "Sesion cerrada por inactividad."); } catch (x) {}
      try { await auth.signOut(); } catch (x) {}
      location.href = "index.html";
    }, MINUTOS_INACTIVIDAD * 60 * 1000);
  }
  ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach(function (ev) {
    window.addEventListener(ev, debounce(reiniciar, 1000), { passive: true });
  });
  reiniciar();
})();

/* ---------- Aviso de conexion ---------- */
(function () {
  function banner(show) {
    let b = document.getElementById("offline-banner");
    if (!show) { if (b) b.remove(); return; }
    if (b) return;
    b = document.createElement("div");
    b.id = "offline-banner";
    b.innerHTML = '<i class="fa-solid fa-wifi"></i> Sin conexion. Los cambios no se guardaran hasta que vuelva internet.';
    document.body.appendChild(b);
  }
  window.addEventListener("offline", function () { banner(true); });
  window.addEventListener("online", function () { banner(false); });
  document.addEventListener("DOMContentLoaded", function () { if (!navigator.onLine) banner(true); });
})();

/* ---------- PWA: registra el service worker (solo en https / localhost) ---------- */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("SW no registrado:", e); });
  });
}

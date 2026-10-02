/* =====================================================================
 * citas.js
 * ---------------------------------------------------------------------
 * Agenda / citas:
 *  - Vista de calendario mensual simple.
 *  - CRUD de citas con estado y veterinario.
 *  - Filtros por veterinario y servicio.
 *  - Recordatorio por WhatsApp al dueno.
 * ===================================================================== */

let _citas = [];
let _mesActual = new Date();
const ESTADOS_CITA = ["pendiente", "confirmada", "atendida", "cancelada"];

async function initCitas() {
  await protegerPagina({ pagina: "citas.html" });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-calendar-days"></i> Agenda</h1>' +
    '<div class="head-actions">' +
    '<input type="text" id="f-vet" class="input-busca" placeholder="Filtrar veterinario...">' +
    '<button class="btn btn-primary" id="cita-nueva"><i class="fa-solid fa-plus"></i> Nueva cita</button></div></div>' +
    '<div class="cal-nav"><button class="btn btn-ghost" id="mes-prev"><i class="fa-solid fa-chevron-left"></i></button>' +
    '<h2 id="cal-titulo"></h2><button class="btn btn-ghost" id="mes-hoy">Hoy</button>' +
    '<button class="btn btn-ghost" id="mes-next"><i class="fa-solid fa-chevron-right"></i></button></div>' +
    '<div id="calendario" class="calendario"></div>' +
    '<div class="card-chart" style="margin-top:16px"><h3><i class="fa-solid fa-clipboard-check"></i> Citas de hoy</h3><div id="citas-hoy"></div></div>';
  document.getElementById("cita-nueva").onclick = function () { abrirFormCita(null); };
  document.getElementById("mes-prev").onclick = function () { _mesActual.setMonth(_mesActual.getMonth() - 1); pintarCalendario(); };
  document.getElementById("mes-next").onclick = function () { _mesActual.setMonth(_mesActual.getMonth() + 1); pintarCalendario(); };
  document.getElementById("mes-hoy").onclick = function () { _mesActual = new Date(); pintarCalendario(); };
  document.getElementById("f-vet").oninput = debounce(pintarCalendario, 250);
  await cargarCitas();
}

async function cargarCitas() {
  mostrarLoading(true);
  try {
    const snap = await db.collection("citas").orderBy("fecha", "desc").limit(500).get();
    _citas = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    pintarCalendario();
  } catch (e) { console.error(e); toast("Error cargando citas.", "error"); }
  finally { mostrarLoading(false); }
}

function pintarCalendario() {
  const anio = _mesActual.getFullYear(), mes = _mesActual.getMonth();
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  document.getElementById("cal-titulo").textContent = meses[mes] + " " + anio;
  const primero = new Date(anio, mes, 1);
  const diasMes = new Date(anio, mes + 1, 0).getDate();
  const inicio = primero.getDay(); // 0 domingo
  const fVet = (document.getElementById("f-vet").value || "").toLowerCase();
  const cal = document.getElementById("calendario");
  const dias = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
  let html = dias.map(function (d) { return '<div class="cal-head">' + d + '</div>'; }).join("");
  for (let i = 0; i < inicio; i++) html += '<div class="cal-cell vacia"></div>';
  for (let d = 1; d <= diasMes; d++) {
    const fechaStr = anio + "-" + String(mes + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const delDia = _citas.filter(function (c) {
      const cf = c.fecha && c.fecha.toDate ? c.fecha.toDate() : null;
      if (!cf) return false;
      const match = cf.getFullYear() === anio && cf.getMonth() === mes && cf.getDate() === d;
      const matchVet = !fVet || (c.veterinario || "").toLowerCase().indexOf(fVet) !== -1;
      return match && matchVet;
    });
    const eventos = delDia.map(function (c) {
      return '<div class="cal-evento estado-' + escHTML((c.estado || "").replace(/\s/g, "-")) + '" onclick="abrirFormCita(\'' + c.id + '\')">' +
        escHTML(c.hora || "") + ' ' + escHTML(c.mascota || c.servicio || "cita") + '</div>';
    }).join("");
    const esHoy = fechaStr === hoyISO();
    html += '<div class="cal-cell' + (esHoy ? ' hoy' : '') + '" data-fecha="' + fechaStr + '"><span class="cal-dia">' + d + '</span>' + eventos + '</div>';
  }
  cal.innerHTML = html;
  // Clic en un dia (fuera de un evento) abre "Nueva cita" con esa fecha.
  cal.querySelectorAll(".cal-cell[data-fecha]").forEach(function (cell) {
    cell.addEventListener("click", function (e) {
      if (e.target.closest(".cal-evento")) return;
      window._fechaPreset = cell.dataset.fecha; abrirFormCita(null);
    });
  });
  pintarCitasHoy();
}

function pintarCitasHoy() {
  const cont = document.getElementById("citas-hoy");
  if (!cont) return;
  const hoy = hoyISO();
  const lista = _citas.filter(function (c) { return fechaInput(c.fecha) === hoy && c.estado !== "cancelada"; })
    .sort(function (a, b) { return (a.hora || "").localeCompare(b.hora || ""); });
  cont.innerHTML = lista.length ? lista.map(function (c) {
    return '<div class="cita-hoy" onclick="abrirFormCita(\'' + c.id + '\')"><b>' + escHTML(c.hora || "--:--") + '</b> ' +
      escHTML(c.mascota || "") + ' <span class="muted">- ' + escHTML(c.servicio || "") + (c.veterinario ? " (" + escHTML(c.veterinario) + ")" : "") + '</span> ' +
      '<span class="pill pill-estado-' + escHTML(c.estado || "pendiente") + '">' + escHTML(c.estado || "pendiente") + '</span></div>';
  }).join("") : '<p class="vacio">No hay citas para hoy.</p>';
}

function abrirFormCita(id) {
  const c = id ? _citas.find(function (x) { return x.id === id; }) : {};
  const fecha = fechaInput(c.fecha) || (c.fecha ? "" : (window._fechaPreset || ""));
  const ov = modalForm((id ? "Editar" : "Nueva") + " cita",
    '<div class="grid-2">' +
    campo("mascota", "Mascota", c.mascota) + campo("dueno", "Dueno", c.dueno) +
    campo("telefono", "Telefono", c.telefono) + campo("servicio", "Servicio", c.servicio) +
    campo("veterinario", "Veterinario", c.veterinario) +
    campo("fecha", "Fecha", fecha, "date") + campo("hora", "Hora", c.hora, "time") +
    selectCampo("estado", "Estado", ESTADOS_CITA, c.estado) +
    '</div>' + areaCampo("notas", "Notas", c.notas) +
    (id ? '<button type="button" class="btn btn-wa" id="wa-cita"><i class="fa-brands fa-whatsapp"></i> Enviar recordatorio por WhatsApp</button>' : ''));
  if (id) {
    document.getElementById("wa-cita").onclick = async function () {
      const plantilla = await obtenerPlantillaWA("recordatorio_cita");
      const msg = aplicarPlantilla(plantilla, { nombre: c.dueno, mascota: c.mascota, fecha: fmtFechaCorta(c.fecha) + " " + (c.hora || "") });
      enviarWhatsApp(c.telefono, msg);
    };
  }
  ov.querySelector("[data-guardar]").onclick = async function () {
    window._fechaPreset = "";
    const datos = {
      mascota: val("mascota"), dueno: val("dueno"), telefono: val("telefono"),
      servicio: val("servicio"), veterinario: val("veterinario"),
      hora: val("hora"), estado: val("estado"), notas: val("notas")
    };
    const f = val("fecha");
    if (!f) { toast("La fecha es obligatoria.", "warn"); return; }
    datos.fecha = firebase.firestore.Timestamp.fromDate(parseFechaLocal(f, datos.hora));
    if (!datos.mascota) { toast("Indica la mascota.", "warn"); return; }
    // Aviso de choque de horario con el mismo veterinario (no bloquea, pide confirmar).
    const choque = datos.veterinario && datos.hora && _citas.some(function (x) {
      return x.id !== id && x.estado !== "cancelada" && (x.veterinario || "").toLowerCase() === datos.veterinario.toLowerCase() &&
        x.hora === datos.hora && fechaInput(x.fecha) === f;
    });
    if (choque && !(await confirmar(datos.veterinario + " ya tiene una cita el " + f + " a las " + datos.hora + ". Guardar igual?"))) return;
    mostrarLoading(true);
    try {
      if (id) { await db.collection("citas").doc(id).update(datos); await registrarAuditoria("editar", "citas", "Edito cita de " + datos.mascota); }
      else { await db.collection("citas").add(datos); await registrarAuditoria("crear", "citas", "Agendo cita de " + datos.mascota); }
      cerrarModales(); toast("Cita guardada.", "ok"); await cargarCitas();
    } catch (e) { console.error(e); toast("Error al guardar.", "error"); } finally { mostrarLoading(false); }
  };
}

window.abrirFormCita = abrirFormCita;

if (location.pathname.match(/citas\.html$/)) {
  document.addEventListener("DOMContentLoaded", initCitas);
}

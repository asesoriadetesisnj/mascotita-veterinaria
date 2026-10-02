/* =====================================================================
 * cirugias.js
 * ---------------------------------------------------------------------
 * Modulo de cirugias y castraciones:
 *  - CRUD con tipo, veterinario, horarios, anestesia, costo, estado.
 *  - Checklist pre y post operatorio.
 *  - Generacion de ficha quirurgica en PDF (jsPDF).
 * ===================================================================== */

let _cirugias = [];
const TIPOS_CIRUGIA = ["castracion", "esterilizacion", "tejidos blandos", "traumatologia", "odontologia", "otros"];
const ESTADOS_CIRUGIA = ["programada", "en proceso", "finalizada"];
const CHECK_PRE = ["Ayuno confirmado", "Examen prequirurgico", "Consentimiento firmado", "Via colocada"];
const CHECK_POST = ["Recuperacion anestesica", "Analgesia indicada", "Herida controlada", "Alta coordinada"];

async function initCirugias() {
  await protegerPagina({ pagina: "cirugias.html" });
  cargarConfig();
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-syringe"></i> Cirugias</h1>' +
    '<button class="btn btn-primary" id="cir-nueva"><i class="fa-solid fa-plus"></i> Nueva cirugia</button></div>' +
    '<div class="table-wrap"><table class="tabla" id="tabla-cir">' +
    '<thead><tr><th>Fecha</th><th>Paciente</th><th>Tipo</th><th>Veterinario</th><th>Estado</th><th>Costo</th><th>Acciones</th></tr></thead>' +
    '<tbody></tbody></table></div>';
  document.getElementById("cir-nueva").onclick = function () { abrirFormCirugia(null); };
  await cargarCirugias();
}

async function cargarCirugias() {
  mostrarLoading(true);
  try {
    const snap = await db.collection("cirugias").orderBy("fecha", "desc").limit(300).get();
    _cirugias = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    pintarCirugias();
  } catch (e) { console.error(e); toast("Error cargando cirugias.", "error"); }
  finally { mostrarLoading(false); }
}

function pintarCirugias() {
  const tb = document.querySelector("#tabla-cir tbody");
  if (!_cirugias.length) { tb.innerHTML = '<tr><td colspan="7" class="vacio">Sin cirugias</td></tr>'; return; }
  tb.innerHTML = _cirugias.map(function (c) {
    return '<tr><td>' + fmtFechaCorta(c.fecha) + '</td><td>' + escHTML(c.paciente) + '</td>' +
      '<td>' + escHTML(c.tipo) + '</td><td>' + escHTML(c.veterinario || "") + '</td>' +
      '<td><span class="pill pill-estado-' + escHTML((c.estado || "").replace(/\s/g, "-")) + '">' + escHTML(c.estado) + '</span></td>' +
      '<td>' + fmtMoneda(c.costo) + '</td>' +
      '<td class="acciones">' +
      '<button class="btn-icono" title="Ficha PDF" onclick="pdfCirugia(\'' + c.id + '\')"><i class="fa-solid fa-file-pdf"></i></button>' +
      '<button class="btn-icono" title="Editar" onclick="abrirFormCirugia(\'' + c.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
      '</td></tr>';
  }).join("");
}

function checklistHTML(prefijo, lista, marcados) {
  marcados = marcados || [];
  return '<div class="checklist">' + lista.map(function (item, i) {
    const ck = marcados.indexOf(item) !== -1 ? "checked" : "";
    return '<label class="check"><input type="checkbox" id="' + prefijo + i + '" ' + ck + ' value="' + escHTML(item) + '"> ' + escHTML(item) + '</label>';
  }).join("") + '</div>';
}
function leerChecklist(prefijo, lista) {
  return lista.filter(function (_, i) {
    const el = document.getElementById(prefijo + i); return el && el.checked;
  });
}

function abrirFormCirugia(id) {
  const c = id ? _cirugias.find(function (x) { return x.id === id; }) : {};
  const fecha = fechaInput(c.fecha);
  const ov = modalForm((id ? "Editar" : "Nueva") + " cirugia",
    '<div class="grid-2">' +
    campo("paciente", "Paciente", c.paciente) + campo("dueno", "Dueno", c.dueno) +
    selectCampo("tipo", "Tipo", TIPOS_CIRUGIA, c.tipo) +
    campo("veterinario", "Veterinario", c.veterinario) +
    campo("fecha", "Fecha", fecha, "date") +
    selectCampo("estado", "Estado", ESTADOS_CIRUGIA, c.estado) +
    campo("horaEntrada", "Hora entrada", c.horaEntrada, "time") +
    campo("horaSalida", "Hora salida", c.horaSalida, "time") +
    campo("anestesia", "Anestesia", c.anestesia) +
    campo("costo", "Costo", c.costo, "number") +
    '</div>' + areaCampo("observaciones", "Observaciones", c.observaciones) +
    areaCampo("indicaciones", "Indicaciones post-operatorias", c.indicaciones) +
    '<h4 class="sub">Checklist pre-operatorio</h4>' + checklistHTML("pre", CHECK_PRE, c.checkPre) +
    '<h4 class="sub">Checklist post-operatorio</h4>' + checklistHTML("post", CHECK_POST, c.checkPost));
  ov.querySelector("[data-guardar]").onclick = async function () {
    const datos = {
      paciente: val("paciente"), dueno: val("dueno"), tipo: val("tipo"),
      veterinario: val("veterinario"), estado: val("estado"),
      horaEntrada: val("horaEntrada"), horaSalida: val("horaSalida"),
      anestesia: val("anestesia"), costo: Number(val("costo")) || 0,
      observaciones: val("observaciones"), indicaciones: val("indicaciones"),
      checkPre: leerChecklist("pre", CHECK_PRE), checkPost: leerChecklist("post", CHECK_POST)
    };
    const f = val("fecha");
    datos.fecha = f ? firebase.firestore.Timestamp.fromDate(parseFechaLocal(f)) : firebase.firestore.FieldValue.serverTimestamp();
    if (!datos.paciente) { toast("Paciente obligatorio.", "warn"); return; }
    if (datos.horaEntrada && datos.horaSalida && datos.horaSalida < datos.horaEntrada) { toast("La hora de salida no puede ser anterior a la entrada.", "warn"); return; }
    mostrarLoading(true);
    try {
      if (id) { await db.collection("cirugias").doc(id).update(datos); await registrarAuditoria("editar", "cirugias", "Edito cirugia de " + datos.paciente); }
      else { await db.collection("cirugias").add(datos); await registrarAuditoria("crear", "cirugias", "Programo cirugia de " + datos.paciente); }
      cerrarModales(); toast("Cirugia guardada.", "ok"); await cargarCirugias();
    } catch (e) { console.error(e); toast("Error al guardar.", "error"); } finally { mostrarLoading(false); }
  };
}

function pdfCirugia(id) {
  const c = _cirugias.find(function (x) { return x.id === id; });
  if (c) pdfFichaQuirurgica(c);
}

window.abrirFormCirugia = abrirFormCirugia;
window.pdfCirugia = pdfCirugia;

if (location.pathname.match(/cirugias\.html$/)) {
  document.addEventListener("DOMContentLoaded", initCirugias);
}

/* =====================================================================
 * vacunas.js  (NUEVO)
 * ---------------------------------------------------------------------
 * Carnet de vacunacion y desparasitacion por mascota:
 *  - Registro: mascota, tipo, producto/lote, fecha aplicada, proxima dosis.
 *  - Semaforo: vencida (rojo), vence en 30 dias (naranja), al dia (verde).
 *  - Recordatorio por WhatsApp con la plantilla "vacuna".
 * Coleccion Firestore: "vacunas" (ver firestore.rules).
 * Es el modulo que mas fideliza clientes: la clinica avisa antes de que
 * la vacuna venza y el dueno vuelve.
 * ===================================================================== */

let _vacunas = [], _vmascotas = [], _vduenos = [];
const TIPOS_VACUNA = ["Antirrabica", "Quintuple / Polivalente", "Triple felina", "Leucemia felina", "Tos de las perreras", "Desparasitacion interna", "Desparasitacion externa", "Otra"];

async function initVacunas() {
  await protegerPagina({ pagina: "vacunas.html" });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-shield-virus"></i> Vacunas y desparasitacion</h1>' +
    '<div class="head-actions"><input type="text" id="v-buscar" class="input-busca" placeholder="Buscar mascota o vacuna...">' +
    '<select id="v-filtro"><option value="">Todas</option><option value="vencida">Vencidas</option><option value="proxima">Vencen en 30 dias</option><option value="aldia">Al dia</option></select>' +
    '<button class="btn btn-primary" id="v-nueva"><i class="fa-solid fa-plus"></i> Registrar</button></div></div>' +
    '<div id="v-resumen" class="fac-resumen"></div>' +
    '<div class="table-wrap"><table class="tabla" id="tabla-vac"><thead><tr><th>Mascota</th><th>Vacuna</th><th>Aplicada</th><th>Proxima dosis</th><th>Estado</th><th>Acciones</th></tr></thead><tbody></tbody></table></div>';
  document.getElementById("v-nueva").onclick = function () { abrirFormVacuna(null); };
  document.getElementById("v-buscar").oninput = debounce(pintarVacunas, 250);
  document.getElementById("v-filtro").onchange = pintarVacunas;
  const q0 = paramQ(); if (q0) document.getElementById("v-buscar").value = q0;
  await cargarVacunas();
}

async function cargarVacunas() {
  mostrarLoading(true);
  try {
    const r = await Promise.all([
      db.collection("vacunas").orderBy("fecha", "desc").limit(500).get(),
      db.collection("mascotas").orderBy("nombre").get(),
      db.collection("propietarios").get()
    ]);
    _vacunas = r[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    _vmascotas = r[1].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    _vduenos = r[2].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    pintarVacunas();
  } catch (e) { console.error(e); toast("Error cargando vacunas.", "error"); }
  finally { mostrarLoading(false); }
}

/* Estado segun la proxima dosis: vencida | proxima | aldia | sin */
function estadoVacuna(v) {
  if (!v.proximaDosis) return "sin";
  const d = v.proximaDosis.toDate ? v.proximaDosis.toDate() : new Date(v.proximaDosis);
  const hoy = inicioDelDia(new Date());
  if (d < hoy) return "vencida";
  const lim = new Date(hoy); lim.setDate(lim.getDate() + 30);
  return d <= lim ? "proxima" : "aldia";
}
const ETQ_VAC = { vencida: ["Vencida", "danger"], proxima: ["Vence pronto", "warn"], aldia: ["Al dia", "ok"], sin: ["Sin refuerzo", "ok"] };

function pintarVacunas() {
  const q = (document.getElementById("v-buscar").value || "").toLowerCase();
  const f = document.getElementById("v-filtro").value;
  const lista = _vacunas.filter(function (v) {
    if (f && estadoVacuna(v) !== f) return false;
    return !q || ((v.mascota || "") + " " + (v.tipo || "") + " " + (v.dueno || "")).toLowerCase().indexOf(q) !== -1;
  });
  const cuenta = function (e) { return _vacunas.filter(function (v) { return estadoVacuna(v) === e; }).length; };
  document.getElementById("v-resumen").innerHTML =
    '<span class="pill pill-danger">Vencidas: ' + cuenta("vencida") + '</span> ' +
    '<span class="pill pill-warn">Vencen en 30 dias: ' + cuenta("proxima") + '</span> ' +
    '<span class="pill pill-ok">Al dia: ' + cuenta("aldia") + '</span>';
  const tb = document.querySelector("#tabla-vac tbody");
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="vacio">Sin registros</td></tr>'; return; }
  tb.innerHTML = lista.map(function (v) {
    const e = ETQ_VAC[estadoVacuna(v)];
    return '<tr><td>' + escHTML(v.mascota) + '<br><small class="muted">' + escHTML(v.dueno || "") + '</small></td>' +
      '<td>' + escHTML(v.tipo) + (v.producto ? '<br><small class="muted">' + escHTML(v.producto) + (v.lote ? " / lote " + escHTML(v.lote) : "") + '</small>' : '') + '</td>' +
      '<td>' + fmtFechaCorta(v.fecha) + '</td><td>' + (fmtFechaCorta(v.proximaDosis) || "-") + '</td>' +
      '<td><span class="pill pill-' + e[1] + '">' + e[0] + '</span></td>' +
      '<td class="acciones">' +
      '<button class="btn-icono" title="WhatsApp" onclick="waVacuna(\'' + v.id + '\')"><i class="fa-brands fa-whatsapp"></i></button>' +
      '<button class="btn-icono" title="Editar" onclick="abrirFormVacuna(\'' + v.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
      (window.MASCOTITA.usuario.role === "admin" ? '<button class="btn-icono danger" title="Eliminar" onclick="eliminarVacuna(\'' + v.id + '\')"><i class="fa-solid fa-trash"></i></button>' : '') +
      '</td></tr>';
  }).join("");
}

function abrirFormVacuna(id) {
  const v = id ? _vacunas.find(function (x) { return x.id === id; }) : {};
  const opsM = _vmascotas.map(function (m) { return { value: m.id, texto: m.nombre }; });
  const ov = modalForm((id ? "Editar" : "Registrar") + " vacuna",
    '<div class="grid-2">' +
    selectCampo("vmascota", "Mascota", opsM, v.mascotaId) +
    selectCampo("vtipo", "Tipo", TIPOS_VACUNA, v.tipo) +
    campo("vproducto", "Producto / marca", v.producto) + campo("vlote", "Lote", v.lote) +
    campo("vfecha", "Fecha de aplicacion", fechaInput(v.fecha) || hoyISO(), "date") +
    campo("vproxima", "Proxima dosis", fechaInput(v.proximaDosis), "date") +
    '</div>' + areaCampo("vnotas", "Notas", v.notas));
  ov.querySelector("[data-guardar]").onclick = async function () {
    const m = _vmascotas.find(function (x) { return x.id === val("vmascota"); });
    if (!m) { toast("Selecciona una mascota.", "warn"); return; }
    const dueno = _vduenos.find(function (d) { return d.id === m.propietarioId; });
    const fAp = parseFechaLocal(val("vfecha")), fPr = parseFechaLocal(val("vproxima"));
    if (!fAp) { toast("Indica la fecha de aplicacion.", "warn"); return; }
    if (fPr && fPr < fAp) { toast("La proxima dosis no puede ser anterior a la aplicacion.", "warn"); return; }
    const datos = {
      mascotaId: m.id, mascota: m.nombre, propietarioId: m.propietarioId || "",
      dueno: dueno ? dueno.nombre : "", telefono: dueno ? (dueno.telefono || "") : "",
      tipo: val("vtipo"), producto: val("vproducto"), lote: val("vlote"), notas: val("vnotas"),
      fecha: firebase.firestore.Timestamp.fromDate(fAp),
      proximaDosis: fPr ? firebase.firestore.Timestamp.fromDate(fPr) : null
    };
    mostrarLoading(true);
    try {
      if (id) { await db.collection("vacunas").doc(id).update(datos); await registrarAuditoria("editar", "vacunas", "Edito " + datos.tipo + " de " + datos.mascota); }
      else { datos.creadoPor = window.MASCOTITA.usuario.nombre; await db.collection("vacunas").add(datos); await registrarAuditoria("crear", "vacunas", "Registro " + datos.tipo + " de " + datos.mascota); }
      cerrarModales(); toast("Vacuna guardada.", "ok"); await cargarVacunas();
    } catch (e) { console.error(e); toast("Error al guardar.", "error"); } finally { mostrarLoading(false); }
  };
}

async function waVacuna(id) {
  const v = _vacunas.find(function (x) { return x.id === id; });
  if (!v) return;
  const base = await obtenerPlantillaWA("vacuna");
  const msg = aplicarPlantilla(base, { nombre: v.dueno || "", mascota: v.mascota, fecha: fmtFechaCorta(v.proximaDosis) });
  enviarWhatsApp(v.telefono, msg + (v.proximaDosis ? " (" + v.tipo + ", fecha: " + fmtFechaCorta(v.proximaDosis) + ")" : ""));
}

async function eliminarVacuna(id) {
  const v = _vacunas.find(function (x) { return x.id === id; });
  if (!(await confirmar("Eliminar el registro de " + (v ? v.tipo : "vacuna") + "?"))) return;
  mostrarLoading(true);
  try {
    await db.collection("vacunas").doc(id).delete();
    await registrarAuditoria("eliminar", "vacunas", "Elimino " + (v ? v.tipo + " de " + v.mascota : id));
    toast("Eliminado.", "ok"); await cargarVacunas();
  } catch (e) { console.error(e); toast("No se pudo eliminar.", "error"); } finally { mostrarLoading(false); }
}

window.abrirFormVacuna = abrirFormVacuna;
window.waVacuna = waVacuna;
window.eliminarVacuna = eliminarVacuna;

if (location.pathname.match(/vacunas\.html$/)) document.addEventListener("DOMContentLoaded", initVacunas);

/* =====================================================================
 * facturas.js  (solo ADMIN)
 * ---------------------------------------------------------------------
 * Sistema de facturacion simple:
 *  - Numeracion automatica (FAC-0001, FAC-0002...).
 *  - IVA configurable (lee config.iva), subtotal y total.
 *  - Descarga en PDF (jsPDF) e historial con estados.
 * ===================================================================== */

let _facturas = [];
let _ivaConfig = 10;
const ESTADOS_FAC = ["pagada", "pendiente", "anulada"];

async function initFacturas() {
  await protegerPagina({ soloAdmin: true, pagina: "facturas.html" });
  const cfg = await cargarConfig();
  _ivaConfig = Number(cfg.iva) || 10;
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-file-invoice-dollar"></i> Facturas</h1>' +
    '<button class="btn btn-primary" id="fac-nueva"><i class="fa-solid fa-plus"></i> Nueva factura</button></div>' +
    '<div class="filtros"><input type="text" id="fac-buscar" placeholder="Buscar cliente o numero...">' +
    '<select id="fac-estado"><option value="">Todos los estados</option><option>pagada</option><option>pendiente</option><option>anulada</option></select></div>' +
    '<div id="fac-resumen" class="fac-resumen"></div>' +
    '<div class="table-wrap"><table class="tabla" id="tabla-fac">' +
    '<thead><tr><th>Numero</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>' +
    '<tbody></tbody></table></div>';
  document.getElementById("fac-nueva").onclick = function () { abrirFormFactura(); };
  document.getElementById("fac-buscar").oninput = debounce(pintarFacturas, 250);
  document.getElementById("fac-estado").onchange = pintarFacturas;
  await cargarFacturas();
}

async function cargarFacturas() {
  mostrarLoading(true);
  try {
    const snap = await db.collection("facturas").orderBy("numero", "desc").limit(300).get();
    _facturas = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    pintarFacturas();
  } catch (e) { console.error(e); toast("Error cargando facturas.", "error"); }
  finally { mostrarLoading(false); }
}

function pintarFacturas() {
  const q = (document.getElementById("fac-buscar").value || "").toLowerCase();
  const est = document.getElementById("fac-estado").value;
  const lista = _facturas.filter(function (f) {
    if (est && f.estado !== est) return false;
    return !q || ((f.numero || "") + " " + (f.cliente || "")).toLowerCase().indexOf(q) !== -1;
  });
  const sum = function (e) { return _facturas.filter(function (f) { return f.estado === e; }).reduce(function (s, f) { return s + (f.total || 0); }, 0); };
  document.getElementById("fac-resumen").innerHTML =
    '<span class="pill pill-ok">Cobrado: ' + fmtMoneda(sum("pagada")) + '</span> ' +
    '<span class="pill pill-warn">Por cobrar: ' + fmtMoneda(sum("pendiente")) + '</span>';
  const tb = document.querySelector("#tabla-fac tbody");
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="vacio">Sin facturas</td></tr>'; return; }
  tb.innerHTML = lista.map(function (f) {
    return '<tr><td>' + escHTML(f.numero) + '</td><td>' + fmtFechaCorta(f.fecha) + '</td>' +
      '<td>' + escHTML(f.cliente) + '</td><td>' + fmtMoneda(f.total) + '</td>' +
      '<td><span class="pill pill-estado-' + escHTML(f.estado) + '">' + escHTML(f.estado) + '</span></td>' +
      '<td class="acciones">' +
      '<button class="btn-icono" title="PDF" onclick="pdfFacturaId(\'' + f.id + '\')"><i class="fa-solid fa-file-pdf"></i></button>' +
      '<button class="btn-icono" title="Cambiar estado" onclick="cambiarEstadoFactura(\'' + f.id + '\')"><i class="fa-solid fa-rotate"></i></button>' +
      '</td></tr>';
  }).join("");
}

/* Reserva el siguiente numero correlativo de forma ATOMICA (transaccion sobre
 * config/contadores). Antes se leia la ultima factura y se sumaba 1: si dos
 * personas facturaban a la vez salian numeros repetidos. */
async function siguienteNumero() {
  const ref = db.collection("config").doc("contadores");
  let n = 0;
  await db.runTransaction(async function (tx) {
    const snap = await tx.get(ref);
    let ult = snap.exists ? Number(snap.data().factura) || 0 : 0;
    if (!snap.exists) {
      // Primera vez: continuar desde la ultima factura existente (migracion).
      const q = await db.collection("facturas").orderBy("numero", "desc").limit(1).get();
      if (!q.empty) ult = parseInt(String(q.docs[0].data().numero || "").replace("FAC-", ""), 10) || 0;
    }
    n = ult + 1;
    tx.set(ref, { factura: n }, { merge: true });
  });
  return "FAC-" + String(n).padStart(4, "0");
}

function abrirFormFactura() {
  const ov = modalForm("Nueva factura",
    '<div class="grid-2">' +
    campo("cliente", "Cliente", "") +
    selectCampo("estado", "Estado", ESTADOS_FAC, "pendiente") +
    '</div>' +
    '<div id="fac-items"><h4 class="sub">Items</h4></div>' +
    '<button type="button" class="btn btn-ghost" id="add-item"><i class="fa-solid fa-plus"></i> Agregar item</button>' +
    '<div class="fac-totales" id="fac-totales"></div>');
  agregarItemFactura();
  document.getElementById("add-item").onclick = agregarItemFactura;
  ov.querySelector("[data-guardar]").onclick = guardarFactura;
}

let _itemCount = 0;
function agregarItemFactura() {
  _itemCount++;
  const cont = document.getElementById("fac-items");
  const div = document.createElement("div");
  div.className = "fac-item-row";
  div.innerHTML =
    '<input placeholder="Concepto" class="it-concepto">' +
    '<input type="number" placeholder="Cant." class="it-cant" value="1" min="1">' +
    '<input type="number" placeholder="Precio" class="it-precio" value="0">' +
    '<button type="button" class="btn-icono danger it-del"><i class="fa-solid fa-trash"></i></button>';
  cont.appendChild(div);
  div.querySelector(".it-del").onclick = function () { div.remove(); calcularTotales(); };
  div.querySelectorAll("input").forEach(function (i) { i.oninput = calcularTotales; });
  calcularTotales();
}

function leerItems() {
  return Array.from(document.querySelectorAll(".fac-item-row")).map(function (row) {
    return {
      concepto: row.querySelector(".it-concepto").value || "Servicio",
      cantidad: Number(row.querySelector(".it-cant").value) || 0,
      precio: Number(row.querySelector(".it-precio").value) || 0
    };
  }).filter(function (it) { return it.cantidad > 0; });
}

function calcularTotales() {
  const items = leerItems();
  const subtotal = items.reduce(function (s, it) { return s + it.cantidad * it.precio; }, 0);
  const iva = Math.round(subtotal * _ivaConfig / 100);
  const total = subtotal + iva;
  document.getElementById("fac-totales").innerHTML =
    '<p>Subtotal: <b>' + fmtMoneda(subtotal) + '</b></p>' +
    '<p>IVA (' + _ivaConfig + '%): <b>' + fmtMoneda(iva) + '</b></p>' +
    '<p class="total-grande">TOTAL: <b>' + fmtMoneda(total) + '</b></p>';
  return { subtotal: subtotal, iva: iva, total: total, items: items };
}

let _guardandoFac = false;
async function guardarFactura() {
  if (_guardandoFac) return;
  const t = calcularTotales();
  if (!t.items.length) { toast("Agrega al menos un item.", "warn"); return; }
  const cliente = val("cliente");
  if (!cliente) { toast("Cliente obligatorio.", "warn"); return; }
  _guardandoFac = true;
  mostrarLoading(true);
  try {
    const numero = await siguienteNumero();
    const factura = {
      numero: numero, cliente: cliente, estado: val("estado"),
      items: t.items, subtotal: t.subtotal, iva: t.iva, total: t.total,
      ivaPorcentaje: _ivaConfig,
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    };
    const ref = await db.collection("facturas").add(factura);
    await registrarAuditoria("crear", "facturas", "Emitio factura " + numero + " (" + cliente + ")");
    cerrarModales(); toast("Factura " + numero + " creada.", "ok");
    await cargarFacturas();
    // Descargar PDF al instante.
    factura.fecha = new Date();
    pdfFactura(factura);
  } catch (e) { console.error(e); toast("Error al crear la factura.", "error"); }
  finally { mostrarLoading(false); _guardandoFac = false; }
}

function pdfFacturaId(id) {
  const f = _facturas.find(function (x) { return x.id === id; });
  if (f) pdfFactura(f);
}

function cambiarEstadoFactura(id) {
  const f = _facturas.find(function (x) { return x.id === id; });
  if (!f) return;
  const ov = modalForm("Estado de " + f.numero, selectCampo("nuevoEstado", "Nuevo estado", ESTADOS_FAC, f.estado));
  ov.querySelector("[data-guardar]").onclick = async function () {
    const nuevo = val("nuevoEstado");
    if (nuevo === f.estado) { cerrarModales(); return; }
    if (nuevo === "anulada" && !(await confirmar("Anular la factura " + f.numero + "? Queda registrada, no se borra."))) return;
    mostrarLoading(true);
    try {
      await db.collection("facturas").doc(id).update({ estado: nuevo });
      await registrarAuditoria("editar", "facturas", "Cambio estado de " + f.numero + " a " + nuevo);
      cerrarModales(); toast("Estado actualizado.", "ok"); await cargarFacturas();
    } catch (e) { console.error(e); toast("Error.", "error"); } finally { mostrarLoading(false); }
  };
}

window.pdfFacturaId = pdfFacturaId;
window.cambiarEstadoFactura = cambiarEstadoFactura;

if (location.pathname.match(/facturas\.html$/)) {
  document.addEventListener("DOMContentLoaded", initFacturas);
}

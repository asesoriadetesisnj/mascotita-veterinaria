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
    '<div class="table-wrap"><table class="tabla" id="tabla-fac">' +
    '<thead><tr><th>Numero</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Acciones</th></tr></thead>' +
    '<tbody></tbody></table></div>';
  document.getElementById("fac-nueva").onclick = function () { abrirFormFactura(); };
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
  const tb = document.querySelector("#tabla-fac tbody");
  if (!_facturas.length) { tb.innerHTML = '<tr><td colspan="6" class="vacio">Sin facturas</td></tr>'; return; }
  tb.innerHTML = _facturas.map(function (f) {
    return '<tr><td>' + escHTML(f.numero) + '</td><td>' + fmtFechaCorta(f.fecha) + '</td>' +
      '<td>' + escHTML(f.cliente) + '</td><td>' + fmtMoneda(f.total) + '</td>' +
      '<td><span class="pill pill-estado-' + escHTML(f.estado) + '">' + escHTML(f.estado) + '</span></td>' +
      '<td class="acciones">' +
      '<button class="btn-icono" title="PDF" onclick="pdfFacturaId(\'' + f.id + '\')"><i class="fa-solid fa-file-pdf"></i></button>' +
      '<button class="btn-icono" title="Cambiar estado" onclick="cambiarEstadoFactura(\'' + f.id + '\')"><i class="fa-solid fa-rotate"></i></button>' +
      '</td></tr>';
  }).join("");
}

/* Genera el siguiente numero correlativo FAC-0001. */
async function siguienteNumero() {
  const snap = await db.collection("facturas").orderBy("numero", "desc").limit(1).get();
  let n = 0;
  if (!snap.empty) {
    const ult = snap.docs[0].data().numero || "FAC-0000";
    n = parseInt(ult.replace("FAC-", ""), 10) || 0;
  }
  return "FAC-" + String(n + 1).padStart(4, "0");
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

async function guardarFactura() {
  const t = calcularTotales();
  if (!t.items.length) { toast("Agrega al menos un item.", "warn"); return; }
  const cliente = val("cliente");
  if (!cliente) { toast("Cliente obligatorio.", "warn"); return; }
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
  finally { mostrarLoading(false); }
}

function pdfFacturaId(id) {
  const f = _facturas.find(function (x) { return x.id === id; });
  if (f) pdfFactura(f);
}

async function cambiarEstadoFactura(id) {
  const f = _facturas.find(function (x) { return x.id === id; });
  const idx = ESTADOS_FAC.indexOf(f.estado);
  const nuevo = ESTADOS_FAC[(idx + 1) % ESTADOS_FAC.length];
  if (!(await confirmar("Cambiar estado de " + f.numero + " a \"" + nuevo + "\"?"))) return;
  mostrarLoading(true);
  try {
    await db.collection("facturas").doc(id).update({ estado: nuevo });
    await registrarAuditoria("editar", "facturas", "Cambio estado de " + f.numero + " a " + nuevo);
    toast("Estado actualizado.", "ok"); await cargarFacturas();
  } catch (e) { console.error(e); toast("Error.", "error"); } finally { mostrarLoading(false); }
}

window.pdfFacturaId = pdfFacturaId;
window.cambiarEstadoFactura = cambiarEstadoFactura;

if (location.pathname.match(/facturas\.html$/)) {
  document.addEventListener("DOMContentLoaded", initFacturas);
}

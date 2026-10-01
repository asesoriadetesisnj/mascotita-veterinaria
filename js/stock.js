/* =====================================================================
 * stock.js
 * ---------------------------------------------------------------------
 * Modulo de inventario:
 *  - CRUD de productos (ADMIN completo, USER solo lectura/entrada).
 *  - Alertas de stock bajo y proximo vencimiento.
 *  - Escaner de codigo de barras con camara (html5-qrcode).
 *  - Historial de movimientos (coleccion movimientos_stock).
 *  - Notificacion por email cuando un producto baja del minimo.
 * ===================================================================== */

let _productos = [];
let _esAdminStock = false;
let _scanner = null;

async function initStock() {
  const u = await protegerPagina({ pagina: "stock.html" });
  _esAdminStock = u.role === "admin";
  pintarEstructuraStock();
  await cargarProductos();
}

function pintarEstructuraStock() {
  const cont = document.getElementById("content");
  cont.innerHTML =
    '<div class="page-head">' +
    '  <h1><i class="fa-solid fa-boxes-stacked"></i> Stock</h1>' +
    '  <div class="head-actions">' +
    '    <input type="text" id="stock-buscar" class="input-busca" placeholder="Buscar producto...">' +
    (_esAdminStock ? '    <button class="btn btn-primary" id="stock-nuevo"><i class="fa-solid fa-plus"></i> Nuevo</button>' : '') +
    '  </div>' +
    '</div>' +
    '<div id="stock-alertas"></div>' +
    '<div class="table-wrap"><table class="tabla" id="tabla-stock">' +
    '  <thead><tr><th></th><th>Producto</th><th>Categoria</th><th>Cant.</th>' +
    '  <th>P. venta</th><th>Vence</th><th>Proveedor</th><th>Acciones</th></tr></thead>' +
    '  <tbody></tbody></table></div>';
  document.getElementById("stock-buscar").oninput = debounce(pintarStock, 250);
  if (_esAdminStock) document.getElementById("stock-nuevo").onclick = function () { abrirFormProducto(null); };
}

async function cargarProductos() {
  mostrarLoading(true);
  try {
    const snap = await db.collection("productos").orderBy("nombre").get();
    _productos = snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    pintarAlertas();
    pintarStock();
  } catch (e) { console.error(e); toast("Error cargando el stock.", "error"); }
  finally { mostrarLoading(false); }
}

function venceEnDias(fechaVenc, dias) {
  if (!fechaVenc) return false;
  const d = fechaVenc.toDate ? fechaVenc.toDate() : new Date(fechaVenc);
  const limite = new Date(); limite.setDate(limite.getDate() + dias);
  return d <= limite;
}

function pintarAlertas() {
  const bajos = _productos.filter(function (p) { return Number(p.cantidad) <= Number(p.minimoStock || 0); });
  const porVencer = _productos.filter(function (p) { return venceEnDias(p.fechaVencimiento, 30); });
  const cont = document.getElementById("stock-alertas");
  let html = "";
  if (bajos.length) html += '<div class="alerta alerta-warn"><i class="fa-solid fa-triangle-exclamation"></i> ' +
    bajos.length + ' producto(s) con stock bajo: ' + escHTML(bajos.map(function (p) { return p.nombre; }).join(", ")) + '</div>';
  if (porVencer.length) html += '<div class="alerta alerta-danger"><i class="fa-solid fa-clock"></i> ' +
    porVencer.length + ' producto(s) proximos a vencer (30 dias): ' + escHTML(porVencer.map(function (p) { return p.nombre; }).join(", ")) + '</div>';
  cont.innerHTML = html;
}

function pintarStock() {
  const q = (document.getElementById("stock-buscar").value || "").toLowerCase();
  const filas = _productos.filter(function (p) {
    return !q || (p.nombre + " " + p.categoria + " " + (p.codigoBarras || "")).toLowerCase().indexOf(q) !== -1;
  });
  const tb = document.querySelector("#tabla-stock tbody");
  if (!filas.length) { tb.innerHTML = '<tr><td colspan="8" class="vacio">Sin productos</td></tr>'; return; }
  tb.innerHTML = filas.map(function (p) {
    const bajo = Number(p.cantidad) <= Number(p.minimoStock || 0);
    const vence = venceEnDias(p.fechaVencimiento, 30);
    const foto = p.imagenURL ? '<img src="' + escHTML(p.imagenURL) + '" class="mini-img">' : '<i class="fa-solid fa-box icono-tabla"></i>';
    let acc = '<button class="btn-icono" title="Movimiento" onclick="abrirMovimiento(\'' + p.id + '\')"><i class="fa-solid fa-right-left"></i></button>';
    if (_esAdminStock) {
      acc += '<button class="btn-icono" title="Editar" onclick="abrirFormProducto(\'' + p.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
        '<button class="btn-icono danger" title="Eliminar" onclick="eliminarProducto(\'' + p.id + '\')"><i class="fa-solid fa-trash"></i></button>';
    }
    return '<tr class="' + (bajo ? 'fila-bajo' : '') + '">' +
      '<td>' + foto + '</td>' +
      '<td>' + escHTML(p.nombre) + '</td>' +
      '<td>' + escHTML(p.categoria) + '</td>' +
      '<td>' + escHTML(p.cantidad) + (bajo ? ' <span class="pill pill-warn">bajo</span>' : '') + '</td>' +
      '<td>' + fmtMoneda(p.precioVenta) + '</td>' +
      '<td>' + fmtFechaCorta(p.fechaVencimiento) + (vence ? ' <span class="pill pill-danger">vence</span>' : '') + '</td>' +
      '<td>' + escHTML(p.proveedor || "") + '</td>' +
      '<td class="acciones">' + acc + '</td></tr>';
  }).join("");
}

/* ---------- Formulario de alta/edicion (solo ADMIN) ---------- */
function abrirFormProducto(id) {
  const p = id ? _productos.find(function (x) { return x.id === id; }) : {};
  const venc = p.fechaVencimiento && p.fechaVencimiento.toDate
    ? p.fechaVencimiento.toDate().toISOString().slice(0, 10)
    : (p.fechaVencimiento || "");
  const ov = modalForm((id ? "Editar" : "Nuevo") + " producto",
    '<div class="grid-2">' +
    campo("nombre", "Nombre", p.nombre) +
    selectCampo("categoria", "Categoria", ["medicamento", "alimento", "accesorio"], p.categoria) +
    campo("cantidad", "Cantidad", p.cantidad, "number") +
    campo("minimoStock", "Minimo (alerta)", p.minimoStock, "number") +
    campo("precioCompra", "Precio compra", p.precioCompra, "number") +
    campo("precioVenta", "Precio venta", p.precioVenta, "number") +
    campo("fechaVencimiento", "Vencimiento", venc, "date") +
    campo("proveedor", "Proveedor", p.proveedor) +
    '<div class="form-field"><label>Codigo de barras</label>' +
    '<div class="input-con-boton">' +
    '<input id="f-codigoBarras" value="' + escHTML(p.codigoBarras || "") + '">' +
    '<button type="button" class="btn btn-ghost" id="btn-escanear"><i class="fa-solid fa-camera"></i> Escanear</button>' +
    '</div></div>' +
    campo("imagenURL", "URL imagen (opcional)", p.imagenURL) +
    '</div>' +
    '<div id="scanner-zona"></div>');
  document.getElementById("btn-escanear").onclick = toggleScanner;
  ov.querySelector("[data-guardar]").onclick = async function () {
    await guardarProducto(id);
  };
}

async function guardarProducto(id) {
  const datos = {
    nombre: val("nombre"), categoria: val("categoria"),
    cantidad: Number(val("cantidad")) || 0,
    minimoStock: Number(val("minimoStock")) || 0,
    precioCompra: Number(val("precioCompra")) || 0,
    precioVenta: Number(val("precioVenta")) || 0,
    proveedor: val("proveedor"), codigoBarras: val("codigoBarras"),
    imagenURL: val("imagenURL")
  };
  const venc = val("fechaVencimiento");
  datos.fechaVencimiento = venc ? firebase.firestore.Timestamp.fromDate(new Date(venc)) : null;
  if (!datos.nombre) { toast("El nombre es obligatorio.", "warn"); return; }
  mostrarLoading(true);
  try {
    if (id) {
      await db.collection("productos").doc(id).update(datos);
      await registrarAuditoria("editar", "stock", "Edito producto " + datos.nombre);
    } else {
      datos.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("productos").add(datos);
      await registrarAuditoria("crear", "stock", "Creo producto " + datos.nombre);
    }
    cerrarModales(); toast("Producto guardado.", "ok");
    await cargarProductos();
    if (datos.cantidad <= datos.minimoStock) notificarStockBajo(datos);
  } catch (e) { console.error(e); toast("No se pudo guardar.", "error"); }
  finally { mostrarLoading(false); }
}

async function eliminarProducto(id) {
  const p = _productos.find(function (x) { return x.id === id; });
  if (!(await confirmar("Eliminar el producto \"" + (p ? p.nombre : "") + "\"?"))) return;
  mostrarLoading(true);
  try {
    await db.collection("productos").doc(id).delete();
    await registrarAuditoria("eliminar", "stock", "Elimino producto " + (p ? p.nombre : id));
    toast("Producto eliminado.", "ok");
    await cargarProductos();
  } catch (e) { console.error(e); toast("No se pudo eliminar.", "error"); }
  finally { mostrarLoading(false); }
}

/* ---------- Movimientos de stock (entradas/salidas) ---------- */
function abrirMovimiento(id) {
  const p = _productos.find(function (x) { return x.id === id; });
  const ov = modalForm("Movimiento de stock - " + escHTML(p.nombre),
    selectCampo("tipoMov", "Tipo", ["entrada", "salida"], "entrada") +
    campo("cantidadMov", "Cantidad", "", "number") +
    campo("motivoMov", "Motivo / detalle", ""));
  ov.querySelector("[data-guardar]").onclick = async function () {
    const tipo = val("tipoMov");
    const cant = Number(val("cantidadMov")) || 0;
    if (cant <= 0) { toast("Cantidad invalida.", "warn"); return; }
    const nuevaCant = tipo === "entrada" ? Number(p.cantidad) + cant : Number(p.cantidad) - cant;
    if (nuevaCant < 0) { toast("No hay stock suficiente.", "warn"); return; }
    mostrarLoading(true);
    try {
      await db.collection("productos").doc(id).update({ cantidad: nuevaCant });
      await db.collection("movimientos_stock").add({
        productoId: id, producto: p.nombre, tipo: tipo, cantidad: cant,
        motivo: val("motivoMov"), usuario: window.MASCOTITA.usuario.nombre,
        fecha: firebase.firestore.FieldValue.serverTimestamp()
      });
      await registrarAuditoria(tipo === "entrada" ? "entrada_stock" : "salida_stock", "stock",
        tipo + " de " + cant + " x " + p.nombre);
      cerrarModales(); toast("Movimiento registrado.", "ok");
      await cargarProductos();
      const actualizado = _productos.find(function (x) { return x.id === id; });
      if (actualizado && actualizado.cantidad <= actualizado.minimoStock) notificarStockBajo(actualizado);
    } catch (e) { console.error(e); toast("Error en el movimiento.", "error"); }
    finally { mostrarLoading(false); }
  };
}

/* ---------- Escaner de codigo de barras (html5-qrcode) ---------- */
function toggleScanner() {
  const zona = document.getElementById("scanner-zona");
  if (_scanner) { detenerScanner(); return; }
  if (!window.Html5Qrcode) { toast("La libreria del escaner no se cargo.", "error"); return; }
  zona.innerHTML = '<div id="reader" class="reader-box"></div>' +
    '<p class="hint">Apunta la camara al codigo de barras.</p>';
  _scanner = new Html5Qrcode("reader");
  _scanner.start({ facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 150 } },
    function (texto) {
      document.getElementById("f-codigoBarras").value = texto;
      toast("Codigo detectado: " + texto, "ok");
      detenerScanner();
    },
    function () { /* ignorar frames sin lectura */ }
  ).catch(function (e) {
    console.error(e); toast("No se pudo abrir la camara.", "error"); _scanner = null;
  });
}
function detenerScanner() {
  if (_scanner) {
    _scanner.stop().then(function () { _scanner.clear(); }).catch(function () {});
    _scanner = null;
  }
  const zona = document.getElementById("scanner-zona");
  if (zona) zona.innerHTML = "";
}

window.abrirFormProducto = abrirFormProducto;
window.eliminarProducto = eliminarProducto;
window.abrirMovimiento = abrirMovimiento;

if (location.pathname.match(/stock\.html$/)) {
  document.addEventListener("DOMContentLoaded", initStock);
}

/* =====================================================================
 * stock.js — Inventario en tiempo real
 *  - Productos con IVA, costo, margen, lote, vencimiento, proveedor.
 *  - Movimientos (entrada / salida / ajuste) SIEMPRE en transaccion.
 *  - La cantidad no se edita a mano: se ajusta con un movimiento
 *    (asi queda trazabilidad de cada unidad).
 *  - Escaner con camara o lector USB para buscar.
 * ===================================================================== */
const CATEGORIAS_PROD = ["Medicamento", "Vacuna", "Antiparasitario", "Alimento", "Accesorio", "Higiene", "Insumo clínico", "Otro"];
const UNIDADES = ["unidad", "caja", "frasco", "comprimido", "ampolla", "ml", "kg", "bolsa"];
const MOTIVOS_MOV = { entrada: ["Compra", "Devolución de cliente", "Ajuste de inventario", "Otro"], salida: ["Uso interno / consultorio", "Vencido / descartado", "Rotura", "Devolución a proveedor", "Ajuste de inventario", "Otro"] };
let _tabStock = "productos", _movs = [], _movUnsub = null;

async function initStock() {
  await protegerPagina({ permiso: "stock", pagina: "stock.html" });
  const adm = esAdmin();
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-boxes-stacked"></i> Stock</h1><div class="head-actions">' +
    '<button class="btn btn-ghost" id="s-scan" title="Buscar con la cámara"><i class="fa-solid fa-barcode"></i> Escanear</button>' +
    (adm ? '<button class="btn btn-ghost" id="s-exp"><i class="fa-solid fa-file-excel"></i> Exportar</button><a class="btn btn-ghost" href="compras.html"><i class="fa-solid fa-truck-field"></i> Cargar compra</a>' +
      '<button class="btn btn-primary" id="s-nuevo"><i class="fa-solid fa-plus"></i> Producto</button>' : "") + "</div></div>" +
    '<div id="scan-zona"></div><div class="chips" id="s-resumen"></div>' +
    '<div class="tabs"><button class="tab" data-t="productos"><i class="fa-solid fa-box"></i> Productos</button><button class="tab" data-t="movimientos"><i class="fa-solid fa-right-left"></i> Movimientos</button></div>' +
    '<div id="s-filtros" class="filtros card"><input type="search" id="s-buscar" placeholder="Nombre, categoría o código de barras...">' +
    '<select id="s-cat"><option value="">Todas las categorías</option>' + CATEGORIAS_PROD.map(function (c) { return "<option>" + c + "</option>"; }).join("") + "</select>" +
    '<select id="s-filtro"><option value="">Todos</option><option value="bajo">Stock bajo</option><option value="sin">Sin stock</option><option value="vence">Vencen en 60 días</option></select></div>' +
    '<div id="s-cuerpo">' + skeleton(8) + "</div>";
  document.getElementById("s-buscar").value = paramQ();
  const f = paramURL("filtro"); if (f) document.getElementById("s-filtro").value = f;
  document.getElementById("s-buscar").oninput = debounce(pintarStock, 150);
  ["s-cat", "s-filtro"].forEach(function (id) { document.getElementById(id).onchange = pintarStock; });
  document.querySelectorAll(".tab").forEach(function (t) { t.onclick = function () { _tabStock = t.dataset.t; if (_tabStock === "movimientos") escucharMovs(); pintarStock(); }; });
  document.getElementById("s-scan").onclick = function () {
    abrirEscaner("scan-zona", async function (cod) {
      const p = Datos.lista("productos").find(function (x) { return x.codigoBarras === cod; });
      if (p) { _tabStock = "productos"; document.getElementById("s-buscar").value = cod; pintarStock(); abrirMovimiento(p.id); }
      else if (adm && await confirmar("No existe un producto con el código " + cod + ". ¿Crearlo?", { peligro: false, textoSi: "Crear producto" })) abrirFormProducto(null, { codigoBarras: cod });
      else toast("Código " + cod + " no encontrado.", "warn");
    });
  };
  if (adm) {
    document.getElementById("s-nuevo").onclick = function () { abrirFormProducto(null); };
    document.getElementById("s-exp").onclick = function () {
      exportarAExcel(Datos.lista("productos"), [{ k: "nombre", t: "Producto" }, { k: "categoria", t: "Categoría" }, { k: "codigoBarras", t: "Código" }, { k: "cantidad", t: "Stock" }, { k: "unidad", t: "Unidad" },
        { k: "minimoStock", t: "Mínimo" }, { k: "precioCompra", t: "Costo" }, { k: "precioVenta", t: "Precio venta" }, { k: "iva", t: "IVA %" }, { k: "lote", t: "Lote" },
        { k: "fechaVencimiento", t: "Vence", f: fmtFechaCorta }, { k: "proveedor", t: "Proveedor" }, { k: "valor", t: "Valor stock (costo)", f: function (v, p) { return (Number(p.cantidad) || 0) * (Number(p.precioCompra) || 0); } }], "inventario");
    };
  }
  Datos.suscribir("proveedores");
  Datos.suscribir("productos", pintarStock);
}

function filtrarProductos() {
  const q = document.getElementById("s-buscar").value, cat = document.getElementById("s-cat").value, f = document.getElementById("s-filtro").value;
  const lim = sumarDias(new Date(), 60);
  return Datos.lista("productos").filter(function (p) {
    const cant = Number(p.cantidad) || 0;
    if (f === "bajo" && !(cant <= (Number(p.minimoStock) || 0))) return false;
    if (f === "sin" && cant > 0) return false;
    if (f === "vence" && !(p.fechaVencimiento && aFecha(p.fechaVencimiento) <= lim && cant > 0)) return false;
    return (!cat || normalizar(p.categoria) === normalizar(cat)) && coincide([p.nombre, p.categoria, p.codigoBarras, p.proveedor].join(" "), q);
  });
}
function pintarStock() {
  document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("activo", t.dataset.t === _tabStock); });
  document.getElementById("s-filtros").hidden = _tabStock !== "productos";
  const ps = Datos.lista("productos"), adm = esAdmin();
  const bajos = ps.filter(function (p) { return (Number(p.cantidad) || 0) <= (Number(p.minimoStock) || 0); }).length;
  const valor = ps.reduce(function (a, p) { return a + Math.max(0, Number(p.cantidad) || 0) * (Number(p.precioCompra) || 0); }, 0);
  document.getElementById("s-resumen").innerHTML = '<div class="chip-resumen"><small>Productos</small><b>' + ps.length + '</b></div><div class="chip-resumen"><small>Stock bajo</small><b class="' + (bajos ? "texto-warn" : "") + '">' + bajos + "</b></div>" +
    (adm ? '<div class="chip-resumen"><small>Valor del inventario (costo)</small><b>' + fmtMoneda(valor) + "</b></div>" : "");
  const cont = document.getElementById("s-cuerpo");
  if (_tabStock === "movimientos") return pintarMovs(cont);
  const hoy = inicioDelDia(), lim = sumarDias(hoy, 60);
  const cols = [
    { k: "nombre", t: "Producto", r: function (p) {
      return '<div class="celda-m">' + (p.imagenURL ? '<img class="avatar-m sm" style="border-radius:8px" src="' + escHTML(p.imagenURL) + '" alt="">' : '<span class="avatar-m ph sm" style="border-radius:8px"><i class="fa-solid fa-box"></i></span>') +
        "<div><b>" + escHTML(p.nombre) + "</b><br><small>" + escHTML([p.categoria, p.codigoBarras].filter(Boolean).join(" · ")) + "</small></div></div>";
    } },
    { k: "cantidad", t: "Stock", cls: "num", v: function (p) { return Number(p.cantidad) || 0; }, r: function (p) {
      const c = Number(p.cantidad) || 0, bajo = c <= (Number(p.minimoStock) || 0);
      return '<b class="' + (c <= 0 ? "texto-danger" : bajo ? "texto-warn" : "") + '">' + fmtNum(c) + "</b> <small>" + escHTML(p.unidad || "") + "</small>" + (bajo ? "<br><small>mín. " + fmtNum(p.minimoStock || 0) + "</small>" : "");
    } },
    { k: "precioVenta", t: "Precio", cls: "num", r: function (p) { return fmtMoneda(p.precioVenta) + '<br><small>IVA ' + (p.iva === 0 ? "exenta" : (p.iva || 10) + "%") + "</small>"; } }
  ];
  if (adm) cols.push({ k: "margen", t: "Margen", cls: "num", v: function (p) { return p.precioCompra ? (p.precioVenta - p.precioCompra) / p.precioCompra : -1; }, r: function (p) {
    if (!p.precioCompra) return "—";
    const m = Math.round(((p.precioVenta || 0) - p.precioCompra) / p.precioCompra * 100);
    return '<span class="' + (m < 15 ? "texto-danger" : "") + '">' + m + "%</span><br><small>costo " + fmtMoneda(p.precioCompra) + "</small>";
  } });
  cols.push({ k: "fechaVencimiento", t: "Vence", v: function (p) { return aFecha(p.fechaVencimiento); }, r: function (p) {
    if (!p.fechaVencimiento) return "—";
    const d = aFecha(p.fechaVencimiento);
    return fmtFechaCorta(d) + (d < hoy ? " " + pill("Vencido", "danger") : d <= lim ? " " + pill("Pronto", "warn") : "") + (p.lote ? "<br><small>lote " + escHTML(p.lote) + "</small>" : "");
  } });
  cols.push({ k: "proveedor", t: "Proveedor", r: function (p) { const pr = Datos.porId("proveedores", p.proveedorId); return escHTML(pr ? pr.nombre : p.proveedor || ""); } });
  cols.push({ k: "a", t: "", sort: false, cls: "acciones", r: function (p) {
    return btnIcono("fa-right-left", "Movimiento de stock", "abrirMovimiento('" + p.id + "')") + btnIcono("fa-clock-rotate-left", "Historial", "verMovsProducto('" + p.id + "')") +
      (adm ? btnIcono("fa-pen", "Editar", "abrirFormProducto('" + p.id + "')") + btnIcono("fa-trash", "Eliminar", "eliminarProducto('" + p.id + "')", "danger") : "");
  } });
  tabla(cont, { filas: filtrarProductos(), columnas: cols, orden: "nombre", vacio: ps.length ? "Ningún producto coincide con el filtro." : "Todavía no hay productos.", vacioIcono: "fa-box",
    claseFila: function (p) { return (Number(p.cantidad) || 0) <= (Number(p.minimoStock) || 0) ? "fila-alerta" : ""; } });
}

/* ---------- Producto (solo ADMIN) ---------- */
function abrirFormProducto(id, pre) {
  const p = id ? Datos.porId("productos", id) || {} : Object.assign({ iva: 10, unidad: "unidad" }, pre || {});
  const provs = Datos.lista("proveedores").map(function (x) { return { value: x.id, texto: x.nombre }; });
  const ov = modalForm((id ? "Editar" : "Nuevo") + " producto",
    '<div class="grid-2">' +
    campo("pnombre", "Nombre", p.nombre, "text", { req: true }) +
    campo("pcat", "Categoría", p.categoria, "text", { lista: "dl-cat" }) +
    '<div class="form-field"><label for="f-pcod">Código de barras</label><div class="input-con-boton"><input id="f-pcod" value="' + escHTML(p.codigoBarras || "") + '"><button type="button" class="btn btn-ghost" id="p-scan"><i class="fa-solid fa-camera"></i></button></div></div>' +
    selectCampo("punidad", "Unidad", UNIDADES, p.unidad || "unidad") +
    (id ? '<div class="form-field"><label>Stock actual</label><input readonly value="' + fmtNum(p.cantidad) + '"><small class="hint">Para cambiarlo usá "Movimiento" (queda registrado).</small></div>'
      : campo("pcant", "Stock inicial", "0", "number", { min: 0 })) +
    campo("pmin", "Stock mínimo (alerta)", p.minimoStock || 0, "number", { min: 0 }) +
    campo("pcompra", "Costo (precio de compra)", p.precioCompra || "", "number", { min: 0 }) +
    campo("pventa", "Precio de venta (IVA incluido)", p.precioVenta || "", "number", { min: 0, req: true }) +
    selectCampo("piva", "IVA", IVA_OPCIONES, String(p.iva != null ? p.iva : 10)) +
    '<div class="form-field"><label>Margen</label><input id="f-pmargen" readonly></div>' +
    campo("pvenc", "Vencimiento", fechaInput(p.fechaVencimiento), "date") + campo("plote", "Lote", p.lote) +
    selectCampo("pprov", "Proveedor", provs, p.proveedorId, { vacio: provs.length ? "—" : "Cargá proveedores en Compras" }) +
    campo("pubic", "Ubicación (estante)", p.ubicacion) +
    campo("pimg", "URL de imagen (opcional)", p.imagenURL, "url", { full: true }) +
    "</div>" + datalist("dl-cat", CATEGORIAS_PROD) + '<div id="scan-prod"></div>', {
      ancho: "modal-lg", antesDeCerrar: function () { detenerScanner(); },
      onGuardar: async function () {
        const pv = Datos.porId("proveedores", val("pprov"));
        const datos = {
          nombre: val("pnombre"), categoria: val("pcat"), codigoBarras: val("pcod"), unidad: val("punidad"),
          minimoStock: num("pmin"), precioCompra: num("pcompra"), precioVenta: num("pventa"), iva: Number(val("piva")),
          fechaVencimiento: tsDeInput(val("pvenc")), lote: val("plote"), proveedorId: pv ? pv.id : "", proveedor: pv ? pv.nombre : (p.proveedor || ""),
          ubicacion: val("pubic"), imagenURL: val("pimg")
        };
        if (datos.codigoBarras) {
          const dup = Datos.lista("productos").find(function (x) { return x.id !== id && x.codigoBarras === datos.codigoBarras; });
          if (dup) throw errorUsuario("El código de barras ya lo usa \"" + dup.nombre + "\".");
        }
        if (datos.precioCompra && datos.precioVenta < datos.precioCompra && !(await confirmar("El precio de venta es menor al costo. ¿Guardar igual?", { peligro: false }))) return false;
        if (id) {
          datos.stockBajo = (Number(p.cantidad) || 0) <= datos.minimoStock;
          await actualizarDoc("productos", id, datos);
        } else {
          const ini = num("pcant");
          datos.cantidad = ini; datos.stockBajo = ini <= datos.minimoStock;
          const b = db.batch();
          const nid = await crearDoc("productos", datos, b);
          if (ini > 0) b.set(db.collection("movimientos_stock").doc(), { productoId: nid, producto: datos.nombre, tipo: "entrada", cantidad: ini, cantidadAnterior: 0, cantidadNueva: ini, motivo: "Stock inicial", origen: "alta", usuario: window.MASCOTITA.usuario.nombre, usuarioUid: window.MASCOTITA.usuario.uid, fecha: FS.serverTimestamp() });
          await escribir(b.commit());
        }
        registrarAuditoria(id ? "editar" : "crear", "stock", (id ? "Editó" : "Creó") + " producto " + datos.nombre + " (" + fmtMoneda(datos.precioVenta) + ")");
        toast("Producto guardado.", "ok");
      }
    });
  function margen() { const c = num("pcompra"), v = num("pventa"); el("pmargen").value = c ? Math.round((v - c) / c * 100) + "% · ganancia " + fmtMoneda(v - c) : "—"; }
  el("pcompra").oninput = margen; el("pventa").oninput = margen; margen();
  document.getElementById("p-scan").onclick = function () { abrirEscaner("scan-prod", function (c) { el("pcod").value = c; toast("Código: " + c, "ok"); }); };
  return ov;
}
async function eliminarProducto(id) {
  const p = Datos.porId("productos", id);
  if (await confirmar("¿Enviar \"" + p.nombre + "\" a la papelera?")) await Datos.aPapelera("productos", id, p);
}

/* ---------- Movimiento (todos los roles con stock) ---------- */
function abrirMovimiento(id) {
  const p = Datos.porId("productos", id); if (!p) return;
  const ov = modalForm("Movimiento · " + p.nombre,
    '<div class="chips"><div class="chip-resumen"><small>Stock actual</small><b>' + fmtNum(p.cantidad) + " " + escHTML(p.unidad || "") + "</b></div></div>" +
    '<div class="segmentado mb" id="mv-tipo"><button type="button" class="activo" data-t="salida">Salida</button><button type="button" data-t="entrada">Entrada</button><button type="button" data-t="ajuste">Ajuste (conteo)</button></div>' +
    '<div class="grid-2">' + campo("mcant", "Cantidad", "", "number", { min: 0, req: true }) + selectCampo("mmot", "Motivo", MOTIVOS_MOV.salida) + "</div>" +
    campo("mdet", "Detalle (opcional)", "", "text", { ph: "Ej: paciente, N° de remito..." }), {
      ancho: "modal-sm", textoGuardar: "Registrar",
      onGuardar: async function () {
        const cant = num("mcant");
        if (tipo !== "ajuste" && cant <= 0) throw errorUsuario("La cantidad debe ser mayor a 0.");
        if (tipo === "ajuste" && cant < 0) throw errorUsuario("El conteo no puede ser negativo.");
        const motivo = (tipo === "ajuste" ? "Ajuste por conteo" : val("mmot")) + (val("mdet") ? " · " + val("mdet") : "");
        requiereConexion("Mover stock");
        let delta, nuevo;
        await db.runTransaction(async function (tx) {
          const inv = await Inventario.leer(tx, [id]);
          const actual = Number(inv[id].cantidad) || 0;
          delta = tipo === "entrada" ? cant : tipo === "salida" ? -cant : cant - actual;
          if (!delta) throw errorUsuario("El conteo coincide con el stock: no hay nada que ajustar.");
          nuevo = Inventario.mover(tx, inv, [{ productoId: id, delta: delta, motivo: motivo }], { origen: tipo === "ajuste" ? "ajuste" : "manual" })[id];
        });
        registrarAuditoria(delta > 0 ? "entrada_stock" : "salida_stock", "stock", (delta > 0 ? "+" : "") + fmtNum(delta) + " " + p.nombre + " (" + motivo + ")");
        toast("Stock de " + p.nombre + ": " + fmtNum(nuevo), "ok");
        if (nuevo <= (Number(p.minimoStock) || 0)) notificarStockBajo(Object.assign({}, p, { cantidad: nuevo }));
      }
    });
  let tipo = "salida";
  ov.el.querySelectorAll("#mv-tipo button").forEach(function (b) {
    b.onclick = function () {
      tipo = b.dataset.t;
      ov.el.querySelectorAll("#mv-tipo button").forEach(function (x) { x.classList.toggle("activo", x === b); });
      el("mmot").closest(".form-field").hidden = tipo === "ajuste";
      el("mcant").closest(".form-field").querySelector("label").innerHTML = tipo === "ajuste" ? "Cantidad contada (real)" : "Cantidad";
      if (tipo !== "ajuste") el("mmot").innerHTML = MOTIVOS_MOV[tipo].map(function (m) { return "<option>" + m + "</option>"; }).join("");
    };
  });
}

/* ---------- Historial de movimientos ---------- */
function escucharMovs() {
  if (_movUnsub) return;
  _movUnsub = db.collection("movimientos_stock").orderBy("fecha", "desc").limit(400).onSnapshot(function (s) { _movs = docsDe(s); if (_tabStock === "movimientos") pintarStock(); },
    function (e) { toast(mensajeError(e), "error"); });
}
function columnasMov() {
  return [
    { k: "fecha", t: "Fecha", r: function (m) { return '<span class="nowrap">' + fmtFecha(m.fecha) + "</span>"; }, v: function (m) { return aFecha(m.fecha); } },
    { k: "producto", t: "Producto" },
    { k: "tipo", t: "Tipo", r: function (m) { return pill(m.tipo === "entrada" ? "+ entrada" : "− salida", m.tipo === "entrada" ? "ok" : "warn"); } },
    { k: "cantidad", t: "Cant.", cls: "num", r: function (m) { return fmtNum(m.cantidad); } },
    { k: "cantidadNueva", t: "Queda", cls: "num", r: function (m) { return fmtNum(m.cantidadAnterior) + " → <b>" + fmtNum(m.cantidadNueva) + "</b>"; } },
    { k: "motivo", t: "Motivo", r: function (m) { return escHTML(m.motivo || "") + (m.origen && m.origen !== "manual" ? ' <small class="muted">(' + escHTML(m.origen) + ")</small>" : ""); } },
    { k: "usuario", t: "Usuario" }
  ];
}
function pintarMovs(cont) {
  tabla(cont, { filas: _movs, columnas: columnasMov(), orden: "fecha", dir: -1, vacio: "Sin movimientos", vacioIcono: "fa-right-left" });
}
async function verMovsProducto(id) {
  const p = Datos.porId("productos", id);
  const m = abrirModal({ titulo: "Historial · " + p.nombre, ancho: "modal-lg", cuerpo: '<div id="mv-hist">' + skeleton(5) + "</div>" });
  try {
    const s = await db.collection("movimientos_stock").where("productoId", "==", id).limit(300).get();
    tabla(m.q("#mv-hist"), { filas: docsDe(s), columnas: columnasMov().filter(function (c) { return c.k !== "producto"; }), orden: "fecha", dir: -1, vacio: "Sin movimientos" });
  } catch (e) { m.q("#mv-hist").innerHTML = '<p class="muted">' + escHTML(mensajeError(e)) + "</p>"; }
}
window.abrirFormProducto = abrirFormProducto; window.eliminarProducto = eliminarProducto; window.abrirMovimiento = abrirMovimiento; window.verMovsProducto = verMovsProducto;
document.addEventListener("DOMContentLoaded", initStock);

/* =====================================================================
 * form-factura.js — Facturacion, cobros y caja (compartido)
 * ---------------------------------------------------------------------
 * IVA PARAGUAY: los precios se cargan CON IVA INCLUIDO y cada item tiene
 * su tasa (10%, 5% o exenta). Liquidacion: IVA10 = total10/11,
 * IVA5 = total5/21.
 * Al emitir (en UNA transaccion): numero correlativo atomico, descuento
 * de stock de productos, pago inicial en la caja abierta y marca de
 * "cobrado" en la consulta/cirugia de origen.
 * ===================================================================== */

const IVA_OPCIONES = [{ value: "10", texto: "10%" }, { value: "5", texto: "5%" }, { value: "0", texto: "Exenta" }];

function calcularTotalesFactura(items) {
  const t = { gravada10: 0, gravada5: 0, exenta: 0, iva10: 0, iva5: 0, total: 0 };
  items.forEach(function (it) {
    const tot = Math.round((Number(it.cantidad) || 0) * (Number(it.precio) || 0) * (1 - (Number(it.descuento) || 0) / 100));
    it.total = tot;
    const iva = Number(it.iva);
    if (iva === 10) t.gravada10 += tot; else if (iva === 5) t.gravada5 += tot; else t.exenta += tot;
    t.total += tot;
  });
  t.iva10 = Math.round(t.gravada10 / 11);
  t.iva5 = Math.round(t.gravada5 / 21);
  return t;
}
function formatoNumeroFactura(n) {
  const c = cfg();
  if (c.establecimiento && c.puntoExpedicion) return String(c.establecimiento).padStart(3, "0") + "-" + String(c.puntoExpedicion).padStart(3, "0") + "-" + String(n).padStart(7, "0");
  return "FAC-" + String(n).padStart(4, "0");
}
function saldoFactura(f) {
  if (f.estado === "anulada") return 0;
  if (f.saldo != null) return Number(f.saldo) || 0;
  return f.estado === "pendiente" ? Number(f.total) || 0 : 0;
}
function estadoPorSaldo(total, pagado) {
  if (pagado <= 0) return total > 0 ? "pendiente" : "pagada";
  return pagado >= total ? "pagada" : "parcial";
}

/* Movimiento de caja dentro de una transaccion. */
function _movCajaTx(tx, caja, datos) {
  const u = window.MASCOTITA.usuario;
  tx.set(db.collection("caja_movimientos").doc(), Object.assign({ cajaId: caja.id, usuario: u.nombre, usuarioUid: u.uid, fecha: FS.serverTimestamp() }, datos));
  const up = {}; up["totales." + (datos.metodo || "efectivo")] = FS.increment(datos.tipo === "egreso" ? -datos.monto : datos.monto);
  up[datos.tipo === "egreso" ? "totalEgresos" : "totalIngresos"] = FS.increment(datos.monto);
  tx.update(db.collection("cajas").doc(caja.id), up);
}

/* ---------- Abrir caja ---------- */
function abrirCajaModal(onDone) {
  if (!puede("caja")) { toast("No tenés permiso para abrir la caja.", "warn"); return; }
  modalForm("Abrir caja",
    '<p class="lead" style="margin:0 0 12px">Contá el efectivo con el que empieza el turno.</p>' +
    campo("cini", "Monto inicial en efectivo (Gs)", "", "number", { min: 0, req: true }) + areaCampo("cnota", "Nota", ""), {
      ancho: "modal-sm", textoGuardar: "Abrir caja", icono: "fa-lock-open",
      onGuardar: async function () {
        requiereConexion("Abrir la caja");
        const ya = await Caja.obtener();
        if (ya) throw errorUsuario("Ya hay una caja abierta por " + ya.abiertaPor + ".");
        const u = window.MASCOTITA.usuario;
        const ref = db.collection("cajas").doc();
        await ref.set({ estado: "abierta", fechaApertura: FS.serverTimestamp(), montoInicial: num("cini"), abiertaPor: u.nombre, abiertaPorUid: u.uid, nota: val("cnota"), totales: {}, totalIngresos: 0, totalEgresos: 0 });
        registrarAuditoria("crear", "caja", "Abrió caja con " + fmtMoneda(num("cini")));
        toast("Caja abierta.", "ok");
        Caja.actual = { id: ref.id, estado: "abierta" };
        if (onDone) onDone();
      }
    });
}

/* =====================================================================
 * NUEVA FACTURA
 * op: { consultaId, cirugiaId, propietarioId, mascotaId, items }
 * ===================================================================== */
async function abrirFormFactura(op) {
  op = op || {};
  if (!puede("facturar")) { toast("No tenés permiso para facturar.", "warn"); return; }
  Datos.suscribir("propietarios"); Datos.suscribir("mascotas"); Datos.suscribir("productos"); Datos.suscribir("servicios");
  await Promise.all([Datos.listo("propietarios"), Datos.listo("mascotas"), Datos.listo("productos"), Datos.listo("servicios")]);
  const c = await cargarConfig();
  const ivaServ = String(c.ivaServicios != null ? c.ivaServicios : 10);
  let items = (op.items || []).slice();
  let origen = null;
  if (op.consultaId) {
    const s = await db.collection("consultas").doc(op.consultaId).get();
    if (s.exists) {
      origen = Object.assign({ id: s.id, col: "consultas" }, s.data());
      if (origen.facturaId) { toast("Esta consulta ya fue facturada.", "warn"); return; }
      const servs = Datos.lista("servicios").filter(function (x) { return x.activo !== false; });
      const sc = servs.find(function (x) { return x.id === c.servicioConsultaId; }) ||
        servs.find(function (x) { return /consulta/i.test(x.nombre) && /general/i.test(x.nombre); }) ||
        servs.find(function (x) { return x.categoria === "Consulta" && x.precio > 0; }) ||
        servs.find(function (x) { return /consulta/i.test(x.nombre); });
      items.push(sc ? { tipo: "servicio", refId: sc.id, concepto: sc.nombre, cantidad: 1, precio: sc.precio || 0, iva: String(sc.iva != null ? sc.iva : ivaServ), descuento: 0 }
        : { tipo: "libre", concepto: "Consulta veterinaria", cantidad: 1, precio: 0, iva: ivaServ, descuento: 0 });
      (origen.receta || []).filter(function (r) { return r.dispensar && r.productoId; }).forEach(function (r) {
        const p = Datos.porId("productos", r.productoId);
        if (p) items.push({ tipo: "producto", refId: p.id, concepto: p.nombre, cantidad: r.cantidad || 1, precio: p.precioVenta || 0, iva: String(p.iva != null ? p.iva : 10), descuento: 0, costo: p.precioCompra || 0 });
      });
    }
  }
  if (op.cirugiaId) {
    const s = await db.collection("cirugias").doc(op.cirugiaId).get();
    if (s.exists) {
      origen = Object.assign({ id: s.id, col: "cirugias" }, s.data());
      if (origen.facturaId) { toast("Esta cirugía ya fue facturada.", "warn"); return; }
      items.push({ tipo: "libre", concepto: "Cirugía: " + (origen.tipo || ""), cantidad: 1, precio: origen.costo || 0, iva: ivaServ, descuento: 0 });
    }
  }
  const propIni = op.propietarioId || (origen && origen.propietarioId) || "";
  const mascIni = op.mascotaId || (origen && origen.mascotaId) || "";

  const ov = modalForm("Nueva factura",
    '<div class="segmentado mb" id="modo-cli"><button type="button" class="activo" data-m="reg">Cliente registrado</button><button type="button" data-m="cf">Consumidor final / otro</button></div>' +
    '<div class="grid-2"><div class="form-field" id="wrap-cli"><label>Cliente <span class="req">*</span></label><div id="sel-cli"></div></div>' +
    '<div class="form-field" id="wrap-cli-txt" hidden><label for="f-fcliente">Nombre / razón social</label><input id="f-fcliente" value="Consumidor final"></div>' +
    campo("fruc", "RUC / CI", "", "text", { ph: "Opcional" }) +
    '<div class="form-field"><label>Paciente (opcional)</label><div id="sel-masc-f"></div></div>' +
    selectCampo("fcond", "Condición", [{ value: "contado", texto: "Contado" }, { value: "credito", texto: "Crédito (cuenta corriente)" }], "contado") +
    "</div>" +
    '<div class="seccion-form"><i class="fa-solid fa-list"></i> Detalle <small class="muted" style="text-transform:none;margin-left:auto">Precios con IVA incluido</small></div>' +
    '<div class="lineas" id="f-items"><div class="linea linea-fac linea-head"><span>Descripción</span><span>Cant.</span><span>Precio</span><span>IVA</span><span>Desc. %</span><span style="text-align:right">Total</span><span></span></div></div>' +
    '<div class="agregar-linea"><div id="sel-item"></div><button type="button" class="btn btn-ghost" id="f-libre"><i class="fa-solid fa-plus"></i> Ítem libre</button>' +
    (puede("stock") ? '<button type="button" class="btn btn-ghost" id="f-scan" title="Escanear código de barras"><i class="fa-solid fa-barcode"></i></button>' : "") + "</div>" +
    '<div id="scan-zona"></div>' +
    '<div class="totales" id="f-totales"></div>' +
    '<div class="caja-pago" id="f-pago"></div>' +
    areaCampo("fnotas", "Notas (aparecen en el comprobante)", ""), {
      ancho: "modal-xl", textoGuardar: "Emitir", icono: "fa-file-invoice-dollar",
      antesDeCerrar: function () { if (window._detenerScanner) window._detenerScanner(); },
      onGuardar: async function () { return await emitir(); }
    });

  let modoCli = "reg";
  const selCli = Datos.selectorDueno("sel-cli", { valor: propIni,
    onChange: function (d) { el("fruc").value = d ? (d.ruc || d.dni || "") : ""; pintarPago(); },
    nuevo: puede("pacientes") ? { texto: "Registrar cliente nuevo", fn: function (txt) { abrirFormDueno(null, { prefill: { nombre: txt }, onGuardado: function (id) { setTimeout(function () { selCli.set(id); }, 60); } }); } } : null });
  if (selCli.get()) el("fruc").value = selCli.get().ruc || selCli.get().dni || "";
  const selMasc = Datos.selectorMascota("sel-masc-f", { valor: mascIni, items: function () { const d = selCli.get(); return Datos.lista("mascotas").filter(function (m) { return !d || m.propietarioId === d.id; }); },
    onChange: function (m) { if (m && !selCli.get() && m.propietarioId) selCli.set(m.propietarioId); } });
  ov.el.querySelectorAll("#modo-cli button").forEach(function (b) {
    b.onclick = function () {
      modoCli = b.dataset.m;
      ov.el.querySelectorAll("#modo-cli button").forEach(function (x) { x.classList.toggle("activo", x === b); });
      document.getElementById("wrap-cli").hidden = modoCli !== "reg"; document.getElementById("wrap-cli-txt").hidden = modoCli === "reg";
      if (modoCli === "cf") { el("fcond").value = "contado"; el("fruc").value = ""; }
      pintarPago();
    };
  });

  /* ---- Items ---- */
  const cont = document.getElementById("f-items");
  function pintarItems() {
    cont.querySelectorAll(".linea:not(.linea-head)").forEach(function (x) { x.remove(); });
    items.forEach(function (it, i) {
      const p = it.tipo === "producto" ? Datos.porId("productos", it.refId) : null;
      const row = document.createElement("div");
      row.className = "linea linea-fac";
      row.innerHTML =
        '<div class="concepto"><input class="i-con" value="' + escHTML(it.concepto) + '"' + (it.tipo !== "libre" ? " readonly" : "") + ">" +
        (p ? "<small>Stock: " + fmtNum(p.cantidad) + "</small>" : it.tipo === "servicio" ? "<small>Servicio</small>" : "") + "</div>" +
        '<input class="i-cant" type="number" min="0" step="any" value="' + it.cantidad + '">' +
        '<input class="i-pre" type="number" min="0" step="1" value="' + it.precio + '"' + (!esAdmin() && it.tipo !== "libre" && !cfg().permitirCambiarPrecio ? " readonly title=\"Solo el administrador cambia precios del catálogo\"" : "") + ">" +
        '<select class="i-iva">' + IVA_OPCIONES.map(function (o) { return '<option value="' + o.value + '"' + (String(it.iva) === o.value ? " selected" : "") + ">" + o.texto + "</option>"; }).join("") + "</select>" +
        '<input class="i-desc" type="number" min="0" max="100" step="any" value="' + (it.descuento || 0) + '">' +
        '<div class="tot">' + fmtMoneda(0) + "</div>" +
        '<button type="button" class="btn-icono danger i-del" title="Quitar"><i class="fa-solid fa-trash"></i></button>';
      cont.appendChild(row);
      row.querySelector(".i-con").oninput = function () { it.concepto = this.value; };
      row.querySelector(".i-cant").oninput = function () { it.cantidad = Number(this.value) || 0; recalcular(); };
      row.querySelector(".i-pre").oninput = function () { it.precio = Number(this.value) || 0; recalcular(); };
      row.querySelector(".i-iva").onchange = function () { it.iva = this.value; recalcular(); };
      row.querySelector(".i-desc").oninput = function () { it.descuento = Math.min(100, Math.max(0, Number(this.value) || 0)); recalcular(); };
      row.querySelector(".i-del").onclick = function () { items.splice(i, 1); pintarItems(); };
    });
    if (!items.length) cont.insertAdjacentHTML("beforeend", '<div class="linea" style="display:block"><p class="muted" style="text-align:center;padding:8px">Agregá servicios o productos con el buscador de abajo.</p></div>');
    recalcular();
  }
  let totales = calcularTotalesFactura(items);
  function recalcular() {
    totales = calcularTotalesFactura(items);
    cont.querySelectorAll(".linea-fac:not(.linea-head) .tot").forEach(function (t, i) { t.textContent = fmtMoneda(items[i].total); });
    document.getElementById("f-totales").innerHTML =
      (totales.exenta ? "<div><span>Exentas</span><span>" + fmtMoneda(totales.exenta) + "</span></div>" : "") +
      (totales.gravada5 ? "<div><span>Gravadas 5%</span><span>" + fmtMoneda(totales.gravada5) + "</span></div><div><span>IVA 5%</span><span>" + fmtMoneda(totales.iva5) + "</span></div>" : "") +
      (totales.gravada10 ? "<div><span>Gravadas 10%</span><span>" + fmtMoneda(totales.gravada10) + "</span></div><div><span>IVA 10%</span><span>" + fmtMoneda(totales.iva10) + "</span></div>" : "") +
      '<div class="total"><span>TOTAL</span><span>' + fmtMoneda(totales.total) + "</span></div>";
    const m = el("fpago"); if (m && !m.dataset.tocado) m.value = totales.total;
    actualizarVuelto();
  }
  function agregar(it) {
    const ex = items.find(function (x) { return x.tipo !== "libre" && x.tipo === it.tipo && x.refId === it.refId; });
    if (ex) ex.cantidad = (Number(ex.cantidad) || 0) + 1; else items.push(it);
    pintarItems();
  }
  function itemDeProducto(p) { return { tipo: "producto", refId: p.id, concepto: p.nombre, cantidad: 1, precio: p.precioVenta || 0, iva: String(p.iva != null ? p.iva : 10), descuento: 0, costo: p.precioCompra || 0 }; }
  const selItem = selector("sel-item", {
    items: function () {
      return Datos.lista("servicios").filter(function (s) { return s.activo !== false; }).map(function (s) { return Object.assign({ _t: "servicio" }, s); })
        .concat(Datos.lista("productos").map(function (p) { return Object.assign({ _t: "producto" }, p); }));
    },
    texto: function (x) { return x.nombre; },
    sub: function (x) { return (x._t === "servicio" ? "Servicio" : "Producto · stock " + fmtNum(x.cantidad)) + " · " + fmtMoneda(x._t === "servicio" ? x.precio : x.precioVenta); },
    buscar: function (x) { return x.nombre + " " + (x.categoria || "") + " " + (x.codigoBarras || ""); },
    icono: function (x) { return '<i class="fa-solid ' + (x._t === "servicio" ? "fa-tag" : "fa-box") + '" style="width:18px;color:var(--texto-suave)"></i>'; },
    placeholder: "Agregar servicio o producto (nombre o código)...",
    onChange: function (x) {
      if (!x) return;
      if (x._t === "servicio") agregar({ tipo: "servicio", refId: x.id, concepto: x.nombre, cantidad: 1, precio: x.precio || 0, iva: String(x.iva != null ? x.iva : ivaServ), descuento: 0 });
      else agregar(itemDeProducto(x));
      setTimeout(function () { selItem.set(null); selItem.input.focus(); }, 0);
    }
  });
  // Lector de codigo de barras USB: escribe el codigo + Enter en el buscador.
  selItem.input.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    const cod = selItem.input.value.trim(); if (!cod) return;
    const p = Datos.lista("productos").find(function (x) { return x.codigoBarras && x.codigoBarras === cod; });
    if (p) { e.preventDefault(); e.stopPropagation(); agregar(itemDeProducto(p)); selItem.input.value = ""; }
  }, true);
  document.getElementById("f-libre").onclick = function () { items.push({ tipo: "libre", concepto: "", cantidad: 1, precio: 0, iva: ivaServ, descuento: 0 }); pintarItems(); const l = cont.querySelectorAll(".i-con"); l[l.length - 1].focus(); };
  const bs = document.getElementById("f-scan");
  if (bs) bs.onclick = function () {
    abrirEscaner("scan-zona", function (cod) {
      const p = Datos.lista("productos").find(function (x) { return x.codigoBarras === cod; });
      if (p) { agregar(itemDeProducto(p)); toast("Agregado: " + p.nombre, "ok"); } else toast("No hay producto con el código " + cod, "warn");
    });
  };

  /* ---- Pago ---- */
  function pintarPago() {
    const cred = val("fcond") === "credito";
    const caja = Caja.actual;
    document.getElementById("f-pago").innerHTML =
      '<div class="fila-flex" style="margin-bottom:8px"><b><i class="fa-solid fa-money-bill-wave"></i> Pago ' + (cred ? "inicial (opcional)" : "") + "</b><span class=\"espaciador\"></span>" +
      (caja ? pill("Caja abierta", "ok") : pill("Caja cerrada", "danger")) + "</div>" +
      (!caja ? '<div class="alerta alerta-warn" style="margin:0"><i class="fa-solid fa-cash-register"></i> Para registrar cobros tiene que haber una caja abierta.' +
        (puede("caja") ? '<button type="button" class="btn btn-sm btn-primary" id="f-abrir-caja">Abrir caja</button>' : "") + "</div>" : "") +
      '<div class="grid-4"' + (!caja ? " hidden" : "") + ">" +
      selectCampo("fmetodo", "Medio de pago", METODOS_PAGO, "efectivo") +
      campo("fpago", "Monto cobrado", cred ? 0 : totales.total, "number", { min: 0 }) +
      campo("frecibido", "Recibido (efectivo)", "", "number", { min: 0, ph: "Para calcular vuelto" }) +
      '<div class="form-field"><label>Vuelto</label><input id="f-vuelto" readonly value="Gs 0"></div></div>';
    const ac = document.getElementById("f-abrir-caja"); if (ac) ac.onclick = function () { abrirCajaModal(function () { Caja.obtener().then(pintarPago); }); };
    const mp = el("fpago"); if (mp) { mp.oninput = function () { mp.dataset.tocado = "1"; actualizarVuelto(); }; if (cred) mp.dataset.tocado = "1"; }
    const rc = el("frecibido"); if (rc) rc.oninput = actualizarVuelto;
    const mt = el("fmetodo"); if (mt) mt.onchange = function () { document.getElementById("f-frecibido") && (el("frecibido").closest(".form-field").hidden = mt.value !== "efectivo"); actualizarVuelto(); };
  }
  function actualizarVuelto() {
    const v = document.getElementById("f-vuelto"); if (!v) return;
    const rec = num("frecibido"), pago = num("fpago");
    v.value = rec ? fmtMoneda(Math.max(0, rec - pago)) : "Gs 0";
  }
  el("fcond").onchange = pintarPago;
  await Caja.obtener().catch(function () {});
  pintarPago();
  pintarItems();

  /* ---- Emitir ---- */
  async function emitir() {
    requiereConexion("Emitir una factura");
    const its = items.filter(function (it) { return (Number(it.cantidad) || 0) > 0 && String(it.concepto || "").trim(); });
    if (!its.length) throw errorUsuario("Agregá al menos un ítem con cantidad y descripción.");
    const cli = modoCli === "reg" ? selCli.get() : null;
    if (modoCli === "reg" && !cli) throw errorUsuario("Elegí el cliente o usá \"Consumidor final\".");
    const cond = val("fcond");
    if (cond === "credito" && !cli) throw errorUsuario("La venta a crédito necesita un cliente registrado.");
    const sinPrecio = its.filter(function (i) { return !(Number(i.precio) > 0); });
    if (sinPrecio.length && !(await confirmar("Hay ítems sin precio: " + sinPrecio.map(function (i) { return i.concepto; }).join(", ") + ". ¿Emitir igual?", { peligro: false }))) return false;
    const t = calcularTotalesFactura(its);
    if (t.total <= 0 && !(await confirmar("El total es Gs 0. ¿Emitir igual?", { peligro: false }))) return false;
    const caja = Caja.actual;
    const pago = caja ? Math.min(num("fpago"), t.total) : 0;
    if (cond === "contado" && pago < t.total) {
      if (!caja) throw errorUsuario("Para una venta al contado tiene que haber una caja abierta (o elegí Crédito).");
      if (!(await confirmar("El monto cobrado (" + fmtMoneda(pago) + ") es menor al total. La diferencia queda como saldo pendiente. ¿Continuar?", { peligro: false }))) return false;
    }
    const metodo = val("fmetodo") || "efectivo";
    const m = selMasc.get();
    const u = window.MASCOTITA.usuario;
    const cfgAct = cfg();
    const facRef = db.collection("facturas").doc();
    let numero = "";
    await db.runTransaction(async function (tx) {
      const ctrRef = db.collection("config").doc("contadores");
      const ctr = await tx.get(ctrRef);
      const inv = await Inventario.leer(tx, its.filter(function (i) { return i.tipo === "producto"; }).map(function (i) { return i.refId; }));
      let cajaSnap = null;
      if (pago > 0) { cajaSnap = await tx.get(db.collection("cajas").doc(caja.id)); if (!cajaSnap.exists || cajaSnap.data().estado !== "abierta") throw errorUsuario("La caja se cerró. Abrí una nueva para cobrar."); }
      let ult = ctr.exists ? Number(ctr.data().factura) || 0 : 0;
      if (!ctr.exists) {
        const q = await db.collection("facturas").orderBy("numeroInt", "desc").limit(1).get().catch(function () { return { empty: true }; });
        if (!q.empty) ult = Number(q.docs[0].data().numeroInt) || 0;
        else {
          const q2 = await db.collection("facturas").orderBy("numero", "desc").limit(1).get();
          if (!q2.empty) ult = parseInt(String(q2.docs[0].data().numero || "").replace(/\D/g, ""), 10) || 0;
        }
      }
      const n = ult + 1; numero = formatoNumeroFactura(n);
      // Stock
      Inventario.mover(tx, inv, its.filter(function (i) { return i.tipo === "producto"; }).map(function (i) { return { productoId: i.refId, delta: -Number(i.cantidad), motivo: "Venta " + numero }; }),
        { origen: "factura", refId: facRef.id, permitirNegativo: !!cfgAct.permitirStockNegativo });
      const pagos = pago > 0 ? [{ fecha: TS.now(), monto: pago, metodo: metodo, usuario: u.nombre, cajaId: caja.id }] : [];
      tx.set(facRef, Object.assign({
        numero: numero, numeroInt: n, fecha: FS.serverTimestamp(),
        propietarioId: cli ? cli.id : "", cliente: cli ? cli.nombre : (val("fcliente") || "Consumidor final"), clienteRuc: val("fruc"),
        clienteTelefono: cli ? cli.telefono || "" : "", mascotaId: m ? m.id : "", mascota: m ? m.nombre : "",
        condicion: cond, items: its.map(function (i) { return { tipo: i.tipo, refId: i.refId || "", concepto: i.concepto, cantidad: Number(i.cantidad), precio: Number(i.precio), iva: Number(i.iva), descuento: Number(i.descuento) || 0, total: i.total, costo: Number(i.costo) || 0 }; }),
        pagos: pagos, pagado: pago, saldo: t.total - pago, estado: estadoPorSaldo(t.total, pago),
        consultaId: origen && origen.col === "consultas" ? origen.id : "", cirugiaId: origen && origen.col === "cirugias" ? origen.id : "",
        timbrado: cfgAct.timbrado || "", timbradoVigencia: cfgAct.timbradoVigencia || "", notas: val("fnotas"),
        creadoPor: u.nombre, creadoPorUid: u.uid
      }, t));
      if (pago > 0) _movCajaTx(tx, caja, { tipo: "ingreso", monto: pago, metodo: metodo, concepto: "Cobro " + numero + " · " + (cli ? cli.nombre : "Consumidor final"), facturaId: facRef.id });
      if (origen) tx.update(db.collection(origen.col).doc(origen.id), { porCobrar: false, facturaId: facRef.id });
      tx.set(ctrRef, { factura: n }, { merge: true });
    });
    registrarAuditoria("crear", "facturas", "Emitió " + numero + " por " + fmtMoneda(t.total) + (pago ? " (cobró " + fmtMoneda(pago) + ")" : ""));
    const vuelto = num("frecibido") ? Math.max(0, num("frecibido") - pago) : 0;
    toast("Factura " + numero + " emitida." + (vuelto ? " Vuelto: " + fmtMoneda(vuelto) : ""), "ok", 8000, { texto: "PDF", fn: function () { pdfFacturaPorId(facRef.id); } });
    if (op.onGuardado) op.onGuardado(facRef.id);
  }
  return ov;
}

async function obtenerFactura(id) { const s = await db.collection("facturas").doc(id).get(); return s.exists ? Object.assign({ id: s.id }, s.data()) : null; }
async function pdfFacturaPorId(id) { const f = await obtenerFactura(id); if (f) generarPDF(function () { return pdfFactura(f); }); }

/* =====================================================================
 * REGISTRAR PAGO (pagos parciales / cuenta corriente)
 * ===================================================================== */
async function abrirCobro(facturaId, onDone) {
  const f = await obtenerFactura(facturaId);
  if (!f) return;
  const saldo = saldoFactura(f);
  if (saldo <= 0) { toast("Esta factura no tiene saldo pendiente.", "info"); return; }
  await Caja.obtener().catch(function () {});
  const caja = Caja.actual;
  const ov = modalForm("Cobrar " + f.numero,
    '<div class="chips"><div class="chip-resumen"><small>Cliente</small><b>' + escHTML(f.cliente) + '</b></div><div class="chip-resumen"><small>Total</small><b>' + fmtMoneda(f.total) +
    '</b></div><div class="chip-resumen"><small>Saldo</small><b class="texto-danger">' + fmtMoneda(saldo) + "</b></div></div>" +
    (!caja ? '<div class="alerta alerta-warn"><i class="fa-solid fa-cash-register"></i> No hay caja abierta.' + (puede("caja") ? ' <button type="button" class="btn btn-sm btn-primary" id="c-abrir">Abrir caja</button>' : "") + "</div>" : "") +
    '<div class="grid-2">' + selectCampo("cmetodo", "Medio de pago", METODOS_PAGO, "efectivo") + campo("cmonto", "Monto", saldo, "number", { min: 1, max: saldo, req: true }) +
    campo("crec", "Recibido (efectivo)", "", "number", { min: 0 }) + '<div class="form-field"><label>Vuelto</label><input id="f-cvuelto" readonly value="Gs 0"></div></div>', {
      ancho: "modal-sm", textoGuardar: "Registrar pago", icono: "fa-hand-holding-dollar",
      onGuardar: async function () {
        requiereConexion("Registrar un pago");
        const cj = Caja.actual; if (!cj) throw errorUsuario("Abrí la caja para registrar el cobro.");
        const monto = Math.round(num("cmonto"));
        if (monto <= 0) throw errorUsuario("Monto inválido.");
        const metodo = val("cmetodo");
        const u = window.MASCOTITA.usuario;
        const ref = db.collection("facturas").doc(facturaId);
        let nuevo;
        await db.runTransaction(async function (tx) {
          const s = await tx.get(ref);
          const fx = s.data();
          const cs = await tx.get(db.collection("cajas").doc(cj.id));
          if (!cs.exists || cs.data().estado !== "abierta") throw errorUsuario("La caja se cerró.");
          const sal = saldoFactura(fx);
          if (monto > sal) throw errorUsuario("El monto supera el saldo (" + fmtMoneda(sal) + ").");
          const pagado = (Number(fx.pagado) || (fx.estado === "pagada" ? fx.total : 0)) + monto;
          nuevo = estadoPorSaldo(fx.total, pagado);
          tx.update(ref, { pagos: (fx.pagos || []).concat([{ fecha: TS.now(), monto: monto, metodo: metodo, usuario: u.nombre, cajaId: cj.id }]), pagado: pagado, saldo: Math.max(0, fx.total - pagado), estado: nuevo });
          _movCajaTx(tx, cj, { tipo: "ingreso", monto: monto, metodo: metodo, concepto: "Cobro " + fx.numero + " · " + fx.cliente, facturaId: facturaId });
        });
        registrarAuditoria("cobrar", "facturas", "Cobró " + fmtMoneda(monto) + " de " + f.numero + " (" + nombreMetodo(metodo) + ")");
        const vuelto = num("crec") ? Math.max(0, num("crec") - monto) : 0;
        toast("Pago registrado." + (vuelto ? " Vuelto: " + fmtMoneda(vuelto) : ""), "ok", 6000);
        if (onDone) onDone();
      }
    });
  const upd = function () { const r = num("crec"); document.getElementById("f-cvuelto").value = r ? fmtMoneda(Math.max(0, r - num("cmonto"))) : "Gs 0"; };
  el("crec").oninput = upd; el("cmonto").oninput = upd;
  const ab = document.getElementById("c-abrir"); if (ab) ab.onclick = function () { ov.cerrar(); abrirCajaModal(function () { abrirCobro(facturaId, onDone); }); };
}

/* =====================================================================
 * ANULAR (solo ADMIN): repone stock y, si se cobro, registra devolucion
 * ===================================================================== */
async function anularFactura(facturaId, onDone) {
  if (!esAdmin()) { toast("Solo el administrador puede anular.", "warn"); return; }
  const f = await obtenerFactura(facturaId);
  if (!f || f.estado === "anulada") return;
  await Caja.obtener().catch(function () {});
  const pagado = Number(f.pagado) || (f.estado === "pagada" ? Number(f.total) : 0);
  modalForm("Anular " + f.numero,
    '<div class="alerta alerta-danger"><i class="fa-solid fa-triangle-exclamation"></i> La factura queda registrada como ANULADA (no se borra). Los productos vuelven al stock.</div>' +
    areaCampo("amotivo", "Motivo de la anulación", "", { req: true }) +
    (pagado > 0 ? checkCampo("adev", "Registrar la devolución de " + fmtMoneda(pagado) + " como egreso de la caja abierta (por el mismo medio de pago)", !!Caja.actual) : ""), {
      ancho: "modal-sm", textoGuardar: "Anular factura", icono: "fa-ban",
      onGuardar: async function () {
        requiereConexion("Anular una factura");
        const dev = pagado > 0 && chk("adev");
        if (dev && !Caja.actual) throw errorUsuario("No hay caja abierta para registrar la devolución.");
        const u = window.MASCOTITA.usuario;
        await db.runTransaction(async function (tx) {
          const ref = db.collection("facturas").doc(facturaId);
          const s = await tx.get(ref); const fx = s.data();
          if (fx.estado === "anulada") throw errorUsuario("Ya estaba anulada.");
          const prods = (fx.items || []).filter(function (i) { return i.tipo === "producto" && i.refId; });
          const inv = await Inventario.leer(tx, prods.map(function (i) { return i.refId; }));
          Inventario.mover(tx, inv, prods.filter(function (i) { return inv[i.refId]; }).map(function (i) { return { productoId: i.refId, delta: Number(i.cantidad), motivo: "Anulación " + fx.numero }; }), { origen: "anulacion", refId: facturaId, permitirNegativo: true });
          tx.update(ref, { estado: "anulada", saldo: 0, motivoAnulacion: val("amotivo"), anuladaPor: u.nombre, anuladaEn: FS.serverTimestamp() });
          if (dev) {
            // Devolver por el mismo medio con que se cobro (efectivo, transferencia...).
            const porMetodo = {};
            (fx.pagos || []).forEach(function (p) { porMetodo[p.metodo || "efectivo"] = (porMetodo[p.metodo || "efectivo"] || 0) + (Number(p.monto) || 0); });
            if (!Object.keys(porMetodo).length) porMetodo.efectivo = pagado;
            Object.keys(porMetodo).forEach(function (m) {
              if (porMetodo[m] > 0) _movCajaTx(tx, Caja.actual, { tipo: "egreso", monto: porMetodo[m], metodo: m, concepto: "Devolución por anulación " + fx.numero, facturaId: facturaId });
            });
          }
          if (fx.consultaId) tx.update(db.collection("consultas").doc(fx.consultaId), { porCobrar: true, facturaId: "" });
          if (fx.cirugiaId) tx.update(db.collection("cirugias").doc(fx.cirugiaId), { porCobrar: true, facturaId: "" });
        });
        registrarAuditoria("anular", "facturas", "Anuló " + f.numero + ": " + val("amotivo"));
        toast("Factura anulada.", "ok");
        if (onDone) onDone();
      }
    });
}

/* =====================================================================
 * Escaner de codigo de barras con la camara (carga diferida)
 * ===================================================================== */
let _scanner = null;
async function abrirEscaner(contId, onCodigo) {
  if (_scanner) { detenerScanner(); return; }
  const zona = document.getElementById(contId);
  zona.innerHTML = '<div id="reader" class="reader-box"></div><p class="hint" style="text-align:center">Apuntá la cámara al código de barras. <button type="button" class="btn btn-ghost btn-sm" id="scan-stop">Cerrar cámara</button></p>';
  document.getElementById("scan-stop").onclick = detenerScanner;
  try {
    await cargarLib("scanner");
    _scanner = new Html5Qrcode("reader");
    await _scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 260, height: 140 } }, function (txt) { detenerScanner(); onCodigo(txt); }, function () {});
  } catch (e) { console.error(e); toast("No se pudo abrir la cámara.", "error"); detenerScanner(); }
}
function detenerScanner() {
  if (_scanner) { const s = _scanner; _scanner = null; s.stop().then(function () { s.clear(); }).catch(function () {}); }
  const r = document.getElementById("reader"); if (r && r.parentElement) r.parentElement.innerHTML = "";
}
window._detenerScanner = detenerScanner;
// Apagar la camara siempre que se cierre cualquier modal (Esc, fondo o X).
document.addEventListener("keydown", function (e) { if (e.key === "Escape") detenerScanner(); });

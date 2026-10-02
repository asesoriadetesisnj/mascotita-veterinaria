/* =====================================================================
 * configuracion.js (solo ADMIN)
 * Datos de la clinica, facturacion (timbrado / numeracion / IVA),
 * agenda, plantillas de WhatsApp, avisos por email, consentimiento,
 * mantenimiento (estadisticas) y respaldo completo en JSON.
 * ===================================================================== */
const COLS_RESPALDO = ["users", "propietarios", "mascotas", "consultas", "vacunas", "cirugias", "citas", "productos", "movimientos_stock", "servicios", "proveedores", "compras", "facturas", "cajas", "caja_movimientos", "config", "plantillas_whatsapp", "estadisticas"];
const PLANTILLAS_INFO = [["recordatorio_cita", "Recordatorio de cita", "{nombre} {mascota} {fecha} {hora} {clinica}"], ["vacuna", "Vacuna por vencer", "{nombre} {mascota} {vacuna} {fecha} {clinica}"],
  ["control", "Control", "{nombre} {mascota} {fecha} {clinica}"], ["saldo", "Saldo pendiente", "{nombre} {monto} {clinica}"], ["factura", "Envío de comprobante", "{nombre} {numero} {monto} {clinica}"], ["alta", "Alta post-operatoria", "{nombre} {mascota} {indicaciones} {clinica}"]];

async function initConfig() {
  await protegerPagina({ permiso: "admin", pagina: "configuracion.html" });
  const c = await cargarConfig(true);
  Datos.suscribir("servicios");
  await Datos.listo("servicios");
  const wa = {};
  try { (await db.collection("plantillas_whatsapp").get()).forEach(function (d) { wa[d.id] = d.data().texto; }); } catch (e) {}
  const servs = Datos.lista("servicios").map(function (s) { return { value: s.id, texto: s.nombre + " (" + fmtMoneda(s.precio) + ")" }; });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-gear"></i> Configuración</h1><button class="btn btn-primary" id="cf-guardar"><i class="fa-solid fa-floppy-disk"></i> Guardar cambios</button></div>' +
    '<div class="grid-cards" style="grid-template-columns:repeat(auto-fit,minmax(min(380px,100%),1fr))">' +
    '<div class="card"><h3><i class="fa-solid fa-hospital"></i> Datos de la clínica <small class="muted">(aparecen en los PDF y mensajes)</small></h3><div class="grid-2">' +
    campo("cnombre", "Nombre", c.clinicaNombre || "Mascotita") + campo("cruc", "RUC", c.clinicaRuc) + campo("ctel", "Teléfono / WhatsApp", c.clinicaTelefono) +
    campo("cemail", "Email", c.clinicaEmail) + campo("cdir", "Dirección", c.clinicaDireccion, "text", { full: true }) + "</div></div>" +
    '<div class="card"><h3><i class="fa-solid fa-file-invoice-dollar"></i> Facturación</h3><div class="grid-2">' +
    campo("ctimb", "N° de timbrado (opcional)", c.timbrado, "text", { ayuda: "Si lo completás, el PDF sale como \"Factura\"; si no, como comprobante interno." }) +
    campo("ctimbv", "Vigencia del timbrado", c.timbradoVigencia, "text", { ph: "01/01/2026 al 31/12/2026" }) +
    campo("cest", "Establecimiento", c.establecimiento, "text", { ph: "001", ayuda: "Con establecimiento y punto: 001-001-0000123" }) + campo("cpto", "Punto de expedición", c.puntoExpedicion, "text", { ph: "001" }) +
    selectCampo("civa", "IVA por defecto en servicios", IVA_OPCIONES, String(c.ivaServicios != null ? c.ivaServicios : 10)) +
    selectCampo("cserv", "Servicio que se cobra al facturar una consulta", servs, c.servicioConsultaId, { vacio: servs.length ? "Buscar uno que diga \"consulta\"" : "Cargá el catálogo primero" }) +
    '<div class="form-field full">' + checkCampo("cneg", "Permitir vender productos sin stock suficiente", c.permitirStockNegativo) + "<br>" + checkCampo("cprecio", "Recepción puede modificar precios al facturar", c.permitirCambiarPrecio) + "</div></div></div>" +
    '<div class="card"><h3><i class="fa-solid fa-calendar-days"></i> Agenda</h3><div class="grid-3">' +
    campo("ainicio", "Abre", c.agendaInicio || "07:00", "time") + campo("afin", "Cierra", c.agendaFin || "20:00", "time") +
    selectCampo("aint", "Turnos cada", [{ value: "15", texto: "15 min" }, { value: "20", texto: "20 min" }, { value: "30", texto: "30 min" }, { value: "60", texto: "60 min" }], String(c.agendaIntervalo || 30)) + "</div></div>" +
    '<div class="card"><h3><i class="fa-solid fa-envelope"></i> Aviso de stock bajo por email (EmailJS)</h3>' +
    campo("cemails", "Destinatarios (separados por coma)", c.emailsNotificacion, "text", { ph: "admin@correo.com, encargado@correo.com" }) +
    areaCampo("cplant", "Plantilla (variables: {producto} {cantidad} {minimo})", c.plantillaStockBajo || "ALERTA: el producto {producto} tiene stock bajo. Cantidad actual: {cantidad} (mínimo: {minimo}).") +
    '<small class="hint">Requiere completar las claves de EmailJS en js/firebase-config.js. Se envía como máximo un aviso por producto por día.</small></div>' +
    '<div class="card" style="grid-column:1/-1"><h3><i class="fa-brands fa-whatsapp"></i> Plantillas de WhatsApp</h3><div class="grid-2">' +
    PLANTILLAS_INFO.map(function (p) { return areaCampo("wa_" + p[0], p[1], wa[p[0]] || PLANTILLAS_WA_DEF[p[0]], { full: false, filas: 3, ayuda: "Variables: " + p[2] }); }).join("") + "</div></div>" +
    '<div class="card" style="grid-column:1/-1"><h3><i class="fa-solid fa-file-signature"></i> Texto del consentimiento informado (cirugías)</h3>' +
    areaCampo("ccons", "Variables: {dueno} {mascota} {clinica} {procedimiento}", c.textoConsentimiento || "", { filas: 5, ph: "Vacío = texto estándar" }) + "</div>" +
    '<div class="card"><h3><i class="fa-solid fa-database"></i> Respaldo</h3><p class="muted">Descarga TODOS los datos en un archivo JSON. Guardalo en un lugar seguro (contiene datos personales).</p>' +
    '<button class="btn btn-ghost mt" id="cf-backup"><i class="fa-solid fa-download"></i> Descargar respaldo completo</button><p class="hint" id="cf-ult">' + (c.ultimoRespaldo ? "Último respaldo: " + fmtFecha(c.ultimoRespaldo) : "Nunca se hizo un respaldo desde la app.") + "</p></div>" +
    '<div class="card"><h3><i class="fa-solid fa-screwdriver-wrench"></i> Mantenimiento</h3><p class="muted">Si los contadores del panel no coinciden, recalculalos (lee todas las colecciones una vez).</p>' +
    '<button class="btn btn-ghost mt" id="cf-stats"><i class="fa-solid fa-calculator"></i> Recalcular estadísticas</button></div>' +
    "</div>";
  document.getElementById("cf-guardar").onclick = function () { conBoton(this, guardarConfig); };
  document.getElementById("cf-backup").onclick = function () { this.dataset.cargando = "Descargando..."; conBoton(this, respaldo); };
  document.getElementById("cf-stats").onclick = function () { conBoton(this, async function () { requiereConexion("Recalcular"); const r = await Datos.recalcularStats(); toast("Listo: " + r.mascotas + " mascotas, " + r.consultas + " consultas.", "ok"); }); };
}
async function guardarConfig() {
  requiereConexion("Guardar la configuración");
  const iva = Number(val("civa"));
  await db.collection("config").doc("general").set({
    clinicaNombre: val("cnombre") || "Mascotita", clinicaRuc: val("cruc"), clinicaTelefono: val("ctel"), clinicaEmail: val("cemail"), clinicaDireccion: val("cdir"),
    timbrado: val("ctimb"), timbradoVigencia: val("ctimbv"), establecimiento: val("cest").replace(/\D/g, ""), puntoExpedicion: val("cpto").replace(/\D/g, ""),
    ivaServicios: iva, iva: iva, servicioConsultaId: val("cserv"), permitirStockNegativo: chk("cneg"), permitirCambiarPrecio: chk("cprecio"),
    agendaInicio: val("ainicio") || "07:00", agendaFin: val("afin") || "20:00", agendaIntervalo: Number(val("aint")) || 30,
    emailsNotificacion: val("cemails"), plantillaStockBajo: val("cplant"), textoConsentimiento: val("ccons")
  }, { merge: true });
  const b = db.batch();
  PLANTILLAS_INFO.forEach(function (p) { b.set(db.collection("plantillas_whatsapp").doc(p[0]), { texto: val("wa_" + p[0]) || PLANTILLAS_WA_DEF[p[0]] }); });
  await b.commit();
  await cargarConfig(true);
  registrarAuditoria("editar", "configuracion", "Actualizó la configuración general");
  toast("Configuración guardada.", "ok");
}
async function respaldo() {
  requiereConexion("Descargar el respaldo");
  const out = { app: "Mascotita", version: 3, fecha: new Date().toISOString(), colecciones: {} };
  for (const c of COLS_RESPALDO) {
    const s = await db.collection(c).get();
    out.colecciones[c] = {};
    s.forEach(function (d) {
      out.colecciones[c][d.id] = JSON.parse(JSON.stringify(d.data(), function (k, v) { return v && typeof v === "object" && v.seconds != null && v.nanoseconds != null ? { _ts: new Date(v.seconds * 1000).toISOString() } : v; }));
    });
  }
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mascotita_respaldo_" + hoyISO() + ".json"; a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  await db.collection("config").doc("general").set({ ultimoRespaldo: FS.serverTimestamp() }, { merge: true });
  document.getElementById("cf-ult").textContent = "Último respaldo: " + fmtFecha(new Date());
  registrarAuditoria("exportar", "sistema", "Descargó un respaldo completo");
  toast("Respaldo descargado.", "ok");
}
document.addEventListener("DOMContentLoaded", initConfig);

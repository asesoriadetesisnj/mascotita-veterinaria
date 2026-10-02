/* =====================================================================
 * consultas.js
 * ---------------------------------------------------------------------
 * Modulo de consultas veterinarias:
 *  - Registro de propietarios y mascotas (con foto en Firebase Storage).
 *  - Compresion de imagen en el navegador antes de subir.
 *  - Fichas de consulta e historial clinico (timeline) por mascota.
 *  - Recordatorio por WhatsApp y receta/ficha en PDF.
 * ===================================================================== */

let _mascotas = [], _propietarios = [], _consultas = [];

async function initConsultas() {
  await protegerPagina({ pagina: "consultas.html" });
  cargarConfig();
  pintarEstructuraConsultas();
  const q0 = paramQ(); if (q0) document.getElementById("c-buscar").value = q0;
  await cargarDatosConsultas();
}

function pintarEstructuraConsultas() {
  document.getElementById("content").innerHTML =
    '<div class="page-head">' +
    '  <h1><i class="fa-solid fa-stethoscope"></i> Consultas</h1>' +
    '  <div class="head-actions">' +
    '    <button class="btn btn-ghost" id="c-nuevo-dueno"><i class="fa-solid fa-user-plus"></i> Dueno</button>' +
    '    <button class="btn btn-ghost" id="c-nueva-mascota"><i class="fa-solid fa-paw"></i> Mascota</button>' +
    '    <button class="btn btn-primary" id="c-nueva-consulta"><i class="fa-solid fa-plus"></i> Consulta</button>' +
    '  </div>' +
    '</div>' +
    '<div class="filtros"><input type="text" id="c-buscar" placeholder="Buscar mascota, dueno, especie o telefono..."></div>' +
    '<div class="tabs"><button class="tab activo" data-tab="mascotas">Mascotas</button>' +
    '<button class="tab" data-tab="consultas">Consultas</button></div>' +
    '<div id="c-contenido"></div>';
  document.getElementById("c-nuevo-dueno").onclick = function () { abrirFormDueno(null); };
  document.getElementById("c-nueva-mascota").onclick = function () { abrirFormMascota(null); };
  document.getElementById("c-nueva-consulta").onclick = function () { abrirFormConsulta(null); };
  document.getElementById("c-buscar").oninput = debounce(function () {
    document.querySelector(".tab.activo").dataset.tab === "mascotas" ? pintarMascotas() : pintarConsultas();
  }, 250);
  document.querySelectorAll(".tab").forEach(function (t) {
    t.onclick = function () {
      document.querySelectorAll(".tab").forEach(function (x) { x.classList.remove("activo"); });
      t.classList.add("activo");
      t.dataset.tab === "mascotas" ? pintarMascotas() : pintarConsultas();
    };
  });
}

async function cargarDatosConsultas() {
  mostrarLoading(true);
  try {
    const [m, p, c] = await Promise.all([
      db.collection("mascotas").orderBy("nombre").get(),
      db.collection("propietarios").orderBy("nombre").get(),
      db.collection("consultas").orderBy("fecha", "desc").limit(300).get()
    ]);
    _mascotas = m.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    _propietarios = p.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    _consultas = c.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    pintarMascotas();
  } catch (e) { console.error(e); toast("Error cargando datos.", "error"); }
  finally { mostrarLoading(false); }
}

function nombreDueno(id) {
  const d = _propietarios.find(function (x) { return x.id === id; });
  return d ? d.nombre : "";
}
function telefonoDueno(id) {
  const d = _propietarios.find(function (x) { return x.id === id; });
  return d ? d.telefono : "";
}

function _qConsultas() { const i = document.getElementById("c-buscar"); return i ? i.value.trim().toLowerCase() : ""; }

function pintarMascotas() {
  const cont = document.getElementById("c-contenido");
  const q = _qConsultas();
  const lista = _mascotas.filter(function (m) {
    return !q || (m.nombre + " " + (m.especie || "") + " " + (m.raza || "") + " " + (m.chip || "") + " " +
      nombreDueno(m.propietarioId) + " " + telefonoDueno(m.propietarioId)).toLowerCase().indexOf(q) !== -1;
  });
  if (!lista.length) { cont.innerHTML = '<p class="vacio">Sin mascotas ' + (q ? "para esa busqueda." : "registradas.") + '</p>'; return; }
  cont.innerHTML = '<div class="cards-grid">' + lista.map(function (m) {
    const foto = m.fotoURL ? '<img src="' + escHTML(m.fotoURL) + '" class="card-foto">'
      : '<div class="card-foto placeholder"><i class="fa-solid fa-paw"></i></div>';
    return '<div class="card-mascota">' + foto +
      '<div class="card-info"><h3>' + escHTML(m.nombre) + '</h3>' +
      '<p>' + escHTML(m.especie || "") + ' - ' + escHTML(m.raza || "") + '</p>' +
      '<p class="muted">Dueno: ' + escHTML(nombreDueno(m.propietarioId)) + '</p>' +
      '<div class="card-acc">' +
      '<button class="btn-icono" title="Historial" onclick="verHistorial(\'' + m.id + '\')"><i class="fa-solid fa-clock-rotate-left"></i></button>' +
      '<button class="btn-icono" title="Editar" onclick="abrirFormMascota(\'' + m.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
      '<button class="btn-icono" title="WhatsApp" onclick="waMascota(\'' + m.id + '\')"><i class="fa-brands fa-whatsapp"></i></button>' +
      (window.MASCOTITA.usuario && window.MASCOTITA.usuario.role === "admin" ? '<button class="btn-icono danger" title="Eliminar" onclick="eliminarMascota(\'' + m.id + '\')"><i class="fa-solid fa-trash"></i></button>' : '') +
      '</div></div></div>';
  }).join("") + '</div>';
}

function pintarConsultas() {
  const cont = document.getElementById("c-contenido");
  const q = _qConsultas();
  const lista = _consultas.filter(function (c) {
    return !q || ((c.mascota || "") + " " + (c.dueno || "") + " " + (c.motivo || "") + " " + (c.diagnostico || "")).toLowerCase().indexOf(q) !== -1;
  });
  if (!lista.length) { cont.innerHTML = '<p class="vacio">Sin consultas.</p>'; return; }
  cont.innerHTML = '<div class="table-wrap"><table class="tabla">' +
    '<thead><tr><th>Fecha</th><th>Mascota</th><th>Motivo</th><th>Diagnostico</th><th>Acciones</th></tr></thead><tbody>' +
    lista.map(function (c) {
      return '<tr><td>' + fmtFechaCorta(c.fecha) + '</td><td>' + escHTML(c.mascota) + '</td>' +
        '<td>' + escHTML(c.motivo || "") + '</td><td>' + escHTML(c.diagnostico || "") + '</td>' +
        '<td class="acciones">' +
        '<button class="btn-icono" title="PDF" onclick="pdfConsulta(\'' + c.id + '\')"><i class="fa-solid fa-file-pdf"></i></button>' +
        '<button class="btn-icono" title="Editar" onclick="abrirFormConsulta(\'' + c.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
        '</td></tr>';
    }).join("") + '</tbody></table></div>';
}

/* ---------- Propietarios ---------- */
function abrirFormDueno(id) {
  const d = id ? _propietarios.find(function (x) { return x.id === id; }) : {};
  const ov = modalForm((id ? "Editar" : "Nuevo") + " dueno",
    '<div class="grid-2">' +
    campo("dnombre", "Nombre", d.nombre) + campo("dtelefono", "Telefono", d.telefono) +
    campo("demail", "Email", d.email) + campo("ddni", "DNI/CI", d.dni) +
    campo("ddireccion", "Direccion", d.direccion) + '</div>');
  ov.querySelector("[data-guardar]").onclick = async function () {
    const datos = { nombre: val("dnombre"), telefono: val("dtelefono"), email: val("demail"), dni: val("ddni"), direccion: val("ddireccion") };
    if (!datos.nombre) { toast("Nombre obligatorio.", "warn"); return; }
    mostrarLoading(true);
    try {
      if (id) { await db.collection("propietarios").doc(id).update(datos); await registrarAuditoria("editar", "propietarios", "Edito dueno " + datos.nombre); }
      else { datos.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection("propietarios").add(datos); await registrarAuditoria("crear", "propietarios", "Creo dueno " + datos.nombre); }
      cerrarModales(); toast("Dueno guardado.", "ok"); await cargarDatosConsultas();
    } catch (e) { console.error(e); toast("Error al guardar.", "error"); } finally { mostrarLoading(false); }
  };
}

/* ---------- Mascotas con foto en Firebase Storage ---------- */
function abrirFormMascota(id) {
  const m = id ? _mascotas.find(function (x) { return x.id === id; }) : {};
  const opsDueno = _propietarios.map(function (d) { return { value: d.id, texto: d.nombre }; });
  const ov = modalForm((id ? "Editar" : "Nueva") + " mascota",
    '<div class="grid-2">' +
    campo("mnombre", "Nombre", m.nombre) +
    selectCampo("mpropietario", "Dueno", opsDueno, m.propietarioId) +
    campo("mespecie", "Especie", m.especie) + campo("mraza", "Raza", m.raza) +
    campo("medad", "Edad", m.edad) + campo("mpeso", "Peso (kg)", m.peso, "number") +
    campo("mcolor", "Color", m.color) + campo("mchip", "Chip", m.chip) +
    '</div>' + areaCampo("mobs", "Observaciones", m.observaciones) +
    '<div class="form-field full"><label>Foto (camara o galeria)</label>' +
    '<input type="file" id="f-foto" accept="image/*" capture="environment">' +
    (m.fotoURL ? '<img src="' + escHTML(m.fotoURL) + '" class="preview-foto" id="preview-foto">' : '<img class="preview-foto" id="preview-foto" style="display:none">') +
    '</div>');
  const inpFoto = document.getElementById("f-foto");
  inpFoto.onchange = function () {
    if (inpFoto.files[0]) {
      const url = URL.createObjectURL(inpFoto.files[0]);
      const pv = document.getElementById("preview-foto");
      pv.src = url; pv.style.display = "block";
    }
  };
  ov.querySelector("[data-guardar]").onclick = async function () {
    await guardarMascota(id, inpFoto.files[0], m.fotoURL);
  };
}

/* Comprime una imagen en el navegador (canvas) antes de subirla. */
function comprimirImagen(file, maxLado, calidad) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = function () { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = function () {
      let w = img.width, h = img.height;
      if (w > h && w > maxLado) { h = h * maxLado / w; w = maxLado; }
      else if (h > maxLado) { w = w * maxLado / h; h = maxLado; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(function (blob) { resolve(blob); }, "image/jpeg", calidad);
    };
    reader.readAsDataURL(file);
  });
}

async function guardarMascota(id, archivoFoto, fotoActual) {
  const datos = {
    nombre: val("mnombre"), propietarioId: val("mpropietario"),
    especie: val("mespecie"), raza: val("mraza"), edad: val("medad"),
    peso: Number(val("mpeso")) || 0, color: val("mcolor"), chip: val("mchip"),
    observaciones: val("mobs"), fotoURL: fotoActual || ""
  };
  if (!datos.nombre) { toast("Nombre obligatorio.", "warn"); return; }
  mostrarLoading(true);
  try {
    if (archivoFoto) {
      if (!storage) throw new Error("Firebase Storage no esta cargado en esta pagina.");
      const blob = await comprimirImagen(archivoFoto, 800, 0.8);
      const ref = storage.ref("mascotas/" + Date.now() + "_" + datos.nombre.replace(/[^a-zA-Z0-9]/g, "_") + ".jpg");
      const snap = await ref.put(blob);
      datos.fotoURL = await snap.ref.getDownloadURL();
    }
    if (id) { await db.collection("mascotas").doc(id).update(datos); await registrarAuditoria("editar", "mascotas", "Edito mascota " + datos.nombre); }
    else { datos.createdAt = firebase.firestore.FieldValue.serverTimestamp(); await db.collection("mascotas").add(datos); await registrarAuditoria("crear", "mascotas", "Creo mascota " + datos.nombre); }
    cerrarModales(); toast("Mascota guardada.", "ok"); await cargarDatosConsultas();
  } catch (e) { console.error(e); toast("Error al guardar la mascota.", "error"); }
  finally { mostrarLoading(false); }
}

/* ---------- Consultas / fichas clinicas ---------- */
function abrirFormConsulta(id) {
  const c = id ? _consultas.find(function (x) { return x.id === id; }) : {};
  const opsMascota = _mascotas.map(function (m) { return { value: m.id, texto: m.nombre }; });
  const pc = fechaInput(c.proximoControl);
  const ov = modalForm((id ? "Editar" : "Nueva") + " consulta",
    selectCampo("cmascota", "Mascota", opsMascota, c.mascotaId) +
    areaCampo("cmotivo", "Motivo", c.motivo) +
    areaCampo("csintomas", "Sintomas", c.sintomas) +
    areaCampo("cdiagnostico", "Diagnostico", c.diagnostico) +
    areaCampo("ctratamiento", "Tratamiento", c.tratamiento) +
    areaCampo("cmedicamentos", "Medicamentos recetados", c.medicamentos) +
    campo("cproximo", "Proximo control", pc, "date"));
  ov.querySelector("[data-guardar]").onclick = async function () {
    const mascota = _mascotas.find(function (m) { return m.id === val("cmascota"); });
    if (!mascota) { toast("Selecciona una mascota.", "warn"); return; }
    const datos = {
      mascotaId: mascota.id, mascota: mascota.nombre,
      dueno: nombreDueno(mascota.propietarioId),
      propietarioId: mascota.propietarioId,
      motivo: val("cmotivo"), sintomas: val("csintomas"),
      diagnostico: val("cdiagnostico"), tratamiento: val("ctratamiento"),
      medicamentos: val("cmedicamentos")
    };
    const pcv = val("cproximo");
    datos.proximoControl = pcv ? firebase.firestore.Timestamp.fromDate(parseFechaLocal(pcv)) : null;
    mostrarLoading(true);
    try {
      if (id) { await db.collection("consultas").doc(id).update(datos); await registrarAuditoria("editar", "consultas", "Edito consulta de " + datos.mascota); }
      else { datos.fecha = firebase.firestore.FieldValue.serverTimestamp(); await db.collection("consultas").add(datos); await registrarAuditoria("crear", "consultas", "Registro consulta de " + datos.mascota); }
      cerrarModales(); toast("Consulta guardada.", "ok"); await cargarDatosConsultas();
    } catch (e) { console.error(e); toast("Error al guardar.", "error"); } finally { mostrarLoading(false); }
  };
}

/* Historial clinico (timeline) por mascota. */
function verHistorial(mascotaId) {
  const m = _mascotas.find(function (x) { return x.id === mascotaId; });
  const items = _consultas.filter(function (c) { return c.mascotaId === mascotaId; });
  const html = items.length ? '<div class="timeline">' + items.map(function (c) {
    return '<div class="tl-item"><div class="tl-dot"></div><div class="tl-card">' +
      '<strong>' + fmtFechaCorta(c.fecha) + '</strong>' +
      '<p><b>Motivo:</b> ' + escHTML(c.motivo || "-") + '</p>' +
      '<p><b>Diagnostico:</b> ' + escHTML(c.diagnostico || "-") + '</p>' +
      '<p><b>Tratamiento:</b> ' + escHTML(c.tratamiento || "-") + '</p>' +
      '</div></div>';
  }).join("") + '</div>' : '<p class="vacio">Sin consultas previas.</p>';
  const ov = document.createElement("div");
  ov.className = "modal-overlay show";
  ov.innerHTML = '<div class="modal-box"><div class="modal-head"><h3>Historial de ' + escHTML(m.nombre) + '</h3>' +
    '<button class="icon-btn" data-cerrar><i class="fa-solid fa-xmark"></i></button></div>' +
    '<div class="modal-body">' + html + '</div></div>';
  document.body.appendChild(ov);
  ov.querySelector("[data-cerrar]").onclick = function () { ov.remove(); };
}

function pdfConsulta(id) {
  const c = _consultas.find(function (x) { return x.id === id; });
  if (c) pdfReceta(c);
}

async function waMascota(mascotaId) {
  const m = _mascotas.find(function (x) { return x.id === mascotaId; });
  const tel = telefonoDueno(m.propietarioId);
  const plantilla = await obtenerPlantillaWA("control");
  const msg = aplicarPlantilla(plantilla, { nombre: nombreDueno(m.propietarioId), mascota: m.nombre, fecha: "" });
  enviarWhatsApp(tel, msg);
}

window.abrirFormDueno = abrirFormDueno;
window.abrirFormMascota = abrirFormMascota;
window.abrirFormConsulta = abrirFormConsulta;
window.verHistorial = verHistorial;
window.pdfConsulta = pdfConsulta;
window.waMascota = waMascota;

/* Eliminar mascota (solo ADMIN; las reglas lo exigen tambien en el servidor). */
async function eliminarMascota(id) {
  const m = _mascotas.find(function (x) { return x.id === id; });
  const nCons = _consultas.filter(function (c) { return c.mascotaId === id; }).length;
  if (!(await confirmar("Eliminar a " + (m ? m.nombre : "la mascota") + (nCons ? " (tiene " + nCons + " consulta(s) en su historial que quedaran sin ficha)" : "") + "?"))) return;
  mostrarLoading(true);
  try {
    await db.collection("mascotas").doc(id).delete();
    await registrarAuditoria("eliminar", "mascotas", "Elimino mascota " + (m ? m.nombre : id));
    toast("Mascota eliminada.", "ok"); await cargarDatosConsultas();
  } catch (e) { console.error(e); toast("No se pudo eliminar (solo el ADMIN puede).", "error"); }
  finally { mostrarLoading(false); }
}
window.eliminarMascota = eliminarMascota;

if (location.pathname.match(/consultas\.html$/)) {
  document.addEventListener("DOMContentLoaded", initConsultas);
}

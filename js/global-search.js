/* =====================================================================
 * global-search.js
 * ---------------------------------------------------------------------
 * Busqueda global rapida (Ctrl+K / Cmd+K). Modal overlay que consulta
 * mascotas, propietarios, productos, consultas y citas, agrupando los
 * resultados por categoria. Busqueda en tiempo real con debounce.
 * ===================================================================== */

(function () {
  let overlay = null;

  function crearOverlay() {
    overlay = document.createElement("div");
    overlay.className = "search-overlay";
    overlay.innerHTML =
      '<div class="search-box">' +
      '  <div class="search-input">' +
      '    <i class="fa-solid fa-magnifying-glass"></i>' +
      '    <input type="text" id="gs-input" placeholder="Buscar mascotas, duenos, productos, consultas, citas..." autocomplete="off">' +
      '    <kbd>Esc</kbd>' +
      '  </div>' +
      '  <div class="search-results" id="gs-results">' +
      '    <p class="gs-hint">Escribe para buscar...</p>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) cerrar();
    });
    const inp = overlay.querySelector("#gs-input");
    inp.addEventListener("input", debounce(function () { buscar(inp.value.trim()); }, 300));
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay && overlay.classList.contains("show")) cerrar();
    });
  }

  function abrir() {
    if (!overlay) crearOverlay();
    overlay.classList.add("show");
    const inp = overlay.querySelector("#gs-input");
    inp.value = ""; inp.focus();
    overlay.querySelector("#gs-results").innerHTML = '<p class="gs-hint">Escribe para buscar...</p>';
  }
  function cerrar() { if (overlay) overlay.classList.remove("show"); }

  /* Busca en varias colecciones. Firestore no tiene "contains", por eso
   * traemos un lote y filtramos en memoria (suficiente para una PyME). */
  async function buscar(texto) {
    const cont = document.getElementById("gs-results");
    if (!texto || texto.length < 2) {
      cont.innerHTML = '<p class="gs-hint">Escribe al menos 2 letras...</p>'; return;
    }
    cont.innerHTML = '<p class="gs-hint"><span class="spinner spinner-sm"></span> Buscando...</p>';
    const q = texto.toLowerCase();
    const grupos = [
      { col: "mascotas",     campos: ["nombre", "especie", "raza"], icon: "fa-dog",         label: "Mascotas",  dest: "consultas.html" },
      { col: "propietarios", campos: ["nombre", "telefono", "email"], icon: "fa-user",      label: "Duenos",    dest: "consultas.html" },
      { col: "productos",    campos: ["nombre", "categoria", "codigoBarras"], icon: "fa-box", label: "Productos", dest: "stock.html" },
      { col: "consultas",    campos: ["mascota", "motivo", "diagnostico"], icon: "fa-stethoscope", label: "Consultas", dest: "consultas.html" },
      { col: "citas",        campos: ["mascota", "dueno", "servicio"], icon: "fa-calendar", label: "Citas",     dest: "citas.html" }
    ];
    try {
      const resultados = await Promise.all(grupos.map(async function (g) {
        const snap = await db.collection(g.col).limit(300).get();
        const items = [];
        snap.forEach(function (d) {
          const data = d.data();
          const coincide = g.campos.some(function (c) {
            return String(data[c] || "").toLowerCase().indexOf(q) !== -1;
          });
          if (coincide) items.push({ id: d.id, data: data });
        });
        return { grupo: g, items: items.slice(0, 6) };
      }));
      let html = "";
      resultados.forEach(function (r) {
        if (!r.items.length) return;
        html += '<div class="gs-group"><h4><i class="fa-solid ' + r.grupo.icon + '"></i> ' + r.grupo.label + '</h4>';
        r.items.forEach(function (it) {
          const titulo = it.data.nombre || it.data.mascota || it.data.concepto || "(sin nombre)";
          const sub = it.data.categoria || it.data.especie || it.data.motivo || it.data.telefono || "";
          html += '<a class="gs-item" href="' + r.grupo.dest + '?q=' + encodeURIComponent(titulo) + '">' +
            '<span class="gs-title">' + escHTML(titulo) + '</span>' +
            '<span class="gs-sub">' + escHTML(sub) + '</span></a>';
        });
        html += '</div>';
      });
      cont.innerHTML = html || '<p class="gs-hint">Sin resultados para "' + escHTML(texto) + '".</p>';
    } catch (e) {
      console.error(e);
      cont.innerHTML = '<p class="gs-hint">Error en la busqueda.</p>';
    }
  }

  window.abrirBusquedaGlobal = abrir;
})();

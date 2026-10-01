/* =====================================================================
 * reportes.js  (solo ADMIN)
 * ---------------------------------------------------------------------
 * Reportes y graficos:
 *  - Ventas por periodo, productos mas vendidos, mascotas atendidas,
 *    ingresos por tipo de servicio.
 *  - Graficos con Chart.js y exportacion a Excel/CSV con SheetJS.
 * ===================================================================== */

let _charts = {};

async function initReportes() {
  await protegerPagina({ soloAdmin: true, pagina: "reportes.html" });
  document.getElementById("content").innerHTML =
    '<div class="page-head"><h1><i class="fa-solid fa-chart-pie"></i> Reportes</h1>' +
    '<div class="head-actions">' +
    '<select id="rep-periodo"><option value="dia">Hoy</option><option value="semana">Semana</option><option value="mes" selected>Mes</option></select>' +
    '</div></div>' +
    '<div class="kpis" id="rep-kpis"></div>' +
    '<div class="grid-charts">' +
    '<div class="card-chart"><div class="chart-head"><h3>Ventas por dia</h3>' +
    '<button class="btn-icono" onclick="exportVentas()"><i class="fa-solid fa-file-excel"></i></button></div>' +
    '<canvas id="chartVentas"></canvas></div>' +
    '<div class="card-chart"><div class="chart-head"><h3>Ingresos por servicio</h3>' +
    '<button class="btn-icono" onclick="exportServicios()"><i class="fa-solid fa-file-excel"></i></button></div>' +
    '<canvas id="chartServicios"></canvas></div>' +
    '<div class="card-chart"><div class="chart-head"><h3>Mascotas atendidas</h3></div>' +
    '<canvas id="chartMascotas"></canvas></div>' +
    '<div class="card-chart"><div class="chart-head"><h3>Facturas por estado</h3></div>' +
    '<canvas id="chartFacturas"></canvas></div>' +
    '</div>';
  document.getElementById("rep-periodo").onchange = cargarReportes;
  await cargarReportes();
}

function rangoPeriodo(periodo) {
  const ahora = new Date(); const desde = new Date();
  if (periodo === "dia") desde.setHours(0, 0, 0, 0);
  else if (periodo === "semana") desde.setDate(ahora.getDate() - 7);
  else desde.setMonth(ahora.getMonth() - 1);
  return desde;
}

let _repFacturas = [], _repConsultas = [], _repCirugias = [];

async function cargarReportes() {
  mostrarLoading(true);
  const desde = rangoPeriodo(document.getElementById("rep-periodo").value);
  try {
    const [fac, cons, cir] = await Promise.all([
      db.collection("facturas").get(),
      db.collection("consultas").get(),
      db.collection("cirugias").get()
    ]);
    const dentro = function (ts) { const d = ts && ts.toDate ? ts.toDate() : null; return d && d >= desde; };
    _repFacturas = fac.docs.map(function (d) { return d.data(); }).filter(function (f) { return dentro(f.fecha); });
    _repConsultas = cons.docs.map(function (d) { return d.data(); }).filter(function (c) { return dentro(c.fecha); });
    _repCirugias = cir.docs.map(function (d) { return d.data(); }).filter(function (c) { return dentro(c.fecha); });
    pintarKPIs(); pintarCharts();
  } catch (e) { console.error(e); toast("Error cargando reportes.", "error"); }
  finally { mostrarLoading(false); }
}

function pintarKPIs() {
  const totalVentas = _repFacturas.filter(function (f) { return f.estado === "pagada"; })
    .reduce(function (s, f) { return s + (f.total || 0); }, 0);
  const kpis = [
    { icon: "fa-sack-dollar", label: "Ventas (pagadas)", valor: fmtMoneda(totalVentas) },
    { icon: "fa-file-invoice", label: "Facturas", valor: _repFacturas.length },
    { icon: "fa-stethoscope", label: "Consultas", valor: _repConsultas.length },
    { icon: "fa-syringe", label: "Cirugias", valor: _repCirugias.length }
  ];
  document.getElementById("rep-kpis").innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><i class="fa-solid ' + k.icon + '"></i>' +
      '<div><span class="kpi-valor">' + k.valor + '</span><span class="kpi-label">' + k.label + '</span></div></div>';
  }).join("");
}

function destruirChart(id) { if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; } }

function pintarCharts() {
  if (!window.Chart) { toast("Chart.js no se cargo.", "error"); return; }
  // Ventas por dia
  const porDia = {};
  _repFacturas.forEach(function (f) {
    const d = f.fecha && f.fecha.toDate ? fmtFechaCorta(f.fecha) : "s/f";
    porDia[d] = (porDia[d] || 0) + (f.total || 0);
  });
  destruirChart("chartVentas");
  _charts.chartVentas = new Chart(document.getElementById("chartVentas"), {
    type: "bar",
    data: { labels: Object.keys(porDia), datasets: [{ label: "Ventas", data: Object.values(porDia), backgroundColor: "#10a76f" }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
  // Ingresos por servicio (cirugias por tipo)
  const porServicio = {};
  _repCirugias.forEach(function (c) { porServicio[c.tipo || "otros"] = (porServicio[c.tipo || "otros"] || 0) + (c.costo || 0); });
  destruirChart("chartServicios");
  _charts.chartServicios = new Chart(document.getElementById("chartServicios"), {
    type: "doughnut",
    data: { labels: Object.keys(porServicio), datasets: [{ data: Object.values(porServicio), backgroundColor: ["#10a76f", "#2d7dd2", "#f4a259", "#e76f51", "#8e7dbe", "#55828b"] }] },
    options: { responsive: true }
  });
  // Mascotas atendidas por dia
  const consDia = {};
  _repConsultas.forEach(function (c) { const d = c.fecha && c.fecha.toDate ? fmtFechaCorta(c.fecha) : "s/f"; consDia[d] = (consDia[d] || 0) + 1; });
  destruirChart("chartMascotas");
  _charts.chartMascotas = new Chart(document.getElementById("chartMascotas"), {
    type: "line",
    data: { labels: Object.keys(consDia), datasets: [{ label: "Consultas", data: Object.values(consDia), borderColor: "#2d7dd2", tension: 0.3 }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });
  // Facturas por estado
  const porEstado = { pagada: 0, pendiente: 0, anulada: 0 };
  _repFacturas.forEach(function (f) { porEstado[f.estado] = (porEstado[f.estado] || 0) + 1; });
  destruirChart("chartFacturas");
  _charts.chartFacturas = new Chart(document.getElementById("chartFacturas"), {
    type: "pie",
    data: { labels: Object.keys(porEstado), datasets: [{ data: Object.values(porEstado), backgroundColor: ["#10a76f", "#f4a259", "#e76f51"] }] },
    options: { responsive: true }
  });
}

function exportVentas() {
  exportarAExcel(_repFacturas, ["numero", "cliente", "total", "estado", "fecha"], "ventas", { fecha: fmtFechaCorta });
}
function exportServicios() {
  exportarAExcel(_repCirugias, ["paciente", "tipo", "veterinario", "costo", "estado", "fecha"], "servicios", { fecha: fmtFechaCorta });
}
window.exportVentas = exportVentas;
window.exportServicios = exportServicios;

if (location.pathname.match(/reportes\.html$/)) {
  document.addEventListener("DOMContentLoaded", initReportes);
}

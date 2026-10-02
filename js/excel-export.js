/* =====================================================================
 * excel-export.js
 * ---------------------------------------------------------------------
 * Exportacion de datos a Excel (.xlsx) y CSV usando SheetJS (xlsx.js)
 * cargado por CDN. No requiere backend.
 * ===================================================================== */

/* Convierte un arreglo de objetos a filas planas segun las columnas dadas.
 * formatters: mapa opcional { campo: funcion } para formatear valores. */
function _prepararFilas(datos, columnas, formatters) {
  formatters = formatters || {};
  return datos.map(function (d) {
    const fila = {};
    columnas.forEach(function (c) {
      let v = d[c];
      if (formatters[c]) v = formatters[c](v, d);
      else if (v && v.toDate) v = fmtFecha(v); // Timestamp Firestore
      fila[c] = v == null ? "" : v;
    });
    return fila;
  });
}

/* Exporta a .xlsx descargable. */
function exportarAExcel(datos, columnas, nombreArchivo, formatters) {
  if (!window.XLSX) { toast("La libreria de Excel no se cargo.", "error"); return; }
  if (!datos || !datos.length) { toast("No hay datos para exportar.", "warn"); return; }
  const filas = _prepararFilas(datos, columnas, formatters);
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  const fecha = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, nombreArchivo + "_" + fecha + ".xlsx");
  toast("Archivo Excel generado.", "ok");
}

/* Exporta a CSV descargable (compatibilidad). */
function exportarACSV(datos, columnas, nombreArchivo, formatters) {
  if (!datos || !datos.length) { toast("No hay datos para exportar.", "warn"); return; }
  const filas = _prepararFilas(datos, columnas, formatters);
  const encabezado = columnas.join(",");
  const cuerpo = filas.map(function (f) {
    return columnas.map(function (c) {
      const v = String(f[c]).replace(/\"/g, '\"\"');
      return '\"' + v + '\"';
    }).join(",");
  }).join("\n");
  const blob = new Blob(["\ufeff" + encabezado + "\n" + cuerpo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo + "_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);
  toast("Archivo CSV generado.", "ok");
}

window.exportarAExcel = exportarAExcel;
window.exportarACSV = exportarACSV;

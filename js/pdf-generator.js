/* =====================================================================
 * pdf-generator.js
 * ---------------------------------------------------------------------
 * Generacion de PDFs con jsPDF + jsPDF-AutoTable (via CDN).
 *  - Ficha quirurgica (cirugias)
 *  - Receta / ficha clinica (consultas)
 *  - Factura / recibo (facturacion)
 * ===================================================================== */

/* Devuelve una instancia jsPDF o null si la libreria no cargo. */
function _nuevoPDF() {
  const J = window.jspdf && window.jspdf.jsPDF;
  if (!J) { toast("La libreria de PDF no se cargo.", "error"); return null; }
  return new J({ unit: "pt", format: "a4" });
}

/* Encabezado comun con "logo" textual y titulo. */
function _encabezado(doc, titulo) {
  doc.setFillColor(16, 122, 95);
  doc.rect(0, 0, 595, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22); doc.setFont("helvetica", "bold");
  doc.text("Mascotita", 40, 44);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text("Clinica Veterinaria", 40, 58);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(15); doc.setFont("helvetica", "bold");
  doc.text(titulo, 40, 100);
  doc.setFont("helvetica", "normal");
}

/* ------- Ficha quirurgica ------- */
function pdfFichaQuirurgica(c) {
  const doc = _nuevoPDF(); if (!doc) return;
  _encabezado(doc, "Ficha quirurgica");
  doc.autoTable({
    startY: 120, theme: "grid",
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [16, 122, 95] },
    head: [["Dato", "Detalle"]],
    body: [
      ["Paciente", c.paciente || ""],
      ["Dueno", c.dueno || ""],
      ["Tipo de cirugia", c.tipo || ""],
      ["Veterinario", c.veterinario || ""],
      ["Fecha", fmtFechaCorta(c.fecha)],
      ["Hora entrada", c.horaEntrada || ""],
      ["Hora salida", c.horaSalida || ""],
      ["Anestesia", c.anestesia || ""],
      ["Estado", c.estado || ""],
      ["Costo", fmtMoneda(c.costo)]
    ]
  });
  let y = doc.lastAutoTable.finalY + 20;
  doc.setFont("helvetica", "bold"); doc.text("Observaciones:", 40, y);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(c.observaciones || "Sin observaciones.", 515), 40, y + 16);
  y += 70;
  doc.setFont("helvetica", "bold"); doc.text("Indicaciones post-operatorias:", 40, y);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(c.indicaciones || "Reposo y control segun indicacion veterinaria.", 515), 40, y + 16);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text("Generado por Mascotita - " + fmtFecha(new Date()), 40, 800);
  doc.save("ficha_quirurgica_" + (c.paciente || "paciente") + ".pdf");
}

/* ------- Receta / ficha clinica ------- */
function pdfReceta(cons) {
  const doc = _nuevoPDF(); if (!doc) return;
  _encabezado(doc, "Ficha clinica / Receta");
  doc.autoTable({
    startY: 120, theme: "grid",
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: [16, 122, 95] },
    head: [["Dato", "Detalle"]],
    body: [
      ["Mascota", cons.mascota || ""],
      ["Dueno", cons.dueno || ""],
      ["Fecha", fmtFechaCorta(cons.fecha)],
      ["Motivo", cons.motivo || ""],
      ["Sintomas", cons.sintomas || ""],
      ["Diagnostico", cons.diagnostico || ""],
      ["Tratamiento", cons.tratamiento || ""],
      ["Proximo control", fmtFechaCorta(cons.proximoControl)]
    ]
  });
  let y = doc.lastAutoTable.finalY + 20;
  doc.setFont("helvetica", "bold"); doc.text("Medicamentos recetados:", 40, y);
  doc.setFont("helvetica", "normal");
  doc.text(doc.splitTextToSize(cons.medicamentos || "Sin medicacion.", 515), 40, y + 16);
  doc.setFontSize(9); doc.setTextColor(120);
  doc.text("Generado por Mascotita - " + fmtFecha(new Date()), 40, 800);
  doc.save("receta_" + (cons.mascota || "mascota") + ".pdf");
}

/* ------- Factura / recibo ------- */
function pdfFactura(f) {
  const doc = _nuevoPDF(); if (!doc) return;
  _encabezado(doc, "Factura " + (f.numero || ""));
  doc.setFontSize(10);
  doc.text("Cliente: " + (f.cliente || ""), 40, 120);
  doc.text("Fecha: " + fmtFechaCorta(f.fecha), 40, 136);
  doc.text("Estado: " + (f.estado || ""), 400, 120);
  const items = (f.items && f.items.length) ? f.items
    : [{ concepto: f.concepto || "Servicio", cantidad: 1, precio: f.subtotal || 0 }];
  doc.autoTable({
    startY: 155, theme: "striped",
    headStyles: { fillColor: [16, 122, 95] },
    head: [["Concepto", "Cant.", "Precio", "Subtotal"]],
    body: items.map(function (it) {
      return [it.concepto, it.cantidad, fmtMoneda(it.precio), fmtMoneda(it.cantidad * it.precio)];
    })
  });
  let y = doc.lastAutoTable.finalY + 20;
  doc.setFontSize(11);
  doc.text("Subtotal: " + fmtMoneda(f.subtotal), 380, y);
  doc.text("IVA (" + (f.ivaPorcentaje || 10) + "%): " + fmtMoneda(f.iva), 380, y + 18);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL: " + fmtMoneda(f.total), 380, y + 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120);
  doc.text("Gracias por confiar en Mascotita - " + fmtFecha(new Date()), 40, 800);
  doc.save((f.numero || "factura") + ".pdf");
}

window.pdfFichaQuirurgica = pdfFichaQuirurgica;
window.pdfReceta = pdfReceta;
window.pdfFactura = pdfFactura;

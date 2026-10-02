/* =====================================================================
 * notifications.js
 * ---------------------------------------------------------------------
 * Envio de notificaciones por email con EmailJS (via CDN, sin backend).
 * Caso principal: alertar por stock bajo. Los destinatarios y la
 * plantilla se leen de la coleccion "config".
 * ===================================================================== */

/* cargarConfig() vive ahora en main.js (con cache). */

/* Envia un email de alerta de stock bajo para un producto. */
async function notificarStockBajo(producto) {
  if (!window.emailjs) { console.warn("EmailJS no disponible."); return; }
  if (typeof EMAILJS_CONFIG === "undefined" ||
      EMAILJS_CONFIG.serviceId.indexOf("TU_") === 0) {
    console.warn("EmailJS no esta configurado."); return;
  }
  const cfg = await cargarConfig();
  const destinatarios = (cfg.emailsNotificacion || "").trim();
  if (!destinatarios) { console.warn("Sin destinatarios de notificacion."); return; }

  // Plantilla personalizable; admite variables {producto} {cantidad} {minimo}.
  const plantilla = cfg.plantillaStockBajo ||
    "ALERTA: el producto {producto} tiene stock bajo. Cantidad actual: {cantidad} (minimo: {minimo}).";
  const cuerpo = plantilla
    .replace(/\{producto\}/g, producto.nombre)
    .replace(/\{cantidad\}/g, producto.cantidad)
    .replace(/\{minimo\}/g, producto.minimoStock);

  try {
    await emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateId, {
      to_email: destinatarios,
      subject: "Mascotita - Alerta de stock bajo: " + producto.nombre,
      message: cuerpo,
      producto: producto.nombre,
      cantidad: producto.cantidad,
      minimo: producto.minimoStock
    });
    console.log("Notificacion de stock bajo enviada.");
  } catch (e) {
    console.warn("No se pudo enviar la notificacion:", e);
  }
}
window.notificarStockBajo = notificarStockBajo;

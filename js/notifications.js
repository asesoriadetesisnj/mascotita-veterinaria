/* =====================================================================
 * notifications.js
 * ---------------------------------------------------------------------
 * Envio de notificaciones por email con EmailJS (via CDN, sin backend).
 * Caso principal: alertar por stock bajo. Los destinatarios y la
 * plantilla se leen de la coleccion "config".
 * ===================================================================== */

/* Carga la configuracion general (IVA, emails, plantillas, etc.). */
async function cargarConfig() {
  try {
    const snap = await db.collection("config").doc("general").get();
    if (snap.exists) return snap.data();
  } catch (e) { console.warn("No se pudo leer config:", e); }
  return {};
}
window.cargarConfig = cargarConfig;

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
    .replace("{producto}", producto.nombre)
    .replace("{cantidad}", producto.cantidad)
    .replace("{minimo}", producto.minimoStock);

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

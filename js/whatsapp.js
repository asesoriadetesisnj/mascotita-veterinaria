/* =====================================================================
 * whatsapp.js
 * ---------------------------------------------------------------------
 * Integracion con WhatsApp mediante enlaces wa.me (sin backend).
 * Abre WhatsApp con un mensaje prellenado usando el telefono del dueno.
 * Las plantillas se guardan en la coleccion "plantillas_whatsapp".
 * ===================================================================== */

/* Normaliza un telefono a formato internacional (Paraguay por defecto). */
function normalizarTelefono(tel) {
  let t = String(tel || "").replace(/[^0-9+]/g, "");
  if (t.indexOf("+") === 0) t = t.slice(1);
  // Si empieza con 0 (formato local PY), lo convierte a 595.
  if (t.indexOf("0") === 0) t = "595" + t.slice(1);
  // Si no tiene codigo de pais y parece local, antepone 595.
  if (t.length <= 10 && t.indexOf("595") !== 0) t = "595" + t;
  return t;
}

/* Reemplaza variables {nombre}, {mascota}, {fecha} en la plantilla. */
function aplicarPlantilla(texto, vars) {
  return String(texto || "").replace(/\{(\w+)\}/g, function (_, k) {
    return vars[k] != null ? vars[k] : "{" + k + "}";
  });
}

/* Abre WhatsApp Web/app con el mensaje prellenado. */
function enviarWhatsApp(telefono, mensaje) {
  const t = normalizarTelefono(telefono);
  if (!t) { toast("El dueno no tiene telefono registrado.", "warn"); return; }
  const url = "https://wa.me/" + t + "?text=" + encodeURIComponent(mensaje);
  window.open(url, "_blank");
}
window.enviarWhatsApp = enviarWhatsApp;
window.aplicarPlantilla = aplicarPlantilla;

/* Carga una plantilla por clave (recordatorio_cita, vacuna, control...). */
async function obtenerPlantillaWA(clave) {
  try {
    const snap = await db.collection("plantillas_whatsapp").doc(clave).get();
    if (snap.exists) return snap.data().texto;
  } catch (e) { /* usar fallback */ }
  const def = {
    recordatorio_cita: "Hola {nombre}, te recordamos la cita de {mascota} para el {fecha} en Veterinaria Mascotita. Gracias!",
    vacuna: "Hola {nombre}, {mascota} tiene pendiente su vacuna. Agenda tu turno en Veterinaria Mascotita.",
    control: "Hola {nombre}, es momento del control de {mascota}. Te esperamos en Mascotita."
  };
  return def[clave] || "Hola {nombre}, te contactamos desde Veterinaria Mascotita.";
}
window.obtenerPlantillaWA = obtenerPlantillaWA;

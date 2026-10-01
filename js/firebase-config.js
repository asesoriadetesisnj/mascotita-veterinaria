/* =====================================================================
 * firebase-config.js
 * ---------------------------------------------------------------------
 * Inicializacion del SDK de Firebase (version compat, cargada por CDN).
 * Reemplaza los valores de "firebaseConfig" por las claves reales de tu
 * proyecto (las obtienes en Firebase Console -> Configuracion del proyecto).
 *
 * IMPORTANTE: estos valores son publicos por diseno (van en el cliente).
 * La seguridad real se aplica en las Reglas de Seguridad de Firestore
 * y de Storage, no ocultando estas claves.
 * ===================================================================== */

// ---- PEGA AQUI TUS CLAVES DE FIREBASE ----
const firebaseConfig = {
  apiKey: "AIzaSyBRmSqv38XQg3yVu0tT7CE-7Q7cakueqvU",
  authDomain: "mascotita-ba796.firebaseapp.com",
  projectId: "mascotita-ba796",
  storageBucket: "mascotita-ba796.firebasestorage.app",
  messagingSenderId: "247981868021",
  appId: "1:247981868021:web:b05ce095aedf0dd04996bc"
};

// Dominio interno con el que convertimos "usuario" -> "email" de Firebase Auth.
// Firebase Authentication trabaja con email, por eso el usuario "Admin"
// se guarda internamente como "admin@mascotita.local".
const DOMINIO_INTERNO = "mascotita.local";

// ---- CLAVES DE EmailJS (notificaciones de stock bajo) ----
// Las obtienes en https://www.emailjs.com (dashboard).
const EMAILJS_CONFIG = {
  publicKey: "TU_EMAILJS_PUBLIC_KEY",
  serviceId: "TU_EMAILJS_SERVICE_ID",
  templateId: "TU_EMAILJS_TEMPLATE_ID"
};

// Inicializacion unica del SDK (evita doble init al navegar entre paginas).
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Referencias globales reutilizadas por el resto de modulos.
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Persistencia local de la sesion (el usuario sigue logueado al refrescar).
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (e) {
  console.warn("No se pudo fijar la persistencia de sesion:", e);
});

// Inicializa EmailJS si la libreria esta disponible en la pagina.
if (window.emailjs && EMAILJS_CONFIG.publicKey.indexOf("TU_") !== 0) {
  try { emailjs.init(EMAILJS_CONFIG.publicKey); } catch (e) { /* opcional */ }
}

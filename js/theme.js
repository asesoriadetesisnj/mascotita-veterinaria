/* =====================================================================
 * theme.js
 * ---------------------------------------------------------------------
 * Gestion del modo oscuro. La preferencia se guarda en localStorage y
 * se aplica agregando/quitando la clase "dark" en <html>.
 * ===================================================================== */

(function () {
  const KEY = "mascotita-theme";

  function aplicar(tema) {
    const root = document.documentElement;
    if (tema === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    // Actualiza el icono del boton si existe.
    const btn = document.getElementById("btn-theme");
    if (btn) {
      btn.innerHTML = tema === "dark"
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';
    }
  }

  function temaGuardado() {
    const t = localStorage.getItem(KEY);
    if (t) return t;
    // Respeta la preferencia del sistema la primera vez.
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }

  // Aplica el tema lo antes posible para evitar parpadeo.
  aplicar(temaGuardado());

  window.toggleTema = function () {
    const nuevo = document.documentElement.classList.contains("dark") ? "light" : "dark";
    localStorage.setItem(KEY, nuevo);
    aplicar(nuevo);
  };

  // Engancha el boton cuando el layout ya esta renderizado.
  document.addEventListener("click", function (e) {
    const btn = e.target.closest && e.target.closest("#btn-theme");
    if (btn) window.toggleTema();
  });

  // Re-aplica el icono tras render del layout.
  const obs = new MutationObserver(function () {
    const btn = document.getElementById("btn-theme");
    if (btn && !btn.dataset.listo) {
      btn.dataset.listo = "1";
      aplicar(temaGuardado());
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();

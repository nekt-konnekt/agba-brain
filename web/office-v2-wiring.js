(() => {
  // Office V2 is injected after app.js attaches its static listeners.
  // Delegate navigation so dynamically rendered links remain real controls.
  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-view]');
    if (!target || !target.closest('#officeView')) return;
    const view = target.getAttribute('data-view');
    if (!view) return;
    const nav = document.querySelector(`.nav-item[data-view="${CSS.escape(view)}"]`);
    if (!nav) return;
    event.preventDefault();
    nav.click();
  });
})();

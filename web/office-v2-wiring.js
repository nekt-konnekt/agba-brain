(() => {
  // Office V2 is injected after app.js attaches its static listeners.
  // Delegate navigation so dynamically rendered links remain real controls.
  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('[data-view]');
    if (!target || !target.closest('#officeView')) return;
    const view = target.getAttribute('data-view');
    if (!view || typeof window.go !== 'function') return;
    // app.js owns routing; this listener covers controls created by office-enhancements.js.
    if (!target.classList.contains('nav-item')) {
      event.preventDefault();
      window.go(view);
    }
  });
})();

(() => {
  // Office V2 is injected after app.js attaches its static listeners.
  // Delegate navigation so dynamically rendered V2 controls remain real controls.
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

  // The V2 attention drawer is an inspection surface, not an action executor.
  // Make its primary CTA open the governed Actions view rather than implying
  // that clicking the attention item itself performs a consequential action.
  document.addEventListener('click', (event) => {
    const target = event.target?.closest?.('#v2DoAction');
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    document.querySelector('#v2Detail')?.classList.remove('open');
    document.querySelector('.nav-item[data-view="actions"]')?.click();
  }, true);
})();

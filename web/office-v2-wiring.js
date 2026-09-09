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

  // The Office header is part of the executive experience. Replace the generic
  // CEO label with the authenticated CEO's first name once office-read returns.
  function syncCeoGreeting() {
    const name = document.querySelector('#userName')?.textContent?.trim();
    const title = document.querySelector('#pageTitle');
    if (!name || !title || name === 'CEO') return;
    const firstName = name.split(/\s+/)[0];
    title.textContent = `Good morning, ${firstName}.`;
  }
  const observer = new MutationObserver(syncCeoGreeting);
  observer.observe(document.body, {subtree: true, childList: true, characterData: true});
  document.addEventListener('DOMContentLoaded', syncCeoGreeting);
  setTimeout(syncCeoGreeting, 0);
})();

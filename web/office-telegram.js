(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const config = { url: window.AGBA_SUPABASE_URL || '', anon: window.AGBA_SUPABASE_ANON_KEY || '' };

  function injectStyle() {
    if ($('#office-telegram-style')) return;
    const style = document.createElement('style');
    style.id = 'office-telegram-style';
    style.textContent = `
      .office-telegram{margin:0 0 16px;padding:18px 20px;border:1px solid #2a323b;border-radius:16px;background:linear-gradient(145deg,#151b22,#10151b);display:flex;align-items:center;justify-content:space-between;gap:18px}
      .office-telegram-copy{display:flex;align-items:center;gap:13px;min-width:0}.office-telegram-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:rgba(198,245,45,.12);color:#c6f52d;font-size:18px;flex:0 0 auto}.office-telegram-copy h3{margin:0;font-size:13px;color:#edf1ec}.office-telegram-copy p{margin:4px 0 0;font-size:10px;line-height:1.5;color:#7f8991}.office-telegram-status{font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-top:5px}.office-telegram-status.connected{color:#c6f52d}.office-telegram-status.pending{color:#e6b65b}.office-telegram-status.disconnected{color:#ff9f8a}.office-telegram-action{border:1px solid #c6f52d;background:#c6f52d;color:#0a0d11;border-radius:10px;padding:10px 14px;font-size:10px;font-weight:800;white-space:nowrap;cursor:pointer}.office-telegram-action:disabled{opacity:.6;cursor:wait}
      @media(max-width:620px){.office-telegram{align-items:flex-start;flex-direction:column}.office-telegram-action{width:100%}}
    `;
    document.head.appendChild(style);
  }

  async function getClient() {
    if (!config.url || !config.anon || !window.supabase) throw new Error('Supabase configuration missing');
    return window.supabase.createClient(config.url, config.anon);
  }

  async function sessionOf(sb) {
    const { data, error } = await sb.auth.getSession();
    if (error) throw error;
    return data?.session || null;
  }

  async function readTelegram(sb, session) {
    const { data, error } = await sb.functions.invoke('office-read', {
      body: {},
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.detail || data.error);
    return data?.telegram || { connected: false, bindings: [] };
  }

  async function connect(sb, button, status) {
    button.disabled = true;
    button.textContent = 'Preparing…';
    status.textContent = 'Preparing secure connection';
    status.className = 'office-telegram-status pending';
    try {
      const session = await sessionOf(sb);
      if (!session) throw new Error('Sign in required');
      const { data, error } = await sb.functions.invoke('telegram-invite', {
        body: {},
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || 'Could not prepare Telegram connection');
      if (!data?.deep_link) throw new Error('Telegram connection link was not returned');
      status.textContent = 'Open Telegram to finish';
      status.className = 'office-telegram-status pending';
      window.open(data.deep_link, '_blank', 'noopener');
      button.textContent = 'Open Telegram again';
      button.disabled = false;
      button.onclick = () => window.open(data.deep_link, '_blank', 'noopener');
      setTimeout(async () => {
        try {
          const latestSession = await sessionOf(sb);
          if (!latestSession) return;
          const latest = await readTelegram(sb, latestSession);
          if (latest.connected) render(latest, sb);
        } catch {}
      }, 5000);
    } catch (e) {
      status.textContent = e?.message || 'Could not connect Telegram';
      status.className = 'office-telegram-status disconnected';
      button.textContent = 'Try again';
      button.disabled = false;
    }
  }

  function render(telegram, sb) {
    const view = $('#officeView');
    if (!view) return;
    $('#office-telegram')?.remove();
    const bindings = telegram.bindings || [];
    const connected = !!telegram.connected && bindings.length > 0;
    const binding = bindings[0];
    const card = document.createElement('section');
    card.id = 'office-telegram';
    card.className = 'office-telegram';
    card.innerHTML = `
      <div class="office-telegram-copy">
        <div class="office-telegram-icon" aria-hidden="true">✈</div>
        <div>
          <h3>Telegram</h3>
          <p>${connected ? `Agba is connected to ${binding?.telegram_username ? `@${binding.telegram_username}` : 'your Telegram account'} for this company.` : 'Connect Agba to Telegram so you can talk to your business from anywhere.'}</p>
          <div class="office-telegram-status ${connected ? 'connected' : 'disconnected'}">${connected ? '● Connected' : '● Not connected'}</div>
        </div>
      </div>
      <button class="office-telegram-action" id="officeTelegramConnect">${connected ? 'Connect another account' : 'Connect Telegram'}</button>
    `;
    const anchor = $('.command-bar', view);
    if (anchor) anchor.insertAdjacentElement('beforebegin', card); else view.prepend(card);
    const button = $('#officeTelegramConnect', card);
    const status = $('.office-telegram-status', card);
    button.addEventListener('click', () => connect(sb, button, status));
  }

  async function init() {
    injectStyle();
    try {
      const sb = await getClient();
      const session = await sessionOf(sb);
      if (!session) return;
      const telegram = await readTelegram(sb, session);
      render(telegram, sb);
    } catch (e) {
      console.error('Office Telegram integration failed', e);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

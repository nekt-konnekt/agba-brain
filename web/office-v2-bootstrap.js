(() => {
  const url = window.AGBA_SUPABASE_URL || '';
  const anon = window.AGBA_SUPABASE_ANON_KEY || '';
  if (!url || !anon || !window.supabase?.createClient) return;
  const client = window.supabase.createClient(url, anon);
  let mounted = !!document.querySelector('.office-v2');
  let timer = null;
  const mount = async () => {
    if (mounted || document.querySelector('.office-v2')) {
      mounted = true;
      if (timer) clearInterval(timer);
      return;
    }
    try {
      const { data } = await client.auth.getSession();
      if (!data?.session) return;
      if (document.querySelector('.office-v2')) {
        mounted = true;
        if (timer) clearInterval(timer);
        return;
      }
      const script = document.createElement('script');
      script.src = `/office-enhancements.js?v=${Date.now()}`;
      script.onload = () => { mounted = !!document.querySelector('.office-v2') || mounted; };
      script.onerror = () => { mounted = false; };
      document.body.appendChild(script);
      mounted = true;
      if (timer) clearInterval(timer);
    } catch (error) {
      console.warn('Agba Office V2 bootstrap waiting for auth:', error);
    }
  };
  client.auth.onAuthStateChange((_event, session) => { if (session) mount(); });
  mount();
  timer = setInterval(mount, 1000);
  setTimeout(() => timer && clearInterval(timer), 30000);
})();

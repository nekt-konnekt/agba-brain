(() => {
  // office-enhancements.js is loaded after app.js, but app auth restoration is
  // asynchronous. If the enhancement checks for a session too early it exits
  // and its one-shot timer never tries again, leaving the legacy Office visible.
  // Wait for a real Supabase session, then re-run the existing V2 enhancement.
  const url = window.AGBA_SUPABASE_URL || '';
  const anon = window.AGBA_SUPABASE_ANON_KEY || '';
  if (!url || !anon || !window.supabase?.createClient) return;

  const client = window.supabase.createClient(url, anon);
  let loaded = false;
  let timer = null;

  const loadV2 = async () => {
    if (loaded) return;
    try {
      const { data } = await client.auth.getSession();
      if (!data?.session) return;
      loaded = true;
      if (timer) clearInterval(timer);
      const script = document.createElement('script');
      script.src = `/office-enhancements.js?v=${Date.now()}`;
      script.async = false;
      document.body.appendChild(script);
    } catch (error) {
      console.warn('Agba Office V2 retry waiting for auth:', error);
    }
  };

  client.auth.onAuthStateChange((_event, session) => {
    if (session) loadV2();
  });

  loadV2();
  timer = setInterval(loadV2, 1000);
  setTimeout(() => timer && clearInterval(timer), 30000);
})();

/* ============================================================
   Theme Loader — reads ?theme=X from URL and loads the 
   appropriate CSS (and JS for wizard mode)
   
   Values: baseline | wizard | polished | wild
   Default: baseline (no extra CSS)
   ============================================================ */
(function() {
  const params = new URLSearchParams(window.location.search);
  const theme = (params.get('theme') || '').toLowerCase();
  
  const themes = {
    wizard:   { css: './src/ui/wizard-theme.css', js: './src/ui/wizard-mode.js' },
    polished: { css: './src/ui/polished-theme.css' },
    wild:     { css: './src/ui/wild-theme.css' }
  };
  
  const chosen = themes[theme];
  if (!chosen) return; // baseline — no extra theme
  
  // Load CSS
  if (chosen.css) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chosen.css;
    document.head.appendChild(link);
  }
  
  // Load JS (wizard mode restructures DOM — needs to run after page load)
  if (chosen.js) {
    window.addEventListener('load', function() {
      const script = document.createElement('script');
      script.src = chosen.js;
      document.body.appendChild(script);
    });
  }
})();

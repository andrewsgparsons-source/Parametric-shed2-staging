/* ============================================================
   Theme Loader — reads ?theme=X from URL and loads the 
   appropriate CSS (and JS for wizard mode)
   
   Values: baseline | wizard | polished | wild
   Default: baseline (no extra CSS)
   ============================================================ */
(function() {
  // Detect mobile — use multiple signals since innerWidth may not be set in <head>
  const isMobile = window.innerWidth <= 768 || 
                   screen.width <= 768 || 
                   (navigator.maxTouchPoints > 0 && screen.width <= 1024) ||
                   /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const params = new URLSearchParams(window.location.search);
  const explicitTheme = params.get('theme');
  const theme = (explicitTheme || (isMobile ? 'baseline' : 'sidebar')).toLowerCase();
  
  const themes = {
    wizard:   { css: './src/ui/wizard-theme.css', js: './src/ui/wizard-mode.js' },
    polished: { css: './src/ui/polished-theme.css' },
    wild:     { css: './src/ui/wild-theme.css' },
    sidebar:  { css: './src/ui/sidebar-wizard.css?_v=2', js: './src/ui/sidebar-wizard.js?_v=2' },
    mobile:   { css: './src/ui/mobile-configurator.css?_v=6', js: './src/ui/mobile-configurator.js?_v=6' }
  };

  // Mobile auto-selects 'mobile' theme (unless user explicitly chose something)
  const finalTheme = (isMobile && !explicitTheme) ? 'mobile' : theme;
  
  const chosen = themes[finalTheme];
  if (!chosen) return; // baseline — no extra theme

  // For sidebar theme: inject critical inline styles immediately to prevent FOUC
  if (finalTheme === 'sidebar') {
    const style = document.createElement('style');
    style.textContent = '#controls { opacity: 0 !important; transition: opacity 0.3s; } #controls.sw-embedded { opacity: 1 !important; }';
    document.head.appendChild(style);
  }

  // For mobile: hide old UI immediately to prevent FOUC, then mobile-configurator.js takes over
  if (finalTheme === 'mobile') {
    const mobileStyle = document.createElement('style');
    mobileStyle.textContent = [
      // Critical: hide old UI elements instantly before mobile CSS loads
      '#controls { position: absolute !important; left: -9999px !important; opacity: 0 !important; pointer-events: none !important; width: 0 !important; height: 0 !important; overflow: hidden !important; }',
      '#mobileOpenBtn { display: none !important; }',
      '#mobileCloseBtn { display: none !important; }',
      '#statusOverlay { display: none !important; }',
      '#ui-layer { display: none !important; }',
      // Loading spinner while mobile configurator builds
      '#mc-loading { position: fixed; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f5f0eb; z-index: 9999; flex-direction: column; gap: 12px; font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; }',
      '#mc-loading .mc-spinner { width: 36px; height: 36px; border: 3px solid #e0d8cf; border-top-color: #6b8f71; border-radius: 50%; animation: mc-spin 0.8s linear infinite; }',
      '@keyframes mc-spin { to { transform: rotate(360deg); } }',
      '#mc-loading .mc-load-text { color: #8a8a8a; font-size: 14px; }',
      'body.mobile-configurator #mc-loading { display: none !important; }',
      // Existing overrides
      '#mobileConfigurator #mcStepNav { border-top: none !important; }',
      '#removeAllAttachmentsBtn { display: none !important; }'
    ].join('\n');
    document.head.appendChild(mobileStyle);

    // Inject loading spinner into body (will be removed when mobile-configurator adds body class)
    var addLoader = function() {
      if (document.getElementById('mc-loading')) return;
      var loader = document.createElement('div');
      loader.id = 'mc-loading';
      loader.innerHTML = '<div class="mc-spinner"></div><div class="mc-load-text">Loading configurator…</div>';
      document.body.insertBefore(loader, document.body.firstChild);
    };
    if (document.body) { addLoader(); } else { document.addEventListener('DOMContentLoaded', addLoader); }
  }
  
  // Cache buster — pass through ?bust= param or use build timestamp
  const bust = params.get('bust') || Date.now();
  
  // Load CSS
  if (chosen.css) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chosen.css + '?v=' + bust;
    document.head.appendChild(link);
  }
  
  // Load JS — append script immediately (each script handles its own timing internally)
  if (chosen.js) {
    var loadScript = function() {
      var script = document.createElement('script');
      script.src = chosen.js + '?v=' + bust;
      (document.body || document.documentElement).appendChild(script);
    };
    if (document.body) {
      loadScript();
    } else {
      document.addEventListener('DOMContentLoaded', loadScript);
    }
  }
})();

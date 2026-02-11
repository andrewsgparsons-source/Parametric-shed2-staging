/* ============================================================
   Theme Loader — reads ?theme=X from URL and loads the 
   appropriate CSS (and JS for wizard mode)
   
   Values: baseline | wizard | polished | wild
   Default: baseline (no extra CSS)
   ============================================================ */
(function() {
  // Skip sidebar wizard on mobile — use the original mobile UI instead
  const isMobile = window.innerWidth <= 768;
  const params = new URLSearchParams(window.location.search);
  const explicitTheme = params.get('theme');
  const theme = (explicitTheme || (isMobile ? 'baseline' : 'sidebar')).toLowerCase();
  
  const themes = {
    wizard:   { css: './src/ui/wizard-theme.css', js: './src/ui/wizard-mode.js' },
    polished: { css: './src/ui/polished-theme.css' },
    wild:     { css: './src/ui/wild-theme.css' },
    sidebar:  { css: './src/ui/sidebar-wizard.css', js: './src/ui/sidebar-wizard.js' },
    mobile:   { css: './src/ui/mobile-configurator.css', js: './src/ui/mobile-configurator.js' }
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
  
  // Load CSS
  if (chosen.css) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chosen.css;
    document.head.appendChild(link);
  }
  
  // Load JS — append script immediately (each script handles its own timing internally)
  if (chosen.js) {
    var loadScript = function() {
      var script = document.createElement('script');
      script.src = chosen.js;
      (document.body || document.documentElement).appendChild(script);
    };
    if (document.body) {
      loadScript();
    } else {
      document.addEventListener('DOMContentLoaded', loadScript);
    }
  }
})();

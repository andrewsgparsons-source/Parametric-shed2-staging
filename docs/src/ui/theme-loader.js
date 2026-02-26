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

  // For mobile: minimal overrides — main sizing handled by mobile-configurator.css/js
  if (finalTheme === 'mobile') {
    const mobileStyle = document.createElement('style');
    mobileStyle.textContent = [
      '#mobileConfigurator #mcStepNav { border-top: none !important; }',
      '#removeAllAttachmentsBtn { display: none !important; }'
    ].join('\n');
    document.head.appendChild(mobileStyle);
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

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

  // For mobile: inject font overrides as last-loaded <style> tag
  if (finalTheme === 'mobile') {
    const mobileStyle = document.createElement('style');
    mobileStyle.textContent = [
      '#mobileConfigurator, #mobileConfigurator *, #mcControls, #mcControls * { font-size: 16px !important; line-height: 1.5 !important; }',
      '#mobileConfigurator .boSubhead { font-size: 18px !important; font-weight: 700 !important; color: #2D5016 !important; text-transform: uppercase !important; letter-spacing: 0.03em !important; border-bottom: 2px solid #E8F0E2 !important; padding-bottom: 6px !important; margin-bottom: 12px !important; }',
      '#mobileConfigurator label { font-size: 16px !important; font-weight: 600 !important; color: #1A1A1A !important; }',
      '#mobileConfigurator input[type="number"], #mobileConfigurator input[type="text"], #mobileConfigurator select { font-size: 18px !important; padding: 12px 14px !important; min-height: 48px !important; border: 1.5px solid #E0D5C8 !important; border-radius: 8px !important; }',
      '#mobileConfigurator button { font-size: 16px !important; }',
      '#mobileConfigurator .check { font-size: 16px !important; gap: 10px !important; }',
      '#mobileConfigurator input[type="checkbox"], #mobileConfigurator input[type="radio"] { width: 24px !important; height: 24px !important; }',
      '#mobileConfigurator .hint, #mobileConfigurator p.hint { font-size: 14px !important; }',
      '#mobileConfigurator .boTitle, #mobileConfigurator .boTitle2 { font-size: 17px !important; }',
      '#mobileConfigurator .mc-step-pill { font-size: 15px !important; padding: 10px 16px !important; }',
      '#mobileConfigurator .mc-footer-btn { font-size: 17px !important; }',
      '/* Scale up the entire controls area */ #mcControls { zoom: 1.35 !important; -moz-transform: scale(1.35); -moz-transform-origin: top left; }',
      '#mcStepNav { zoom: 1.2 !important; }',
      '#mcStepFooter { zoom: 1.2 !important; }'
    ].join('\n');
    document.head.appendChild(mobileStyle);
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

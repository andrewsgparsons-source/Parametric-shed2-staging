/**
 * custom-select.js — Replaces native <select> elements with styled custom dropdowns
 * 
 * Why: Native <select> renders options via OS-level popup — invisible to screenshots
 * and un-styleable. This replaces them with DOM-based dropdowns that:
 *   1. Show all options in the page (screenshot-capturable)
 *   2. Can be animated/highlighted for guided tours
 *   3. Still fire 'change' events on the original <select> for compatibility
 * 
 * Usage: Call CustomSelect.init() after the DOM is ready.
 *        Call CustomSelect.refresh() after dynamic content changes.
 *        Call CustomSelect.open(id) / CustomSelect.close(id) for tour control.
 */
(function () {
  'use strict';

  var WRAPPER_CLASS = 'cs-wrapper';
  var DISPLAY_CLASS = 'cs-display';
  var DROPDOWN_CLASS = 'cs-dropdown';
  var OPTION_CLASS = 'cs-option';
  var OPEN_CLASS = 'cs-open';
  var SELECTED_CLASS = 'cs-selected';
  var DISABLED_CLASS = 'cs-disabled';
  var CHEVRON_CLASS = 'cs-chevron';

  // Track all enhanced selects
  var instances = {};

  /**
   * Enhance a single <select> element
   */
  function enhance(select) {
    if (!select || select.dataset.csEnhanced) return;
    if (select.closest('.cs-wrapper')) return; // already wrapped

    var id = select.id || ('cs-' + Math.random().toString(36).substr(2, 8));
    if (!select.id) select.id = id;

    // Create wrapper
    var wrapper = document.createElement('div');
    wrapper.className = WRAPPER_CLASS;
    wrapper.dataset.csFor = id;

    // Create display (shows current value)
    var display = document.createElement('div');
    display.className = DISPLAY_CLASS;
    display.setAttribute('tabindex', '0');
    display.setAttribute('role', 'combobox');
    display.setAttribute('aria-haspopup', 'listbox');
    display.setAttribute('aria-expanded', 'false');
    display.setAttribute('aria-label', select.getAttribute('aria-label') || '');

    var displayText = document.createElement('span');
    displayText.className = 'cs-display-text';

    var chevron = document.createElement('span');
    chevron.className = CHEVRON_CLASS;
    chevron.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    display.appendChild(displayText);
    display.appendChild(chevron);

    // Create dropdown
    var dropdown = document.createElement('div');
    dropdown.className = DROPDOWN_CLASS;
    dropdown.setAttribute('role', 'listbox');

    // Build options
    buildOptions(select, dropdown);

    // Update display text
    updateDisplayText(select, displayText);

    // Insert wrapper: replace select in DOM
    select.parentNode.insertBefore(wrapper, select);
    wrapper.appendChild(display);
    wrapper.appendChild(select); // Keep select inside wrapper but hidden

    // Append dropdown to body so it escapes overflow:hidden containers (flyout panels)
    dropdown.setAttribute('data-cf-protected', 'true'); // Protect from purgeSidebars
    document.body.appendChild(dropdown);
    dropdown.dataset.csFor = id;

    // Hide original select
    select.style.position = 'absolute';
    select.style.opacity = '0';
    select.style.pointerEvents = 'none';
    select.style.width = '0';
    select.style.height = '0';
    select.style.overflow = 'hidden';
    select.setAttribute('tabindex', '-1');
    select.dataset.csEnhanced = 'true';

    // ── Event handling ──

    // Toggle dropdown on display click
    display.addEventListener('click', function (e) {
      e.stopPropagation();
      if (select.disabled) return;
      var isOpen = wrapper.classList.contains(OPEN_CLASS);
      closeAll();
      if (!isOpen) {
        openDropdown(wrapper, display, dropdown);
      }
    });

    // Keyboard support
    display.addEventListener('keydown', function (e) {
      if (select.disabled) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (!wrapper.classList.contains(OPEN_CLASS)) {
          closeAll();
          openDropdown(wrapper, display, dropdown);
        } else if (e.key === 'ArrowDown') {
          var opts = dropdown.querySelectorAll('.' + OPTION_CLASS + ':not(.cs-disabled)');
          if (opts.length) opts[0].focus();
        }
      } else if (e.key === 'Escape') {
        closeDropdown(wrapper, display);
      }
    });

    // Option click
    dropdown.addEventListener('click', function (e) {
      var opt = e.target.closest('.' + OPTION_CLASS);
      if (!opt || opt.classList.contains(DISABLED_CLASS)) return;

      var value = opt.dataset.value;
      select.value = value;

      // Update selected state
      dropdown.querySelectorAll('.' + OPTION_CLASS).forEach(function (o) {
        o.classList.toggle(SELECTED_CLASS, o.dataset.value === value);
      });

      updateDisplayText(select, displayText);
      closeDropdown(wrapper, display);

      // Fire change event on original select
      var evt = new Event('change', { bubbles: true });
      select.dispatchEvent(evt);
    });

    // Keyboard navigation inside dropdown
    dropdown.addEventListener('keydown', function (e) {
      var opts = Array.from(dropdown.querySelectorAll('.' + OPTION_CLASS + ':not(.cs-disabled)'));
      var current = document.activeElement;
      var idx = opts.indexOf(current);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (idx < opts.length - 1) opts[idx + 1].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (idx > 0) opts[idx - 1].focus();
        else display.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (current && current.classList.contains(OPTION_CLASS)) {
          current.click();
        }
      } else if (e.key === 'Escape') {
        closeDropdown(wrapper, display);
        display.focus();
      }
    });

    // Sync: when original select changes programmatically
    var observer = new MutationObserver(function () {
      buildOptions(select, dropdown);
      updateDisplayText(select, displayText);
    });
    observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

    // Also listen for change events dispatched by code (store.onChange etc.)
    select.addEventListener('cs-sync', function () {
      updateDisplayText(select, displayText);
      syncSelectedClass(select, dropdown);
    });

    // Periodic sync for programmatic .value changes (store.onChange sets select.value directly)
    var lastValue = select.value;
    var syncInterval = setInterval(function () {
      if (select.value !== lastValue) {
        lastValue = select.value;
        updateDisplayText(select, displayText);
        syncSelectedClass(select, dropdown);
      }
      // Update disabled state
      wrapper.classList.toggle(DISABLED_CLASS, !!select.disabled);
    }, 200);

    instances[id] = {
      wrapper: wrapper,
      display: display,
      dropdown: dropdown,
      select: select,
      displayText: displayText,
      observer: observer,
      syncInterval: syncInterval
    };
  }

  function buildOptions(select, dropdown) {
    dropdown.innerHTML = '';
    Array.from(select.options).forEach(function (opt) {
      var div = document.createElement('div');
      div.className = OPTION_CLASS;
      div.dataset.value = opt.value;
      div.textContent = opt.textContent;
      div.setAttribute('role', 'option');
      div.setAttribute('tabindex', '-1');
      if (opt.selected) div.classList.add(SELECTED_CLASS);
      if (opt.disabled) div.classList.add(DISABLED_CLASS);
      dropdown.appendChild(div);
    });
  }

  function updateDisplayText(select, displayText) {
    var selected = select.options[select.selectedIndex];
    displayText.textContent = selected ? selected.textContent : '';
  }

  function syncSelectedClass(select, dropdown) {
    dropdown.querySelectorAll('.' + OPTION_CLASS).forEach(function (o) {
      o.classList.toggle(SELECTED_CLASS, o.dataset.value === select.value);
    });
  }

  function openDropdown(wrapper, display, dropdown) {
    // Guard: don't open if wrapper is invisible (collapsed accordion, display:none, etc.)
    var wrapperRect = wrapper.getBoundingClientRect();
    if (wrapperRect.width === 0 && wrapperRect.height === 0) {
      console.warn('[custom-select] Refusing to open — wrapper has zero dimensions');
      return;
    }

    wrapper.classList.add(OPEN_CLASS);
    display.setAttribute('aria-expanded', 'true');
    dropdown.classList.add(OPEN_CLASS);

    // Use fixed positioning to escape overflow:hidden parents (flyout panels)
    var rect = display.getBoundingClientRect();
    dropdown.style.position = 'fixed';
    dropdown.style.left = rect.left + 'px';
    dropdown.style.minWidth = rect.width + 'px';

    var dropHeight = dropdown.scrollHeight || 200;
    var spaceBelow = window.innerHeight - rect.bottom - 4;
    if (spaceBelow < dropHeight && rect.top > spaceBelow) {
      dropdown.classList.add('cs-above');
      dropdown.style.top = '';
      dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    } else {
      dropdown.classList.remove('cs-above');
      dropdown.style.bottom = '';
      dropdown.style.top = (rect.bottom + 4) + 'px';
    }

    // Scroll selected option into view
    var selected = dropdown.querySelector('.' + SELECTED_CLASS);
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  function closeDropdown(wrapper, display, dropdown) {
    wrapper.classList.remove(OPEN_CLASS);
    if (display) display.setAttribute('aria-expanded', 'false');
    if (dropdown) dropdown.classList.remove(OPEN_CLASS);
  }

  function closeAll() {
    Object.keys(instances).forEach(function (id) {
      var inst = instances[id];
      closeDropdown(inst.wrapper, inst.display, inst.dropdown);
    });
  }

  // Close on outside click
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.' + WRAPPER_CLASS) && !e.target.closest('.' + DROPDOWN_CLASS)) {
      closeAll();
    }
  });

  // ── Public API ──

  /**
   * Initialize: enhance all <select> elements inside the configurator
   */
  function init(selector) {
    var root = selector ? document.querySelector(selector) : document.getElementById('controlPanel');
    if (!root) root = document.body;

    var selects = root.querySelectorAll('select:not([data-cs-enhanced]):not(.cs-skip)');
    selects.forEach(function (sel) {
      enhance(sel);
    });

    console.log('[custom-select] Enhanced', selects.length, 'select elements');
  }

  /**
   * Refresh: re-enhance any new selects that appeared
   */
  function refresh(root) {
    init(root);
  }

  /**
   * Programmatically open a dropdown by select id (for guided tour)
   */
  function open(id) {
    var inst = instances[id];
    if (!inst) return false;
    closeAll();
    openDropdown(inst.wrapper, inst.display, inst.dropdown);
    return true;
  }

  /**
   * Programmatically close a dropdown by select id
   */
  function close(id) {
    var inst = instances[id];
    if (!inst) return;
    closeDropdown(inst.wrapper, inst.display, inst.dropdown);
  }

  /**
   * Programmatically select a value (for guided tour)
   * Optionally animate with a highlight effect
   */
  function selectValue(id, value, animate) {
    var inst = instances[id];
    if (!inst) return false;

    var select = inst.select;
    var dropdown = inst.dropdown;
    var option = dropdown.querySelector('[data-value="' + value + '"]');
    if (!option) return false;

    if (animate) {
      // Highlight the option before selecting
      option.classList.add('cs-highlight');
      setTimeout(function () {
        option.classList.remove('cs-highlight');
        option.click();
      }, 600);
    } else {
      option.click();
    }
    return true;
  }

  /**
   * Get all dropdown IDs
   */
  function list() {
    return Object.keys(instances);
  }

  // Expose
  window.CustomSelect = {
    init: init,
    refresh: refresh,
    enhance: enhance,
    open: open,
    close: close,
    select: selectValue,
    list: list,
    closeAll: closeAll
  };

  // Auto-init after a delay (let index.js build the form first)
  function autoInit() {
    var panel = document.getElementById('controlPanel');
    var widthInput = document.getElementById('wInput');
    if (panel && widthInput) {
      init();
      // Also re-init after sidebar wizard might move things around
      setTimeout(function () { init(); }, 3000);
    } else {
      setTimeout(autoInit, 500);
    }
  }

  (document.readyState === 'loading')
    ? document.addEventListener('DOMContentLoaded', function () { setTimeout(autoInit, 1500); })
    : setTimeout(autoInit, 1500);

})();

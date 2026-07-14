/* ═══════════════════════════════════════════════════════════════════
   js/ui/responsive-ui.js — Shared breakpoint detection
   ═══════════════════════════════════════════════════════════════════
   Single source of truth for "what breakpoint are we at right now",
   matching the pixel values already used across css/responsive/*.css
   (1200 / 1024 / 820 / 640 / 480 / 380).

   Other modules query this instead of re-deriving their own
   window.innerWidth checks, and can listen for `breakpointChanged`
   instead of attaching their own resize listener.

   ResponsiveUI.current()      -> 'xxl' | 'xl' | 'lg' | 'md' | 'sm' | 'xs'
   ResponsiveUI.isMobile()      -> width <= 820
   ResponsiveUI.isTablet()      -> 820 < width <= 1024
   ResponsiveUI.isDesktop()     -> width > 1024
   ResponsiveUI.isTouch()       -> matchMedia(pointer: coarse)
   ResponsiveUI.isSmallScreen()  -> width <= 480
   ResponsiveUI.isMediumScreen() -> 480 < width <= 820
   ResponsiveUI.isLargeScreen()  -> width > 1024

   Last updated: 2026-07-14
   ═══════════════════════════════════════════════════════════════════ */

const ResponsiveUI = (() => {

  /* ═══════════════════════════════════════════════════════════════
     BREAKPOINT DEFINITIONS
     ═══════════════════════════════════════════════════════════════ */

  const BREAKPOINTS = [
    { name: 'xxl', max: Infinity, label: 'Extra Extra Large', min: 1201 },
    { name: 'xl', max: 1200, label: 'Extra Large', min: 1025 },
    { name: 'lg', max: 1024, label: 'Large', min: 821 },
    { name: 'md', max: 820, label: 'Medium / Tablet', min: 641 },
    { name: 'sm', max: 640, label: 'Small', min: 481 },
    { name: 'xs', max: 480, label: 'Extra Small', min: 381 },
    { name: 'xxs', max: 380, label: 'Extra Extra Small', min: 0 }
  ];

  /* ═══════════════════════════════════════════════════════════════
     STATE
     ═══════════════════════════════════════════════════════════════ */

  let lastBreakpoint = null;
  let lastWidth = window.innerWidth;
  let lastHeight = window.innerHeight;

  // Cached media query results
  let _isTouch = null;
  let _isReducedMotion = null;
  let _isDarkMode = null;

  /* ═══════════════════════════════════════════════════════════════
     CORE API
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Get the current breakpoint name
   * @returns {string} 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'
   */
  function current() {
    const w = window.innerWidth;
    for (const bp of BREAKPOINTS) {
      if (w <= bp.max) return bp.name;
    }
    return 'xxl';
  }

  /**
   * Get the current breakpoint object with full details
   * @returns {object} { name, max, min, label, width }
   */
  function currentBreakpoint() {
    const w = window.innerWidth;
    for (const bp of BREAKPOINTS) {
      if (w <= bp.max) {
        return { ...bp, width: w };
      }
    }
    return { name: 'xxl', max: Infinity, min: 1201, label: 'Extra Extra Large', width: w };
  }

  /**
   * Get the current viewport width
   * @returns {number} Viewport width in pixels
   */
  function width() {
    return window.innerWidth;
  }

  /**
   * Get the current viewport height
   * @returns {number} Viewport height in pixels
   */
  function height() {
    return window.innerHeight;
  }

  /* ═══════════════════════════════════════════════════════════════
     BOOLEAN CHECKS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Check if the viewport is mobile-sized (≤ 820px)
   * @returns {boolean} True if mobile
   */
  function isMobile() {
    return window.innerWidth <= 820;
  }

  /**
   * Check if the viewport is tablet-sized (821–1024px)
   * @returns {boolean} True if tablet
   */
  function isTablet() {
    const w = window.innerWidth;
    return w > 820 && w <= 1024;
  }

  /**
   * Check if the viewport is desktop-sized (> 1024px)
   * @returns {boolean} True if desktop
   */
  function isDesktop() {
    return window.innerWidth > 1024;
  }

  /**
   * Check if the viewport is a small screen (≤ 480px)
   * @returns {boolean} True if small screen
   */
  function isSmallScreen() {
    return window.innerWidth <= 480;
  }

  /**
   * Check if the viewport is a medium screen (481–820px)
   * @returns {boolean} True if medium screen
   */
  function isMediumScreen() {
    const w = window.innerWidth;
    return w > 480 && w <= 820;
  }

  /**
   * Check if the viewport is a large screen (> 1024px)
   * @returns {boolean} True if large screen
   */
  function isLargeScreen() {
    return window.innerWidth > 1024;
  }

  /**
   * Check if the viewport is extra large (> 1200px)
   * @returns {boolean} True if extra large
   */
  function isExtraLarge() {
    return window.innerWidth > 1200;
  }

  /**
   * Check if the device supports touch (pointer: coarse)
   * @returns {boolean} True if touch-capable
   */
  function isTouch() {
    if (_isTouch === null) {
      _isTouch = window.matchMedia('(pointer: coarse)').matches;
    }
    return _isTouch;
  }

  /**
   * Check if the user prefers reduced motion
   * @returns {boolean} True if prefers reduced motion
   */
  function prefersReducedMotion() {
    if (_isReducedMotion === null) {
      _isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return _isReducedMotion;
  }

  /**
   * Check if the user prefers dark mode
   * @returns {boolean} True if prefers dark mode
   */
  function prefersDarkMode() {
    if (_isDarkMode === null) {
      _isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return _isDarkMode;
  }

  /* ═══════════════════════════════════════════════════════════════
     DERIVED HELPERS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Get the current orientation (portrait or landscape)
   * @returns {string} 'portrait' or 'landscape'
   */
  function orientation() {
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  /**
   * Check if the viewport is in portrait mode
   * @returns {boolean} True if portrait
   */
  function isPortrait() {
    return orientation() === 'portrait';
  }

  /**
   * Check if the viewport is in landscape mode
   * @returns {boolean} True if landscape
   */
  function isLandscape() {
    return orientation() === 'landscape';
  }

  /**
   * Get the breakpoint name as a CSS class suffix
   * @returns {string} e.g., 'mobile', 'tablet', 'desktop'
   */
  function breakpointClass() {
    const bp = current();
    if (bp === 'xs' || bp === 'xxs' || bp === 'sm') return 'mobile';
    if (bp === 'md') return 'tablet';
    return 'desktop';
  }

  /* ═══════════════════════════════════════════════════════════════
     BREAKPOINT CHANGE DETECTION
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Check if the breakpoint has changed and dispatch an event if so
   */
  function checkChange() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const bp = current();

    // Update cached values
    lastWidth = w;
    lastHeight = h;

    if (bp !== lastBreakpoint) {
      const previous = lastBreakpoint;
      lastBreakpoint = bp;

      // Dispatch the event
      document.dispatchEvent(new CustomEvent('breakpointChanged', {
        detail: {
          breakpoint: bp,
          previous: previous,
          width: w,
          height: h,
          isMobile: isMobile(),
          isTablet: isTablet(),
          isDesktop: isDesktop(),
          orientation: orientation()
        }
      }));
    }
  }

  /**
   * Force a breakpoint check (useful after DOM changes)
   */
  function refresh() {
    checkChange();
  }

  /* ═══════════════════════════════════════════════════════════════
     INITIALIZATION
     ═══════════════════════════════════════════════════════════════ */

  // Listen to the debounced appResize event from shell.js
  document.addEventListener('appResize', checkChange);

  // Also listen to orientation change
  window.addEventListener('orientationchange', () => {
    // Give the layout time to settle
    setTimeout(checkChange, 300);
  });

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    lastBreakpoint = current();
    checkChange();
  });

  // Also run immediately if DOM is already loaded
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    lastBreakpoint = current();
    checkChange();
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORTS
     ═══════════════════════════════════════════════════════════════ */

  return {
    // Core
    current,
    currentBreakpoint,
    width,
    height,
    refresh,

    // Boolean checks
    isMobile,
    isTablet,
    isDesktop,
    isSmallScreen,
    isMediumScreen,
    isLargeScreen,
    isExtraLarge,
    isTouch,
    prefersReducedMotion,
    prefersDarkMode,

    // Orientation
    orientation,
    isPortrait,
    isLandscape,

    // Utility
    breakpointClass,

    // Breakpoint constants (for reference)
    BREAKPOINTS,

    // Last known values
    lastBreakpoint: () => lastBreakpoint,
    lastWidth: () => lastWidth,
    lastHeight: () => lastHeight
  };

})();

// ─── EXPOSE TO WINDOW ───────────────────────────────────────────────
window.ResponsiveUI = ResponsiveUI;

export default ResponsiveUI;
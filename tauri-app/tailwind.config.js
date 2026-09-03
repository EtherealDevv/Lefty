/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // M3 Expressive — monochrome #121212 / #FFFFFF — via CSS variables injected by materialYouExpressive.ts
        // Core roles
        primary: {
          DEFAULT: "var(--md-sys-color-primary)",
          hover: "var(--md-sys-color-primary-fixed-dim)",
          container: "var(--md-sys-color-primary-container)",
          on: "var(--md-sys-color-on-primary)",
          onContainer: "var(--md-sys-color-on-primary-container)",
          fixed: "var(--md-sys-color-primary-fixed)",
          inverse: "var(--md-sys-color-inverse-primary)",
        },
        secondary: {
          DEFAULT: "var(--md-sys-color-secondary)",
          container: "var(--md-sys-color-secondary-container)",
          on: "var(--md-sys-color-on-secondary)",
          onContainer: "var(--md-sys-color-on-secondary-container)",
        },
        tertiary: {
          DEFAULT: "var(--md-sys-color-tertiary)",
          container: "var(--md-sys-color-tertiary-container)",
          on: "var(--md-sys-color-on-tertiary)",
          onContainer: "var(--md-sys-color-on-tertiary-container)",
        },
        error: {
          DEFAULT: "var(--md-sys-color-error)",
          container: "var(--md-sys-color-error-container)",
          on: "var(--md-sys-color-on-error)",
          onContainer: "var(--md-sys-color-on-error-container)",
        },
        surface: {
          DEFAULT: "var(--md-sys-color-surface)",
          dim: "var(--md-sys-color-surface-dim)",
          bright: "var(--md-sys-color-surface-bright)",
          container: "var(--md-sys-color-surface-container)",
          low: "var(--md-sys-color-surface-container-low)",
          lowest: "var(--md-sys-color-surface-container-lowest)",
          high: "var(--md-sys-color-surface-container-high)",
          highest: "var(--md-sys-color-surface-container-highest)",
          tint: "var(--md-sys-color-surface-tint)",
          inverse: "var(--md-sys-color-inverse-surface)",
          onInverse: "var(--md-sys-color-inverse-on-surface)",
          // hyphenated aliases for M3 expressive usage (bg-surface-container-high etc.)
          "container-low": "var(--md-sys-color-surface-container-low)",
          "container-lowest": "var(--md-sys-color-surface-container-lowest)",
          "container-high": "var(--md-sys-color-surface-container-high)",
          "container-highest": "var(--md-sys-color-surface-container-highest)",
        },
        outline: {
          DEFAULT: "var(--md-sys-color-outline)",
          variant: "var(--md-sys-color-outline-variant)",
        },
        on: {
          surface: "var(--md-sys-color-on-surface)",
          variant: "var(--md-sys-color-on-surface-variant)",
          "surface-variant": "var(--md-sys-color-on-surface-variant)",
          primary: "var(--md-sys-color-on-primary)",
          secondary: "var(--md-sys-color-on-secondary)",
          error: "var(--md-sys-color-on-error)",
          "primary-container": "var(--md-sys-color-on-primary-container)",
          "secondary-container": "var(--md-sys-color-on-secondary-container)",
          "tertiary-container": "var(--md-sys-color-on-tertiary-container)",
          "error-container": "var(--md-sys-color-on-error-container)",
        },
        background: "var(--md-sys-color-surface-dim)",
        scrim: "var(--md-sys-color-scrim)",
        shadow: "var(--md-sys-color-shadow)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Outfit", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        none: "var(--md-sys-shape-corner-none)",
        sm: "var(--md-sys-shape-corner-small)",
        DEFAULT: "var(--md-sys-shape-corner-medium)",
        md: "var(--md-sys-shape-corner-medium)",
        lg: "var(--md-sys-shape-corner-large)",
        xl: "var(--md-sys-shape-corner-extra-large)",
        "2xl": "var(--md-sys-shape-corner-extra-large)",
        "3xl": "32px",
        full: "var(--md-sys-shape-corner-full)",
        pill: "999px",
      },
      boxShadow: {
        "m3-1": "0 1px 3px rgba(0,0,0,0.3), 0 4px 8px rgba(0,0,0,0.2)",
        "m3-2": "0 2px 6px rgba(0,0,0,0.35), 0 8px 16px rgba(0,0,0,0.25)",
        "m3-3": "0 4px 12px rgba(0,0,0,0.4), 0 16px 32px rgba(0,0,0,0.3)",
      },
      transitionTimingFunction: {
        "m3-emphasized": "var(--md-sys-motion-easing-emphasized)",
        "m3-emphasized-decelerate": "var(--md-sys-motion-easing-emphasized-decelerate)",
        "m3-spring": "var(--md-sys-motion-spring)",
        "m3-standard": "var(--md-sys-motion-easing-standard)",
      },
      transitionDuration: {
        "m3-short2": "100ms",
        "m3-short4": "200ms",
        "m3-medium2": "300ms",
        "m3-long1": "450ms",
      },
      keyframes: {
        "m3-fade-in": { "0%": { opacity: "0", transform: "scale(0.96) translateY(4px)" }, "100%": { opacity: "1", transform: "scale(1) translateY(0)" } },
        "m3-ripple": { "0%": { transform: "scale(0)", opacity: "0.2" }, "100%": { transform: "scale(4)", opacity: "0" } },
      },
      animation: {
        "m3-fade-in": "m3-fade-in 350ms var(--md-sys-motion-easing-emphasized-decelerate)",
      },
    },
  },
  plugins: [],
}

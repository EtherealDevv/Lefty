/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Monochrome Material You - neutral tonal greys
        surface: {
          DEFAULT: "#131316",
          container: "#1E1E24",
          high: "#28282F",
          highest: "#33333A",
          bright: "#3B3A42",
          tint: "#1A1A1E",
        },
        outline: {
          DEFAULT: "#77767E",
          variant: "#46464F",
        },
        primary: {
          DEFAULT: "#C8C5D0",
          hover: "#D0CEDA",
          container: "#45444C",
          on: "#2F2E33",
        },
        on: {
          surface: "#E6E1EC",
          variant: "#C7C5D0",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "16px",
        lg: "12px",
      },
    },
  },
  plugins: [],
}

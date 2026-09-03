/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Monochrome Material 3 - #121212 / #FFFFFF
        primary: {
          DEFAULT: "#FFFFFF",
          hover: "#F0F0F0",
          container: "#2D2D2D",
          on: "#000000",
        },
        surface: {
          DEFAULT: "#1C1C1C",
          container: "#1C1C1C",
          high: "#2D2D2D",
          highest: "#3A3A3A",
          bright: "#2D2D2D",
        },
        outline: {
          DEFAULT: "#8E8E8E",
          variant: "#2D2D2D",
        },
        on: {
          surface: "#E3E3E3",
          variant: "#C6C6C6",
        },
        background: "#121212",
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

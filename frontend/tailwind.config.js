/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        brand: {
          50: "#eef2ff",
          100: "#e0e7ff",
          400: "#7c8aff",
          500: "#3f67ff",
          600: "#2c4ee0",
          700: "#1f3bbd",
        },
        ink: {
          900: "#0b1020",
          800: "#121a33",
          700: "#1a2440",
          600: "#2a324f",
          500: "#4a5583",
          400: "#7c8db5",
          200: "#c8d0e4",
          50: "#f7f8fb",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass:
          "0 10px 40px -10px rgba(31, 59, 189, 0.25), 0 4px 12px -4px rgba(0, 0, 0, 0.08)",
      },
      backgroundImage: {
        sky: "linear-gradient(180deg, #cfe7ff 0%, #e6f1ff 45%, #f5f9ff 100%)",
        "sky-deep":
          "linear-gradient(180deg, #87b9eb 0%, #b9d6f5 35%, #e6f1ff 80%, #f5f9ff 100%)",
        "ink-gradient": "linear-gradient(180deg, #0b1020 0%, #121a33 100%)",
      },
      keyframes: {
        floaty: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
      },
      animation: {
        floaty: "floaty 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

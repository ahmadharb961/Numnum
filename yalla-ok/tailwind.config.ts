import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f6efff",
          100: "#ecdcfe",
          200: "#d9bafc",
          300: "#bd8bf8",
          400: "#a057f2",
          500: "#8125e8",
          600: "#6f1bcb",
          700: "#5b16a6",
          800: "#4a1487",
          900: "#3c116c",
        },
        lavender: "#f7f5fc",
        ink: { DEFAULT: "#151222", soft: "#3d3850", muted: "#76718a" },
        sun: { DEFAULT: "#ffd43b", soft: "#fff4c2" },
        coral: { DEFAULT: "#f0445a", soft: "#ffeef0" },
        whatsapp: { DEFAULT: "#25d366", dark: "#1aa851" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: { "4xl": "2rem" },
      boxShadow: {
        card: "0 1px 2px rgba(21,18,34,.04), 0 6px 24px -8px rgba(60,17,108,.12)",
        lift: "0 2px 4px rgba(21,18,34,.05), 0 16px 40px -12px rgba(60,17,108,.25)",
        fab: "0 12px 32px -8px rgba(129,37,232,.6)",
      },
      keyframes: {
        "card-in": { from: { opacity: "0", transform: "translateY(10px) scale(.98)" }, to: { opacity: "1", transform: "none" } },
        "card-out": { from: { opacity: "1", transform: "none" }, to: { opacity: "0", transform: "scale(.96)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "live-ping": { "0%": { transform: "scale(1)", opacity: ".6" }, "80%,100%": { transform: "scale(2.6)", opacity: "0" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "pop-in": { "0%": { transform: "scale(.6)", opacity: "0" }, "70%": { transform: "scale(1.08)" }, "100%": { transform: "scale(1)", opacity: "1" } },
      },
      animation: {
        "card-in": "card-in 420ms cubic-bezier(.2,.8,.2,1) both",
        "card-out": "card-out 300ms ease-in both",
        "fade-in": "fade-in 250ms ease-out both",
        "live-ping": "live-ping 1.6s cubic-bezier(0,0,.2,1) infinite",
        shimmer: "shimmer 1.4s infinite",
        "pop-in": "pop-in 500ms cubic-bezier(.2,.8,.2,1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;

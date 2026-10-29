import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fff4ed",
          100: "#ffe6d4",
          200: "#ffc9a8",
          300: "#ffa371",
          400: "#ff7438",
          500: "#ff5412",
          600: "#f03a08",
          700: "#c72a09",
          800: "#9e2410",
          900: "#7f2111",
        },
        ink: {
          DEFAULT: "#16120f",
          soft: "#3b342f",
          muted: "#7a716a",
        },
        cream: "#fbf8f5",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: { "4xl": "2rem" },
      keyframes: {
        "sheet-up": { from: { transform: "translateY(100%)" }, to: { transform: "translateY(0)" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        pop: { "0%": { transform: "scale(1)" }, "50%": { transform: "scale(1.25)" }, "100%": { transform: "scale(1)" } },
      },
      animation: {
        "sheet-up": "sheet-up 280ms cubic-bezier(.2,.8,.2,1)",
        "fade-in": "fade-in 200ms ease-out",
        pop: "pop 300ms ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;

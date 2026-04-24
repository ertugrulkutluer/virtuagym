import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      colors: {
        ink: {
          50: "#f7f7f8",
          100: "#eceef1",
          200: "#d5d9e0",
          300: "#b1b8c4",
          400: "#7d8699",
          500: "#535b6c",
          600: "#3a414f",
          700: "#2a2f3b",
          800: "#1b1e26",
          900: "#101218",
          950: "#080a0f",
        },
        accent: {
          50: "#eef1ff",
          100: "#dfe4ff",
          200: "#c5cdff",
          300: "#a3adff",
          400: "#7f86fb",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        brand: {
          50: "#f4f7fb",
          100: "#e7eef7",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16,18,24,0.04), 0 4px 16px -4px rgba(16,18,24,0.08)",
        lift: "0 10px 30px -12px rgba(79,70,229,0.25)",
      },
      backgroundImage: {
        "grid-soft":
          "linear-gradient(to right, rgba(16,18,24,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(16,18,24,0.04) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

export default config;

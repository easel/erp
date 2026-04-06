import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx,js,jsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        finance: "#3b82f6",
        sales: "#10b981",
        procurement: "#f59e0b",
        crm: "#8b5cf6",
        compliance: "#ef4444",
      },
    },
  },
  plugins: [],
};

export default config;

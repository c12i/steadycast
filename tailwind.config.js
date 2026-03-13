/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#0f0f12",
          raised: "#1a1a22",
          overlay: "#22222e",
        },
      },
    },
  },
  plugins: [],
};

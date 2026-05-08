/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10211b",
        mist: "#d9e1dc",
        sand: "#fbf6ef",
        brand: {
          50: "#eef8f4",
          100: "#d9efe8",
          500: "#0f7a65",
          700: "#0b5a4b",
          900: "#10211b"
        },
        accent: {
          100: "#ffe7c7",
          400: "#d98930",
          600: "#a65f17"
        }
      },
      boxShadow: {
        panel: "0 28px 70px rgba(16, 33, 27, 0.08)"
      },
      borderRadius: {
        "4xl": "2rem"
      }
    }
  },
  plugins: []
};

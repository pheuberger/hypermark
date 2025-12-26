/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0ea5e9',   // sky-500
        secondary: '#8b5cf6', // violet-500
      },
    },
  },
  plugins: [],
}


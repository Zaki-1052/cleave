// frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#4AAED9', dark: '#3A8EBF' },
        status: {
          new: '#3F51B5',
          'in-progress': '#00BCD4',
          complete: '#4CAF50',
          error: '#B71C1C',
          terminated: '#9E9E9E',
        },
        accent: { teal: '#2BBCC4', gold: '#F5A623' },
      },
    },
  },
  plugins: [],
};

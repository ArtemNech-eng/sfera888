/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'honest-dark': '#0B0F14',
        'honest-darker': '#090C10',
        'honest-light': '#D1D5DB',
        'honest-primary': '#34F5A3',
        'honest-accent': '#38BDF8',
        'honest-secondary': '#FACC15',
        'honest-muted': '#6B7280',
      },
      boxShadow: {
        'honest-glow': '0 0 20px rgba(52, 245, 163, 0.5)',
        'honest-glow-lg': '0 0 40px rgba(52, 245, 163, 0.7)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(52, 245, 163, 0.5)' },
          '50%': { boxShadow: '0 0 40px rgba(52, 245, 163, 0.7)' },
        },
      },
    },
  },
  plugins: [],
};
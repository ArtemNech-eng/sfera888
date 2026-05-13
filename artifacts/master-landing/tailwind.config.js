/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        honest: {
          dark: '#0B0F14',
          darker: '#090C10',
          light: '#D1D5DB',
          primary: '#34F5A3',
          accent: '#38BDF8',
          secondary: '#FACC15',
          muted: '#6B7280',
        },
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
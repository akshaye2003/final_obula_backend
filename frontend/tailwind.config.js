/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0a0a0b',
          elevated: '#141414',
          muted: '#18181b',
        },
        primary: {
          DEFAULT: '#C9A962',
          dark: '#B8A988',
          light: '#D4AF37',
        },
        accent: {
          start: '#C9A962',
          mid: '#B8A988',
          end: '#D4AF37',
          glow: 'rgba(201, 169, 98, 0.15)',
        },
        muted: '#a1a1aa',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-accent': 'linear-gradient(135deg, #B8A988 0%, #C9A962 50%, #D4AF37 100%)',
        'gradient-accent-subtle': 'linear-gradient(135deg, rgba(201,169,98,0.2) 0%, rgba(184,169,136,0.15) 100%)',
      },
      boxShadow: {
        glow: '0 0 60px -15px rgba(201, 169, 98, 0.2)',
        'glow-subtle': '0 0 80px -20px rgba(201, 169, 98, 0.1)',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        '30': '7.5rem',
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      accentColor: {
        DEFAULT: '#C9A962',
      },
    },
  },
  plugins: [],
};

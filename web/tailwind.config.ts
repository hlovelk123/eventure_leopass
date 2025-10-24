import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1463FF',
          secondary: '#F59E0B',
          accent: '#10B981'
        }
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans Sinhala', 'Noto Sans Tamil', 'sans-serif']
      }
    }
  },
  plugins: []
};

export default config;

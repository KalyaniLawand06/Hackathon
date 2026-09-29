import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        hospital: {
          canvas: '#f8faf9', // Soothing, soft warm off-white
          surface: '#ffffff', // Crisp, clean clinic white
          surfaceSubtle: '#f3f7f5', // Quiet tinted container surface
          border: '#e2ece4', // Soft organic sage-slate hairline
          borderLight: '#eef5f0', // Very light divider
          text: '#1a2920', // High contrast, accessible readable dark slate
          textMuted: '#516559', // WCAG AA compliant muted label text
        },
        sage: {
          50: '#f4f8f5',
          100: '#e4efe7',
          200: '#cbe0d1',
          300: '#a6c6af',
          400: '#7da78a',
          500: '#5c8d6b',
          600: '#467154',
          700: '#385a43', // Accessible for text on sage-50/100
          800: '#2d4635',
          900: '#23372a',
        },
        serene: {
          50: '#f0f6f8',
          100: '#dcebf1',
          200: '#bddbe5',
          300: '#90c3d3',
          400: '#5ba3b9',
          500: '#3c869c',
          600: '#306c7f',
          700: '#2b5867', // Accessible for text on serene-50/100
          800: '#274955',
          900: '#243e48',
        },
        calmTeal: {
          50: '#f0f9f8',
          100: '#d9f1ee',
          200: '#b6e3dd',
          300: '#86cfc5',
          400: '#52b3a8',
          500: '#35968b',
          600: '#28786f',
          700: '#23605a', // Accessible clinical teal
          800: '#204d49',
          900: '#1e403d',
        },
        softRose: {
          50: '#fdf5f5',
          100: '#fbe9e9',
          200: '#f7d6d6',
          300: '#f0b5b5',
          400: '#e38b8b',
          500: '#d16666',
          600: '#b84949',
          700: '#973636', // High contrast red for critical indicators
          800: '#7c2e2e',
          900: '#672a2a',
        },
        softAmber: {
          50: '#fef9ee',
          100: '#fcf0d5',
          200: '#f8e0ab',
          300: '#f3ca77',
          400: '#ecae42',
          500: '#df9422',
          600: '#be7417',
          700: '#985616', // High contrast amber for aging warnings
          800: '#7c4418',
          900: '#683a17',
        },
      },
    },
  },
  plugins: [],
};

export default config;

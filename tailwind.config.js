/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#F8FAFC',
          900: '#FFFFFF',
          850: '#F1F5F9',
          800: '#E2E8F0',
          700: '#CBD5E1',
          600: '#94A3B8',
        },
        telemetry: {
          green: '#10B981',
          emerald: '#059669',
          amber: '#F59E0B',
          orange: '#EA580C',
          red: '#EF4444',
          crimson: '#DC2626',
          cyan: '#06B6D4',
          sky: '#0284C7',
          blue: '#2563EB',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 1px 3px 0 rgba(6, 182, 212, 0.2), 0 1px 2px -1px rgba(6, 182, 212, 0.2)',
        'glow-red': '0 0 12px -2px rgba(239, 68, 68, 0.25)',
        'glow-green': '0 0 12px -2px rgba(16, 185, 129, 0.25)',
        'glow-amber': '0 0 12px -2px rgba(245, 158, 11, 0.25)',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      }
    },
  },
  plugins: [],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Team 148 #AllBlackEverything theme — backed by CSS custom properties
        background: 'hsl(var(--background) / <alpha-value>)',
        surfaceAlt: 'hsl(var(--surface-alt) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        surfaceElevated: 'hsl(var(--surface-elevated) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        textPrimary: 'hsl(var(--text-primary) / <alpha-value>)',
        textSecondary: 'hsl(var(--text-secondary) / <alpha-value>)',
        textMuted: 'hsl(var(--text-muted) / <alpha-value>)',
        redAlliance: 'hsl(var(--red-alliance) / <alpha-value>)',
        blueAlliance: 'hsl(var(--blue-alliance) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
        interactive: 'hsl(var(--interactive) / <alpha-value>)',
        // Team 148 accent color
        accent: 'hsl(var(--accent) / <alpha-value>)',
      },
      boxShadow: {
        card: '0 4px 20px rgba(0,0,0,0.4)',
        // Design system shadows
        'glow-red': '0 0 15px -3px hsl(var(--accent) / 0.3)',
        'glow-red-lg': '0 0 30px -5px hsl(var(--accent) / 0.4)',
        'glow-success': '0 0 15px -3px hsl(var(--success) / 0.3)',
        'glow-blue': '0 0 15px -3px hsl(var(--blue-alliance) / 0.3)',
        'glow-warning': '0 0 15px -3px hsl(var(--warning) / 0.3)',
        'elevated': '0 8px 30px rgba(0,0,0,0.5), 0 0 1px rgba(255,255,255,0.05)',
        'inner-glow': 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'grid-pattern': 'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
        'accent-glow': 'radial-gradient(ellipse at top, hsl(var(--accent) / 0.08) 0%, transparent 60%)',
        'surface-gradient': 'linear-gradient(180deg, hsl(var(--surface-elevated) / 1) 0%, hsl(var(--surface) / 1) 100%)',
      },
      backgroundSize: {
        'grid-sm': '20px 20px',
        'grid-md': '40px 40px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-scale': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 15px -3px hsl(var(--accent) / 0.2)' },
          '50%': { boxShadow: '0 0 25px -3px hsl(var(--accent) / 0.4)' },
        },
        'shimmer': {
          from: { backgroundPosition: '-200% 0' },
          to: { backgroundPosition: '200% 0' },
        },
        'border-glow': {
          '0%, 100%': { borderColor: 'hsl(var(--accent) / 0.3)' },
          '50%': { borderColor: 'hsl(var(--accent) / 0.6)' },
        },
        'scan-line': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-in-slow': 'fade-in 0.5s ease-out',
        'fade-in-scale': 'fade-in-scale 0.2s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'border-glow': 'border-glow 2s ease-in-out infinite',
        'scan-line': 'scan-line 3s linear infinite',
      },
    },
  },
  plugins: [],
}

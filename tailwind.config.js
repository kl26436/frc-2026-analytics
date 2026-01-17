/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Team 148 #AllBlackEverything theme
        background: '#000000',
        surface: '#121212',
        surfaceElevated: '#1E1E1E',
        card: '#242424',
        border: '#333333',
        textPrimary: '#FFFFFF',
        textSecondary: '#A3A3A3',
        textMuted: '#737373',
        redAlliance: '#DC2626',
        blueAlliance: '#2563EB',
        success: '#22C55E',
        warning: '#EAB308',
        danger: '#EF4444',
        interactive: '#2A2A2A',
      },
    },
  },
  plugins: [],
}

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        hud: { bg: '#14213D', panel: '#000000', cyan: '#FCA311', cyandim: '#FCA311', gold: '#FCA311', text: '#FFFFFF' },
      },
      fontFamily: { mono: ['"Share Tech Mono"', 'ui-monospace', 'monospace'] },
      animation: {
        spotlight: "spotlight 2s ease .75s 1 normal forwards",
      },
      keyframes: {
        spotlight: {
          "0%": {
            opacity: 0,
            transform: "translate(-72%, -62%) scale(0.5)",
          },
          "100%": {
            opacity: 1,
            transform: "translate(-50%,-40%) scale(1)",
          },
        },
      },
    },
  },
  plugins: [],
};

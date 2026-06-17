export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        hud: { bg: '#00060a', panel: '#010d14', cyan: '#19C3FF', cyandim: '#0a6e8c', gold: '#C9A24B', text: '#8ffcff' },
      },
      fontFamily: { mono: ['"Share Tech Mono"', 'ui-monospace', 'monospace'] },
    },
  },
  plugins: [],
};

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { localAiProxy } from './scripts/ai-proxy';

export default defineConfig({
  base: './',
  plugins: [react(),localAiProxy()],
  build: { rollupOptions: { output: { manualChunks(id) {
    if(id.includes('/katex/'))return 'math';
    if(id.includes('/react-dom/')||id.includes('/react/'))return 'react';
    if(id.includes('/read-excel-file/')||id.includes('/fflate/'))return 'spreadsheets';
    if(id.includes('/jszip/'))return 'zip';
    if(id.includes('/acorn/'))return 'javascript';
    if(id.includes('/src/data/samples.json'))return 'reference-data';
  } } } }
});

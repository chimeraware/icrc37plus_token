import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		outDir: 'dist'
	},
	resolve: {
		alias: {
			$lib: resolve('./src/lib')
		}
	},
	define: {
		global: 'globalThis',
	},
	optimizeDeps: {
		include: ['@dfinity/agent', '@dfinity/principal', '@dfinity/candid']
	}
});

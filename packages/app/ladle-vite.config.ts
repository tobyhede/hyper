import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * The static catalogue does not reuse the application Vite configuration:
 * that configuration boots the HTTP repository runtime. Ladle supplies its
 * own React pipeline, so Tailwind is the only additional plugin here.
 */
export default defineConfig({
  plugins: [tailwindcss()],
});

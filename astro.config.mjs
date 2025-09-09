// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';

import react from '@astrojs/react';

import markdoc from '@astrojs/markdoc';

import keystatic from '@keystatic/astro'

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    },

    imageService: "compile"
  }),

  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [react(), markdoc(), keystatic()]
});

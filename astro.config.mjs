// @ts-check
import { defineConfig } from "astro/config";

import cloudflare from "@astrojs/cloudflare";

import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

import markdoc from "@astrojs/markdoc";

import keystatic from "@keystatic/astro";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
    site: 'https://mosunset.com',
    adapter: cloudflare({
        platformProxy: {
            enabled: true,
        },

        imageService: "compile",
    }),

    prefetch: {
        prefetchAll: false,
    },

    vite: {
        plugins: [tailwindcss()],
        ssr: {
            external: ["node:crypto"],
        },
    },

    integrations: [react(), markdoc(), keystatic(), sitemap()],
});
import { config } from "@keystatic/core";

// ★★★ これが解決策です ★★★
// Astroのスキーマを安全に読み込むための専用ヘルパーをインポートします
import { astroContentCollection } from "@keystatic/astro";

export default config({
    /**
     * ストレージ設定 (ローカル開発用)
     */
    storage: {
        kind: "local",

        /**
         * ▼ 本番環境（Cloudflare Pagesなど）へのデプロイ時 ▼
         * kind: 'github' に切り替えます
         */
        // kind: 'github',
        // repo: {
        //   owner: 'YOUR_GITHUB_USERNAME',
        //   name: 'YOUR_REPO_NAME',
        // }
    },

    /**
     * コレクション設定
     * ここで 'singleton' は使わず、すべて 'astroContentCollection' ヘルパーを使います。
     */
    collections: {
        /**
         * ブログ (Blog)
         */
        blog: astroContentCollection({
            label: "ブログ記事",
            // 'src/content/config.ts'のexport keyである 'blog' を指定
            collection: "blog",
            slugField: "title", // 'title' フィールドを元にファイル名を生成
        }),

        /**
         * 楽器 (Instruments)
         */
        instruments: astroContentCollection({
            label: "楽器リスト",
            collection: "instruments", // Astroの 'instruments' コレクションを参照
            slugField: "modelName",
        }),

        /**
         * 蔵書 (Books)
         */
        books: astroContentCollection({
            label: "蔵書リスト",
            collection: "books", // Astroの 'books' (type: 'data') コレクションを参照
            slugField: "title",
        }),
    },
});

// Astroから必要なツール（zod と defineCollection）をインポートします
import { defineCollection, z } from "astro:content";

/**
 * 1. ブログ (Blog) コレクション
 * ----------------------------------------
 * 用途: ブログ記事の管理
 * タイプ: 'content' (Markdown本文を記事内容として使用)
 * スキーマ: タイトル、概要、公開日、タグ配列、サムネイル画像
 */
const blogCollection = defineCollection({
    type: "content",
    schema: z.any(),
});

/**
 * 2. 蔵書 (Books) コレクション
 * ----------------------------------------
 * 用途: 蔵書リスト（インベントリ）
 * タイプ: 'data' (Markdown本文を持たないデータ。JSONまたはYAMLでの管理を想定)
 * スキーマ: タイトル、著者、カテゴリ、読了状態、所有形態、ISBN、表紙画像
 */
const booksCollection = defineCollection({
    type: "content",
    schema: z.any(),
});

/**
 * 3. 楽器 (Instruments) コレクション
 * ----------------------------------------
 * 用途: 所有楽器の管理
 * タイプ: 'content' (改造履歴やメモなどをMarkdown本文として使用)
 * スキーマ: 楽器名、モデル名、ブランド、製造番号、購入日、写真、タグ
 */
const instrumentsCollection = defineCollection({
    type: "content",
    schema: z.any(),
});

/**
 * 4. 資格・試験 (Qualifications) コレクション
 * ----------------------------------------
 * 用途: 取得した資格や受験した試験の管理
 * タイプ: 'data' (JSON形式でのデータ管理)
 * スキーマ: 資格名、実施団体、取得日、スコア、証明書画像、メモ
 */
const qualificationsCollection = defineCollection({
    type: "content",
    schema: z.any(),
});

/**
 * Astroにすべてのコレクションを登録
 * ----------------------------------------
 * 上記で定義した3つのコレクションを 'collections' オブジェクトにまとめてエクスポートします。
 * KeystaticなどのCMSもこのエクスポートを参照します。
 */
export const collections = {
    blog: blogCollection,
    books: booksCollection,
    instruments: instrumentsCollection,
    qualifications: qualificationsCollection,
};

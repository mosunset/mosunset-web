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
    schema: ({ image }) =>
        z.object({
            title: z.string(),
            description: z.string(),
            pubDate: z.date(),
            tags: z.array(z.string()),
            thumbnail: image(), // 記事のサムネイル画像
        }),
});

/**
 * 2. 蔵書 (Books) コレクション
 * ----------------------------------------
 * 用途: 蔵書リスト（インベントリ）
 * タイプ: 'data' (Markdown本文を持たないデータ。JSONまたはYAMLでの管理を想定)
 * スキーマ: タイトル、著者、カテゴリ、読了状態、所有形態、ISBN、表紙画像
 */
const booksCollection = defineCollection({
    type: "data",
    schema: ({ image }) =>
        z.array(
            z.object({
                title: z.string(),
                author: z.string(),
                category: z.enum([
                    "技術書",
                    "漫画",
                    "小説",
                    "ビジネス書",
                    "雑誌",
                    "画集",
                    "その他",
                ]),
                status: z.enum(["未読", "読書中", "読了", "積読"]),
                format: z.enum(["紙", "電子版", "自炊"]),
                isbn: z.string().optional(), // ISBNコード (任意)
                coverImage: image().optional(), // 表紙の画像 (任意)
            })
        ),
});

/**
 * 3. 楽器 (Instruments) コレクション
 * ----------------------------------------
 * 用途: 所有楽器の管理
 * タイプ: 'content' (改造履歴やメモなどをMarkdown本文として使用)
 * スキーマ: 楽器名、モデル名、ブランド、製造番号、購入日、写真、タグ
 */
const instrumentsCollection = defineCollection({
    type: "data",
    schema: ({ image }) =>
        z.array(
            z.object({
                name: z.string(), // 例: "エレキギター"
                modelName: z.string(), // 例: "Stratocaster ST62"
                brand: z.string(),
                serialNumber: z.string().optional(), // 製造番号 (任意)
                purchaseDate: z.coerce.date().optional(), // 購入日 (任意)
                thumbnail: image(), // 楽器の写真 (必須推奨)
                tags: z.array(z.string()).optional(), // 例: ["メイン機", "宅録用"] (任意)
            })
        ),
});

/**
 * 4. 資格・試験 (Qualifications) コレクション
 * ----------------------------------------
 * 用途: 取得した資格や受験した試験の管理
 * タイプ: 'data' (JSON形式でのデータ管理)
 * スキーマ: 資格名、実施団体、取得日、スコア、証明書画像、メモ
 */
const qualificationsCollection = defineCollection({
    type: "data",
    schema: ({ image }) =>
        z.array(
            z.object({
                name: z.string(), // 例: "基本情報技術者試験"
                organization: z.string(), // 実施団体 例: "IPA"
                category: z.enum([
                    "IT・情報処理",
                    "語学",
                    "ビジネス",
                    "技術・工学",
                    "デザイン",
                    "その他",
                ]),
                status: z.enum(["取得済み", "受験済み", "学習中"]),
                acquiredDate: z.coerce.date().optional(), // 取得日 (任意)
                score: z.string().optional(), // スコアや得点 (任意)
                certificateImage: image().optional(), // 証明書の画像 (任意)
                memo: z.string().optional(), // メモや感想 (任意)
            })
        ),
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

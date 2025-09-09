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
            draft: z.boolean(),
            visibility: z.enum(["public", "unlisted", "private"]),
            publishedDate: z.date(),
            updatedDate: z.date().optional(),
            title: z.string(),
            description: z.string().optional(),
            thumbnail: image(),
            category: z.enum(["技術", "日記", "その他"]),
            tags: z.array(z.string()),
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
    type: "content",
    schema: ({ image }) =>
        z.object({
            draft: z.boolean(),
            visibility: z.enum(["public", "unlisted", "private"]),
            isbn: z.string(),
            title: z.string(),
            author: z.string(),
            publisher: z.string(),
            publishedDate: z.date(),
            description: z.string().optional(),
            thumbnail: image(),
            category: z.enum([
                "技術書",
                "漫画",
                "小説",
                "ビジネス書",
                "雑誌",
                "画集",
                "その他",
            ]),
            tags: z.array(z.string()),
            format: z.enum(["紙", "電子版", "自炊"]),
            status: z.enum(["未読", "読書中", "読了"]),
            evaluation: z.enum(["未評価", "1", "2", "3", "4", "5"]),
        }),
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
    schema: ({ image }) =>
        z.object({
            draft: z.boolean(),
            visibility: z.enum(["public", "unlisted", "private"]),
            name: z.string(),
            brand: z.string(),
            type: z.enum([
                "ピアノ・電子ピアノ",
                "エレクトーン・キーボード",
                "ギター・ベース・アンプ",
                "ドラム",
                "管楽器・吹奏楽器",
                "弦楽器",
                "コンサートパーカッション",
                "マーチング楽器",
                "その他",
            ]),
            instrumentName: z.string(),
            manufactureYear: z.number().optional(),
            serialNumber: z.string().optional(),
            thumbnail: image(),
            images: z.array(image()).optional(),
            purchaseDate: z.date().optional(),
            purchasePrice: z.number().optional(),
            status: z.enum(["使用中", "修理中", "修理済み", "売却済み"]),
        }),
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
    schema: ({ image }) =>
        z.object({
            draft: z.boolean(),
            visibility: z.enum(["public", "unlisted", "private"]),
            name: z.string(),
            organization: z.string(),
            category: z.enum([
                "IT・情報処理",
                "語学",
                "ビジネス",
                "技術・工学",
                "デザイン",
                "福祉",
                "医療",
                "その他",
            ]),
            tags: z.array(z.string()),
            status: z.enum(["取得済み", "未取得", "受験済み", "学習中"]),
            acquiredDate: z.date().optional(),
            validityPeriod: z.date().optional(),
            score: z.string().optional(),
            certificateNumber: z.string().optional(),
            thumbnail: image().optional(),
        }),
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

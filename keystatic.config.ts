import { config, fields, collection } from "@keystatic/core";

export default config({
    /**
     * ストレージ設定 (ローカル開発用)
     */
    storage: {
        /**
         * ▼ ローカル開発用 ▼
         */
        // kind: "local",

        /**
         * ▼ 本番環境（Cloudflare Pagesなど）へのデプロイ時 ▼
         */
        kind: "github",
        repo: {
            owner: "mosunset",
            name: "mosunset-web",
        },
    },

    /**
     * ===========================================
     * コレクション設定
     * ===========================================
     *
     * 各コレクションの設定項目について:
     *
     * label: string
     *   - Keystatic管理画面で表示されるコレクション名
     *   - 用途: ユーザーがコンテンツを識別しやすくする
     *
     * slugField: string
     *   - URLの一部として使用されるフィールド名を指定
     *   - 用途: SEOフレンドリーなURLの自動生成
     *   - 注意: 指定したフィールドは必須項目となる
     *
     * path: string
     *   - ファイルの保存先ディレクトリパス（ワイルドカード対応）
     *   - 用途: ファイルの物理的な保存場所を定義
     *   - 注意: パスはプロジェクトルートからの相対パス
     *
     * format: object
     *   - コンテンツの形式とメインコンテンツフィールドを指定
     *   - contentField: メインコンテンツとして扱うフィールド名
     *   - 用途: エディタでの表示やレンダリング時の優先フィールド決定
     *
     * schema: object
     *   - 各フィールドの型とバリデーションルールを定義
     *   - 用途: データの整合性確保とユーザーインターフェース生成
     *   - 注意: 各フィールドは一意の名前を持つ必要がある
     */
    collections: {
        /**
         * 1. ブログ (Blog) コレクション
         * ----------------------------------------
         * 用途: ブログ記事の管理
         * タイプ: 'content' (Markdown本文を記事内容として使用)
         * スキーマ: タイトル、概要、公開日、タグ配列、サムネイル画像
         */
        blog: collection({
            label: "ブログ記事",
            slugField: "title",
            path: "src/content/blog/*",
            format: { contentField: "content" },
            schema: {
                title: fields.slug({
                    name: {
                        label: "タイトル",
                        description:
                            "記事のタイトル（URLスラッグとしても使用されます）",
                    },
                }),
                description: fields.text({
                    label: "概要",
                    description: "記事の概要や要約",
                }),
                pubDate: fields.date({
                    label: "公開日",
                    description: "記事の公開日時",
                }),
                tags: fields.array(fields.text({ label: "タグ" }), {
                    label: "タグ",
                    description: "記事に関連するタグのリスト",
                    itemLabel: (props) => props.value || "タグ",
                }),
                thumbnail: fields.image({
                    label: "サムネイル画像",
                    description: "記事のサムネイル画像",
                    directory: "public/images",
                    publicPath: "/images/",
                }),
                content: fields.markdoc({
                    label: "本文",
                    description: "記事の本文（Markdown形式）",
                }),
            },
        }),

        /**
         * 2. 蔵書 (Books) コレクション
         * ----------------------------------------
         * 用途: 蔵書リスト（インベントリ）
         * タイプ: 'data' (Markdown本文を持たないデータ。JSONまたはYAMLでの管理を想定)
         * スキーマ: タイトル、著者、カテゴリ、読了状態、所有形態、ISBN、表紙画像
         */
        books: collection({
            label: "蔵書リスト",
            slugField: "title",
            path: "src/content/books/*",
            format: { contentField: "content" },
            schema: {
                title: fields.text({
                    label: "タイトル",
                    description: "本のタイトル",
                }),
                author: fields.text({
                    label: "著者",
                    description: "著者名",
                }),
                category: fields.select({
                    label: "カテゴリ",
                    description: "本のカテゴリ",
                    options: [
                        { label: "技術書", value: "技術書" },
                        { label: "漫画", value: "漫画" },
                        { label: "小説", value: "小説" },
                        { label: "ビジネス書", value: "ビジネス書" },
                        { label: "雑誌", value: "雑誌" },
                        { label: "画集", value: "画集" },
                        { label: "その他", value: "その他" },
                    ],
                    defaultValue: "その他",
                }),
                status: fields.select({
                    label: "読了状態",
                    description: "本の読了状態",
                    options: [
                        { label: "未読", value: "未読" },
                        { label: "読書中", value: "読書中" },
                        { label: "読了", value: "読了" },
                        { label: "積読", value: "積読" },
                    ],
                    defaultValue: "未読",
                }),
                format: fields.select({
                    label: "所有形態",
                    description: "本の所有形態",
                    options: [
                        { label: "紙", value: "紙" },
                        { label: "電子版", value: "電子版" },
                        { label: "自炊", value: "自炊" },
                    ],
                    defaultValue: "紙",
                }),
                isbn: fields.text({
                    label: "ISBN",
                    description: "ISBNコード（任意）",
                    validation: {
                        length: { min: 10, max: 13 },
                    },
                }),
                coverImage: fields.image({
                    label: "表紙画像",
                    description: "本の表紙画像（任意）",
                    directory: "public/images",
                    publicPath: "/images/",
                }),
                content: fields.markdoc({
                    label: "本文",
                    description: "記事の本文（Markdown形式）",
                }),
            },
        }),

        /**
         * 3. 楽器 (Instruments) コレクション
         * ----------------------------------------
         * 用途: 所有楽器の管理
         * タイプ: 'data' (改造履歴やメモなどをMarkdown本文として使用)
         * スキーマ: 楽器名、モデル名、ブランド、製造番号、購入日、写真、タグ
         */
        instruments: collection({
            label: "楽器リスト",
            slugField: "name",
            path: "src/content/instruments/*",
            format: { contentField: "content" },
            schema: {
                name: fields.text({
                    label: "楽器名",
                    description: "例: エレキギター",
                }),
                modelName: fields.text({
                    label: "モデル名",
                    description: "例: Stratocaster ST62",
                }),
                brand: fields.text({
                    label: "ブランド",
                    description: "楽器のブランド名",
                }),
                serialNumber: fields.text({
                    label: "製造番号",
                    description: "楽器の製造番号（任意）",
                }),
                purchaseDate: fields.date({
                    label: "購入日",
                    description: "楽器の購入日（任意）",
                }),
                thumbnail: fields.image({
                    label: "楽器の写真",
                    description: "楽器の写真（推奨）",
                    directory: "public/images",
                    publicPath: "/images/",
                }),
                tags: fields.array(fields.text({ label: "タグ" }), {
                    label: "タグ",
                    description: "例: メイン機、宅録用など",
                    itemLabel: (props) => props.value || "タグ",
                }),
                content: fields.markdoc({
                    label: "本文",
                    description: "記事の本文（Markdown形式）",
                }),
            },
        }),

        /**
         * 4. 資格・試験 (Qualifications) コレクション
         * ----------------------------------------
         * 用途: 取得した資格や受験した試験の管理
         * タイプ: 'data' (JSON形式でのデータ管理)
         * スキーマ: 資格名、実施団体、取得日、スコア、証明書画像、メモ
         */
        qualifications: collection({
            label: "資格・試験",
            slugField: "name",
            path: "src/content/qualifications/*",
            format: { contentField: "content" },
            schema: {
                name: fields.text({
                    label: "資格名",
                    description: "例: 基本情報技術者試験",
                }),
                organization: fields.text({
                    label: "実施団体",
                    description: "例: IPA",
                }),
                category: fields.select({
                    label: "カテゴリ",
                    description: "資格のカテゴリ",
                    options: [
                        { label: "IT・情報処理", value: "IT・情報処理" },
                        { label: "語学", value: "語学" },
                        { label: "ビジネス", value: "ビジネス" },
                        { label: "技術・工学", value: "技術・工学" },
                        { label: "デザイン", value: "デザイン" },
                        { label: "その他", value: "その他" },
                    ],
                    defaultValue: "その他",
                }),
                status: fields.select({
                    label: "ステータス",
                    description: "資格の取得状況",
                    options: [
                        { label: "取得済み", value: "取得済み" },
                        { label: "受験済み", value: "受験済み" },
                        { label: "学習中", value: "学習中" },
                    ],
                    defaultValue: "学習中",
                }),
                acquiredDate: fields.date({
                    label: "取得日",
                    description: "資格の取得日（任意）",
                }),
                score: fields.text({
                    label: "スコア",
                    description: "スコアや得点（任意）",
                }),
                certificateImage: fields.image({
                    label: "証明書画像",
                    description: "証明書の画像（任意）",
                    directory: "public/images",
                    publicPath: "/images/",
                }),
                content: fields.markdoc({
                    label: "本文",
                    description: "記事の本文（Markdown形式）",
                }),
            },
        }),
    },
});

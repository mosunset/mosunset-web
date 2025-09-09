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
     * コレクション設定
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
            entryLayout: "content",
            format: { contentField: "content" },
            columns: [
                "draft",
                "visibility",
                "publishedDate",
                "title",
                "category",
            ],
            schema: {
                draft: fields.checkbox({
                    label: "下書き",
                    // description: "記事の下書き状態",
                }),
                visibility: fields.select({
                    label: "公開範囲",
                    // description: "記事の公開範囲設定",
                    options: [
                        { label: "公開", value: "public" },
                        { label: "限定公開", value: "unlisted" },
                        { label: "非公開", value: "private" },
                    ],
                    defaultValue: "public",
                }),
                publishedDate: fields.date({
                    label: "公開日",
                    // description: "未来の日付を指定しても公開されます",
                    validation: {
                        isRequired: true,
                    },
                }),
                updatedDate: fields.date({
                    label: "更新日",
                    // description: "記事の更新日時",
                }),
                title: fields.slug({
                    name: {
                        label: "タイトル",
                        // description: "記事のタイトル",
                        validation: {
                            isRequired: true,
                        },
                    },
                }),
                description: fields.text({
                    label: "description",
                    description: "記事の概要や要約",
                }),
                thumbnail: fields.image({
                    label: "サムネイル",
                    // description: "記事のサムネイル画像",
                    directory: "src/assets/images/blog/",
                    publicPath: "@assets/images/blog/",
                    validation: {
                        isRequired: true,
                    },
                }),
                category: fields.select({
                    label: "カテゴリ",
                    // description: "記事のカテゴリ",
                    options: [
                        { label: "技術", value: "技術" },
                        { label: "日記", value: "日記" },
                        { label: "その他", value: "その他" },
                    ],
                    defaultValue: "その他",
                }),
                tags: fields.array(fields.text({ label: "タグ" }), {
                    label: "タグ",
                    // description: "記事に関連するタグのリスト",
                    itemLabel: (props) => props.value || "タグ",
                }),
                content: fields.markdoc({
                    label: "本文",
                    // description: "記事の本文（Markdown形式）",
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
            slugField: "isbn",
            path: "src/content/books/*",
            format: { contentField: "content" },
            columns: ["draft", "visibility", "title", "publisher"],
            schema: {
                draft: fields.checkbox({
                    label: "下書き",
                    // description: "記事の下書き状態",F
                }),
                visibility: fields.select({
                    label: "公開範囲",
                    // description: "記事の公開範囲設定",
                    options: [
                        { label: "公開", value: "public" },
                        { label: "限定公開", value: "unlisted" },
                        { label: "非公開", value: "private" },
                    ],
                    defaultValue: "public",
                }),
                isbn: fields.slug({
                    name: {
                        label: "ISBN Code",
                        description: "ISBNコード 10文字または13文字",
                        validation: {
                            pattern: {
                                regex: /^$|^(?:\d{10}|\d{13})$/,
                            },
                            isRequired: true,
                        },
                    },
                }),
                title: fields.text({
                    label: "本のタイトル",
                    // description: "本のタイトル",
                    validation: {
                        isRequired: true,
                    },
                }),
                author: fields.text({
                    label: "著者",
                    // description: "著者名",
                    validation: {
                        isRequired: true,
                    },
                }),
                publisher: fields.text({
                    label: "出版社",
                    // description: "出版社名",
                    validation: {
                        isRequired: true,
                    },
                }),
                publishedDate: fields.date({
                    label: "出版日",
                    // description: "本の出版日",
                    validation: {
                        isRequired: true,
                    },
                }),
                description: fields.text({
                    label: "description",
                    description: "本の概要や要約",
                }),
                thumbnail: fields.image({
                    label: "表紙画像",
                    // description: "本の表紙画像",
                    directory: "src/assets/images/books/",
                    publicPath: "@assets/images/books/",
                    validation: {
                        isRequired: true,
                    },
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
                tags: fields.array(fields.text({ label: "タグ" }), {
                    label: "タグ",
                    // description: "本のタグ",
                    itemLabel: (props) => props.value || "タグ",
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
                status: fields.select({
                    label: "読了状態",
                    description: "本の読了状態",
                    options: [
                        { label: "未読", value: "未読" },
                        { label: "読書中", value: "読書中" },
                        { label: "読了", value: "読了" },
                    ],
                    defaultValue: "未読",
                }),
                evaluation: fields.select({
                    label: "評価",
                    description: "星5段階評価",
                    options: [
                        { label: "未評価", value: "未評価" },
                        { label: "1", value: "1" },
                        { label: "2", value: "2" },
                        { label: "3", value: "3" },
                        { label: "4", value: "4" },
                        { label: "5", value: "5" },
                    ],
                    defaultValue: "未評価",
                }),
                content: fields.markdoc({
                    label: "本文",
                    // description: "本の本文（Markdown形式）",
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
            columns: ["draft", "visibility", "name", "brand", "type", "status"],
            schema: {
                draft: fields.checkbox({
                    label: "下書き",
                    // description: "記事の下書き状態",F
                }),
                visibility: fields.select({
                    label: "公開範囲",
                    // description: "記事の公開範囲設定",
                    options: [
                        { label: "公開", value: "public" },
                        { label: "限定公開", value: "unlisted" },
                        { label: "非公開", value: "private" },
                    ],
                    defaultValue: "public",
                }),
                name: fields.slug({
                    name: {
                        label: "モデル名",
                        description: "例: Stratocaster ST62",
                        validation: {
                            isRequired: true,
                        },
                    },
                }),
                brand: fields.text({
                    label: "ブランド",
                    description: "楽器のブランド名",
                    validation: {
                        isRequired: true,
                    },
                }),
                type: fields.select({
                    label: "楽器の種類",
                    description: "https://jp.yamaha.com/products/musical_instruments/index.html",
                    options: [
                        { label: "ピアノ・電子ピアノ", value: "ピアノ・電子ピアノ" },
                        { label: "エレクトーン・キーボード", value: "エレクトーン・キーボード" },
                        { label: "ギター・ベース・アンプ", value: "ギター・ベース・アンプ" },
                        { label: "ドラム", value: "ドラム" },
                        { label: "管楽器・吹奏楽器", value: "管楽器・吹奏楽器" },
                        { label: "弦楽器", value: "弦楽器" },
                        { label: "コンサートパーカッション", value: "コンサートパーカッション" },
                        { label: "マーチング楽器", value: "マーチング楽器" },
                        { label: "その他", value: "その他" },
                    ],
                    defaultValue: "管楽器・吹奏楽器",
                }),
                instrumentName: fields.text({
                    label: "楽器名",
                    description: "https://jp.yamaha.com/products/musical_instruments/index.html 例: トランペット",
                    validation: {
                        isRequired: true,
                    },
                }),
                manufactureYear: fields.integer({
                    label: "製造年",
                    description: "楽器の製造年",
                }),
                serialNumber: fields.text({
                    label: "製造番号",
                    description: "楽器の製造番号",
                }),
                thumbnail: fields.image({
                    label: "楽器のサムネイル",
                    description: "楽器のサムネイル",
                    directory: "src/assets/images/instruments/",
                    publicPath: "@assets/images/instruments/",
                    validation: {
                        isRequired: true,
                    },
                }),
                images: fields.array(
                    fields.image({
                        label: "楽器の写真",
                        description: "楽器の写真",
                        directory: "src/assets/images/instruments/",
                        publicPath: "@assets/images/instruments/",
                        validation: {
                            isRequired: true,
                        },
                    }),
                    {
                        label: "楽器の写真",
                        description: "楽器の写真",
                        itemLabel: (props) => props.value?.filename || "写真",
                    }
                ),
                purchaseDate: fields.date({
                    label: "入手日",
                    description: "楽器の入手日",
                }),
                purchasePrice: fields.integer({
                    label: "入手価格",
                    description: "楽器の入手価格",
                    defaultValue: 0,
                }),
                status: fields.select({
                    label: "ステータス",
                    description: "楽器のステータス",
                    options: [
                        { label: "使用中", value: "使用中" },
                        { label: "修理中", value: "修理中" },
                        { label: "修理済み", value: "修理済み" },
                        { label: "売却済み", value: "売却済み" },
                    ],
                    defaultValue: "使用中",
                }),
                content: fields.markdoc({
                    label: "本文",
                    // description: "記事の本文（Markdown形式）",
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
            columns: ["draft", "visibility", "name", "status"],
            schema: {
                draft: fields.checkbox({
                    label: "下書き",
                    // description: "記事の下書き状態",
                }),
                visibility: fields.select({
                    label: "公開範囲",
                    // description: "記事の公開範囲設定",
                    options: [
                        { label: "公開", value: "public" },
                        { label: "限定公開", value: "unlisted" },
                        { label: "非公開", value: "private" },
                    ],
                    defaultValue: "public",
                }),
                name: fields.slug({
                    name: {
                        label: "資格名",
                        description: "例: 基本情報技術者試験",
                        validation: {
                            isRequired: true,
                        },
                    },
                }),
                organization: fields.text({
                    label: "実施団体",
                    description: "例: IPA",
                    validation: {
                        isRequired: true,
                    },
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
                        { label: "福祉", value: "福祉" },
                        { label: "医療", value: "医療" },
                        { label: "その他", value: "その他" },
                    ],
                    defaultValue: "その他",
                }),
                tags: fields.array(fields.text({ label: "タグ" }), {
                    label: "タグ",
                    // description: "記事に関連するタグのリスト",
                    itemLabel: (props) => props.value || "タグ",
                }),
                status: fields.select({
                    label: "ステータス",
                    description: "資格の取得状況",
                    options: [
                        { label: "取得済み", value: "取得済み" },
                        { label: "未取得", value: "未取得" },
                        { label: "受験済み", value: "受験済み" },
                        { label: "学習中", value: "学習中" },
                    ],
                    defaultValue: "学習中",
                }),
                acquiredDate: fields.date({
                    label: "取得日",
                    description: "資格の取得日",
                }),
                validityPeriod: fields.date({
                    label: "有効期限",
                    description: "資格の有効期限",
                }),
                score: fields.text({
                    label: "スコア",
                    description: "スコアや得点",
                }),
                certificateNumber: fields.text({
                    label: "証明書番号",
                    description: "証明書の番号",
                }),
                thumbnail: fields.image({
                    label: "証明書画像",
                    description: "証明書の画像",
                    directory: "src/assets/images/qualifications/",
                    publicPath: "@assets/images/qualifications/",
                }),
                content: fields.markdoc({
                    label: "本文",
                    // description: "記事の本文（Markdown形式）",
                }),
            },
        }),
    },
});

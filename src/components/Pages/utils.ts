import { getCollection, type CollectionEntry } from "astro:content";

export type SectionConfig = {
    collectionName:
        | "blog"
        | "books"
        | "qualifications"
        | "instruments"
        | "playground";
    sectionName: string;
    sectionSlug: string;
    sortField?: string | readonly string[];
    countLabel?: string;
    categoryField?: string;
};

/**
 * コレクションから公開記事を取得してフィルタリング
 */
export async function getPublicPosts(
    collectionName:
        | "blog"
        | "books"
        | "qualifications"
        | "instruments"
        | "playground"
) {
    const allPosts = await getCollection(collectionName);
    const publishedPosts = allPosts.filter((post) => !post.data.draft);
    const publicPosts = publishedPosts.filter(
        (post) => post.data.visibility === "public"
    );
    return publicPosts;
}

/**
 * 投稿を日付でソート
 */
export function sortPostsByDate(
    posts: any[],
    dateFields: string | readonly string[]
): any[] {
    const fields = Array.isArray(dateFields) ? [...dateFields] : [dateFields];

    return [...posts].sort((a, b) => {
        // 最初に見つかった有効な日付フィールドを使用
        let dateA: Date | null = null;
        let dateB: Date | null = null;

        for (const field of fields) {
            if (a.data[field]) {
                dateA = new Date(a.data[field]);
                break;
            }
        }

        for (const field of fields) {
            if (b.data[field]) {
                dateB = new Date(b.data[field]);
                break;
            }
        }

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        return dateB.getTime() - dateA.getTime();
    });
}

/**
 * タグごとにグループ化
 */
export function groupByTag(posts: any[]): Record<string, any[]> {
    return posts.reduce((acc, post) => {
        if (post.data.tags && post.data.tags.length > 0) {
            post.data.tags.forEach((tag: string) => {
                if (!acc[tag]) {
                    acc[tag] = [];
                }
                acc[tag].push(post);
            });
        }
        return acc;
    }, {} as Record<string, any[]>);
}

/**
 * カテゴリーごとにグループ化
 */
export function groupByCategory(
    posts: any[],
    categoryField: string = "category"
): Record<string, any[]> {
    return posts.reduce((acc, post) => {
        const category = post.data[categoryField];
        if (!acc[category]) {
            acc[category] = [];
        }
        acc[category].push(post);
        return acc;
    }, {} as Record<string, any[]>);
}

/**
 * タグごとにグループ化し、各グループ内でソート
 */
export function getPostsByTagSorted(
    posts: any[],
    dateFields: string | readonly string[]
): Record<string, any[]> {
    const postsByTag = groupByTag(posts);

    Object.keys(postsByTag).forEach((tag) => {
        postsByTag[tag] = sortPostsByDate(postsByTag[tag], dateFields);
    });

    return postsByTag;
}

/**
 * カテゴリーごとにグループ化し、各グループ内でソート
 */
export function getPostsByCategorySorted(
    posts: any[],
    dateFields: string | readonly string[],
    categoryField: string = "category"
): Record<string, any[]> {
    const postsByCategory = groupByCategory(posts, categoryField);

    Object.keys(postsByCategory).forEach((category) => {
        postsByCategory[category] = sortPostsByDate(
            postsByCategory[category],
            dateFields
        );
    });

    return postsByCategory;
}

/**
 * getStaticPaths用のタグパスを生成
 */
export function generateTagPaths(
    postsByTag: Record<string, any[]>
): Array<{ params: { slug: string }; props: any }> {
    return Object.keys(postsByTag).map((tag) => ({
        params: { slug: tag },
        props: { tag, postsByTag },
    }));
}

/**
 * getStaticPaths用のカテゴリーパスを生成
 */
export function generateCategoryPaths(
    postsByCategory: Record<string, any[]>
): Array<{ params: { slug: string }; props: any }> {
    return Object.keys(postsByCategory).map((category) => ({
        params: { slug: category },
        props: { category, postsByCategory },
    }));
}

/**
 * セクション設定のプリセット
 */
export const SECTION_CONFIGS = {
    blog: {
        collectionName: "blog" as const,
        sectionName: "ブログ",
        sectionSlug: "blog",
        sortField: ["updatedDate", "publishedDate"],
        countLabel: "件の記事",
    },
    books: {
        collectionName: "books" as const,
        sectionName: "蔵書",
        sectionSlug: "book",
        sortField: "publishedDate",
        countLabel: "件の蔵書",
    },
    qualifications: {
        collectionName: "qualifications" as const,
        sectionName: "資格",
        sectionSlug: "qualifications",
        sortField: "acquiredDate",
        countLabel: "件の資格",
    },
    instruments: {
        collectionName: "instruments" as const,
        sectionName: "楽器",
        sectionSlug: "instruments",
        sortField: "purchaseDate",
        countLabel: "件の楽器",
        categoryField: "type", // instrumentsではtypeフィールドをカテゴリーとして使用
    },
    playground: {
        collectionName: "playground" as const,
        sectionName: "Playground",
        sectionSlug: "playground",
        sortField: "publishedDate",
        countLabel: "件のプロジェクト",
    },
} as const;

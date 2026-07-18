/**
 * カテゴリー/タグ別グループ表示 + ItemList (グリッド/詳細切り替え)
 * CategoryDetailPage / TagDetailPage / CategorysListPage / TagsListPage の
 * 中身を担う共通Reactコンポーネント。
 */
import ItemList, { type ItemData, type ItemKind } from "@/components/ViewToggle/ItemList";

// ────────────────────────────────────────────────
// Astroのコレクションエントリを ItemData に変換
// ────────────────────────────────────────────────
function toItemData(post: any, kind: ItemKind): ItemData {
    const d = post.data;
    const base = {
        kind,
        href: buildHref(post, kind),
        title: d.title ?? d.name ?? post.slug,
        thumbnailSrc: d.thumbnail?.src,
    };
    switch (kind) {
        case "blog":
            return {
                ...base,
                publishedDate: d.publishedDate?.toString(),
                updatedDate: d.updatedDate?.toString(),
                description: d.description,
                category: d.category,
                tags: d.tags,
            };
        case "book":
            return {
                ...base,
                author: d.author,
                publisher: d.publisher,
                publishedDate: d.publishedDate?.toString(),
                description: d.description,
                category: d.category,
                tags: d.tags,
                status: d.status,
                format: d.format,
                evaluation: d.evaluation,
            };
        case "playground":
            return {
                ...base,
                publishedDate: d.publishedDate?.toString(),
                updatedDate: d.updatedDate?.toString(),
                description: d.description,
                category: d.category,
                tags: d.tags,
            };
        case "instrument":
            return {
                ...base,
                brand: d.brand,
                instrumentName: d.instrumentName,
                category: d.type,
                tags: d.tags,
                purchaseDate: d.purchaseDate?.toString(),
                status: d.status,
            };
        case "qualification":
            return {
                ...base,
                organization: d.organization,
                category: d.category,
                tags: d.tags,
                status: d.status,
                acquiredDate: d.acquiredDate?.toString(),
                score: d.score,
            };
    }
}

function buildHref(post: any, kind: ItemKind): string {
    const slugMap: Record<ItemKind, string> = {
        blog: "blog",
        book: "book",
        playground: "playground",
        instrument: "instruments",
        qualification: "qualifications",
    };
    const id = post.id ?? post.slug;
    return `/${slugMap[kind]}/${id}/`;
}

// ────────────────────────────────────────────────
// 他カテゴリー/タグへのリンク
// ────────────────────────────────────────────────
interface OtherLinksProps {
    others: string[];
    countMap: Record<string, any[]>;
    sectionSlug: string;
    type: "categorys" | "tags";
    label: string;
}

function OtherLinks({ others, countMap, sectionSlug, type, label }: OtherLinksProps) {
    if (others.length === 0) return null;
    return (
        <div className="mt-12">
            <h2 className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">
                {label}
            </h2>
            <div className="flex flex-wrap gap-2">
                {others.map((o) => (
                    <a
                        key={o}
                        href={`/${sectionSlug}/${type}/${o}`}
                        title={o}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-white hover:bg-gray-50 rounded border border-gray-300 shadow-sm hover:shadow transition-shadow whitespace-nowrap"
                    >
                        <span className="font-semibold text-gray-900 text-sm">
                            {type === "tags" ? `#${o}` : o}
                        </span>
                        <span className="text-xs text-gray-500">{countMap[o]?.length ?? 0}件</span>
                    </a>
                ))}
                <a
                    href={`/${sectionSlug}/${type}/`}
                    title={`${type === "tags" ? "タグ" : "カテゴリー"}一覧を見る`}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 shadow-sm hover:shadow transition-shadow font-semibold text-gray-800 whitespace-nowrap text-sm"
                >
                    一覧を見る →
                </a>
            </div>
        </div>
    );
}

// ────────────────────────────────────────────────
// 単一グループ表示（CategoryDetail / TagDetail）
// ────────────────────────────────────────────────
interface SingleGroupProps {
    heading: string;
    posts: any[];
    kind: ItemKind;
    others: string[];
    countMap: Record<string, any[]>;
    sectionSlug: string;
    groupType: "categorys" | "tags";
}

export function SingleGroupView({
    heading,
    posts,
    kind,
    others,
    countMap,
    sectionSlug,
    groupType,
}: SingleGroupProps) {
    const items = posts.map((p) => toItemData(p, kind));
    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-6">{heading}</h1>
            {items.length === 0 ? (
                <p className="text-center text-gray-500">該当する項目がありません</p>
            ) : (
                <ItemList items={items} />
            )}
            <OtherLinks
                others={others}
                countMap={countMap}
                sectionSlug={sectionSlug}
                type={groupType}
                label={groupType === "tags" ? "他のタグ" : "他のカテゴリー"}
            />
        </div>
    );
}

// ────────────────────────────────────────────────
// 全グループ一覧表示（CategorysList / TagsList）
// ────────────────────────────────────────────────
interface AllGroupsProps {
    heading: string;
    groupedPosts: Record<string, any[]>;
    kind: ItemKind;
    groupType: "categorys" | "tags";
    sectionSlug: string;
}

export function AllGroupsView({
    heading,
    groupedPosts,
    kind,
    groupType,
    sectionSlug,
}: AllGroupsProps) {
    const sorted = Object.keys(groupedPosts).sort((a, b) => a.localeCompare(b, "ja"));

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-8">{heading}</h1>
            {sorted.length === 0 ? (
                <p className="text-center text-gray-500">該当する項目がありません</p>
            ) : (
                sorted.map((group) => {
                    const items = groupedPosts[group].map((p) => toItemData(p, kind));
                    return (
                        <section key={group} className="mb-10">
                            <h2
                                id={group}
                                className="text-xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-gray-200"
                            >
                                <a
                                    href={`/${sectionSlug}/${groupType}/${group}`}
                                    className="hover:underline"
                                >
                                    {groupType === "tags" ? `#${group}` : group}
                                </a>
                                <span className="ml-2 text-sm font-normal text-gray-400">
                                    {items.length}件
                                </span>
                            </h2>
                            <ItemList items={items} />
                        </section>
                    );
                })
            )}
        </div>
    );
}

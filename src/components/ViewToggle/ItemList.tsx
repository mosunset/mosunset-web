import { useEffect } from "react";
import GridCard from "./GridCard";
import DataTable from "./DataTable";
import { useViewStore } from "@/stores/viewStore";

// ────────────────────────────────────────────────
// 共通型（DataTable.tsxと共有）
// ────────────────────────────────────────────────
export type ItemKind = "blog" | "book" | "playground" | "instrument" | "qualification";

export interface ItemData {
    kind: ItemKind;
    href: string;
    title: string;
    thumbnailSrc?: string;
    // blog / playground
    publishedDate?: string;
    updatedDate?: string;
    description?: string;
    category?: string;
    tags?: string[];
    // book
    author?: string;
    publisher?: string;
    status?: string;
    format?: string;
    evaluation?: string;
    // instrument
    brand?: string;
    instrumentName?: string;
    purchaseDate?: string;
    // qualification
    organization?: string;
    acquiredDate?: string;
    score?: string;
}

function aspectFor(kind: ItemKind) {
    return kind === "book" ? "aspect-[2/3]" : "aspect-[3/2]";
}

// ────────────────────────────────────────────────
// メインコンポーネント
// ────────────────────────────────────────────────
interface ItemListProps {
    items: ItemData[];
}

export default function ItemList({ items }: ItemListProps) {
    const { view, setView, _hydrated } = useViewStore();

    // ハイドレーション完了前は何も描画しない（フラッシュ防止）
    if (!_hydrated) return null;

    return (
        <div>
            {/* ツールバー */}
            <div className="flex items-center justify-end gap-1 mb-4">
                {/* グリッドボタン */}
                <button
                    onClick={() => setView("grid")}
                    aria-label="グリッド表示"
                    title="グリッド表示"
                    className={`p-1.5 rounded transition-colors ${
                        view === "grid"
                            ? "bg-gray-200 text-gray-900"
                            : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    }`}
                >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <rect x="1" y="1" width="7" height="7" rx="1" fill="currentColor" />
                        <rect x="10" y="1" width="7" height="7" rx="1" fill="currentColor" />
                        <rect x="1" y="10" width="7" height="7" rx="1" fill="currentColor" />
                        <rect x="10" y="10" width="7" height="7" rx="1" fill="currentColor" />
                    </svg>
                </button>
                {/* 詳細ボタン */}
                <button
                    onClick={() => setView("detail")}
                    aria-label="詳細表示"
                    title="詳細表示"
                    className={`p-1.5 rounded transition-colors ${
                        view === "detail"
                            ? "bg-gray-200 text-gray-900"
                            : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    }`}
                >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                        <rect x="1" y="2" width="4" height="4" rx="0.5" fill="currentColor" />
                        <rect x="7" y="3" width="10" height="2" rx="1" fill="currentColor" />
                        <rect x="1" y="7" width="4" height="4" rx="0.5" fill="currentColor" />
                        <rect x="7" y="8" width="10" height="2" rx="1" fill="currentColor" />
                        <rect x="1" y="12" width="4" height="4" rx="0.5" fill="currentColor" />
                        <rect x="7" y="13" width="10" height="2" rx="1" fill="currentColor" />
                    </svg>
                </button>
            </div>

            {/* グリッド表示: 最小2列・最大4列 */}
            {view === "grid" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {items.map((item) => (
                        <GridCard
                            key={item.href}
                            href={item.href}
                            title={item.title}
                            thumbnailSrc={item.thumbnailSrc}
                            aspectClass={aspectFor(item.kind)}
                        />
                    ))}
                </div>
            )}

            {/* 詳細表示: DataTable（ソート・検索付き） */}
            {view === "detail" && (
                <DataTable kind={items[0]?.kind ?? "blog"} items={items} />
            )}
        </div>
    );
}

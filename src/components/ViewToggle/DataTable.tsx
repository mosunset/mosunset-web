import { useState, useMemo } from "react";
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
    type ColumnDef,
    type SortingState,
} from "@tanstack/react-table";
import {
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Search,
    ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table";
import Badge from "./Badge";
import ImageLightbox from "./ImageLightbox";
import type { ItemData, ItemKind } from "./ItemList";

// ────────────────────────────────────────────────
// ソートボタン付きヘッダー
// ────────────────────────────────────────────────
function SortHeader({ column, label }: { column: any; label: string }) {
    const sorted = column.getIsSorted();
    return (
        <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 font-medium text-gray-500 hover:text-gray-900"
            onClick={() => column.toggleSorting(sorted === "asc")}
        >
            {label}
            {sorted === "asc" ? (
                <ArrowUp className="ml-1 h-3.5 w-3.5" />
            ) : sorted === "desc" ? (
                <ArrowDown className="ml-1 h-3.5 w-3.5" />
            ) : (
                <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />
            )}
        </Button>
    );
}

// ────────────────────────────────────────────────
// 日付フォーマット
// ────────────────────────────────────────────────
function fmtDate(d?: string) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ja-JP");
}

// ────────────────────────────────────────────────
// サムネイルセル（ホバープレビュー + ライトボックス）
// ────────────────────────────────────────────────
function ThumbCell({ thumbnailSrc, title, href }: { thumbnailSrc?: string; title: string; href: string }) {
    const [lightbox, setLightbox] = useState(false);

    return (
        <>
            <div className="relative group/thumb shrink-0 w-10 h-10">
                <a href={href} title={title} className="block w-full h-full">
                    <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 flex items-center justify-center border border-gray-100">
                        {thumbnailSrc ? (
                            <img
                                src={thumbnailSrc}
                                alt={title}
                                loading="lazy"
                                className="w-full h-full object-contain"
                            />
                        ) : (
                            <span className="text-gray-300 text-lg">📄</span>
                        )}
                    </div>
                </a>

                {/* 拡大ボタン（サムネあり時のみ、ホバーで表示） */}
                {thumbnailSrc && (
                    <button
                        onClick={() => setLightbox(true)}
                        aria-label={`${title} を拡大表示`}
                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity bg-black/40 rounded"
                    >
                        <ZoomIn className="w-4 h-4 text-white" />
                    </button>
                )}
            </div>

            {lightbox && thumbnailSrc && (
                <ImageLightbox
                    src={thumbnailSrc}
                    alt={title}
                    href={href}
                    onClose={() => setLightbox(false)}
                />
            )}
        </>
    );
}

// ────────────────────────────────────────────────
// コレクション種別ごとの列定義
// ────────────────────────────────────────────────
function buildColumns(kind: ItemKind): ColumnDef<ItemData>[] {
    const thumbCol: ColumnDef<ItemData> = {
        id: "thumbnail",
        header: "",
        enableSorting: false,
        size: 48,
        cell: ({ row }) => {
            const { thumbnailSrc, title, href } = row.original;
            return <ThumbCell thumbnailSrc={thumbnailSrc} title={title} href={href} />;
        },
    };

    const titleCol: ColumnDef<ItemData> = {
        accessorKey: "title",
        header: ({ column }) => <SortHeader column={column} label="タイトル" />,
        cell: ({ row }) => (
            <a
                href={row.original.href}
                title={row.original.title}
                className="font-medium text-gray-900 hover:underline line-clamp-2"
            >
                {row.original.title}
            </a>
        ),
        filterFn: "includesString",
    };

    switch (kind) {
        case "blog":
            return [
                thumbCol,
                titleCol,
                {
                    accessorKey: "category",
                    header: ({ column }) => <SortHeader column={column} label="カテゴリ" />,
                    cell: ({ row }) =>
                        row.original.category ? (
                            <span className="text-xs text-gray-600">{row.original.category}</span>
                        ) : null,
                    filterFn: "includesString",
                },
                {
                    accessorKey: "publishedDate",
                    header: ({ column }) => <SortHeader column={column} label="公開日" />,
                    cell: ({ row }) => (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                            {fmtDate(row.original.publishedDate)}
                        </span>
                    ),
                    sortingFn: "datetime",
                },
                {
                    id: "tags",
                    header: "タグ",
                    enableSorting: false,
                    cell: ({ row }) => (
                        <div className="flex flex-wrap gap-1">
                            {row.original.tags?.map((t) => (
                                <Badge key={t} text={`#${t}`} variant="gray" />
                            ))}
                        </div>
                    ),
                },
            ];

        case "book":
            return [
                thumbCol,
                titleCol,
                {
                    accessorKey: "author",
                    header: ({ column }) => <SortHeader column={column} label="著者" />,
                    cell: ({ row }) => (
                        <span className="text-sm text-gray-700">{row.original.author ?? "—"}</span>
                    ),
                    filterFn: "includesString",
                },
                {
                    accessorKey: "publisher",
                    header: ({ column }) => <SortHeader column={column} label="出版社" />,
                    cell: ({ row }) => (
                        <span className="text-sm text-gray-600">{row.original.publisher ?? "—"}</span>
                    ),
                    filterFn: "includesString",
                },
                {
                    accessorKey: "publishedDate",
                    header: ({ column }) => <SortHeader column={column} label="出版日" />,
                    cell: ({ row }) => (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                            {fmtDate(row.original.publishedDate)}
                        </span>
                    ),
                    sortingFn: "datetime",
                },
                {
                    accessorKey: "status",
                    header: ({ column }) => <SortHeader column={column} label="状態" />,
                    cell: ({ row }) => {
                        const s = row.original.status;
                        if (!s) return null;
                        return (
                            <Badge
                                text={s}
                                variant={s === "読了" ? "green" : s === "読書中" ? "blue" : "gray"}
                            />
                        );
                    },
                    filterFn: "includesString",
                },
                {
                    accessorKey: "evaluation",
                    header: ({ column }) => <SortHeader column={column} label="評価" />,
                    cell: ({ row }) => {
                        const e = row.original.evaluation;
                        if (!e || e === "未評価") return <span className="text-gray-400 text-xs">—</span>;
                        return <Badge text={`★${e}`} variant="yellow" />;
                    },
                    filterFn: "includesString",
                },
                {
                    id: "tags",
                    header: "タグ",
                    enableSorting: false,
                    cell: ({ row }) => (
                        <div className="flex flex-wrap gap-1">
                            {row.original.tags?.map((t) => (
                                <Badge key={t} text={`#${t}`} variant="gray" />
                            ))}
                        </div>
                    ),
                },
            ];

        case "playground":
            return [
                thumbCol,
                titleCol,
                {
                    accessorKey: "category",
                    header: ({ column }) => <SortHeader column={column} label="カテゴリ" />,
                    cell: ({ row }) => (
                        <span className="text-xs text-gray-600">{row.original.category ?? "—"}</span>
                    ),
                    filterFn: "includesString",
                },
                {
                    accessorKey: "description",
                    header: "説明",
                    enableSorting: false,
                    cell: ({ row }) => (
                        <span className="text-xs text-gray-500 line-clamp-2">
                            {row.original.description ?? "—"}
                        </span>
                    ),
                    filterFn: "includesString",
                },
                {
                    accessorKey: "publishedDate",
                    header: ({ column }) => <SortHeader column={column} label="公開日" />,
                    cell: ({ row }) => (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                            {fmtDate(row.original.publishedDate)}
                        </span>
                    ),
                    sortingFn: "datetime",
                },
            ];

        case "instrument":
            return [
                thumbCol,
                titleCol,
                {
                    accessorKey: "brand",
                    header: ({ column }) => <SortHeader column={column} label="ブランド" />,
                    cell: ({ row }) => (
                        <span className="text-sm text-gray-700">{row.original.brand ?? "—"}</span>
                    ),
                    filterFn: "includesString",
                },
                {
                    accessorKey: "instrumentName",
                    header: ({ column }) => <SortHeader column={column} label="楽器名" />,
                    cell: ({ row }) => (
                        <span className="text-sm text-gray-600">{row.original.instrumentName ?? "—"}</span>
                    ),
                    filterFn: "includesString",
                },
                {
                    accessorKey: "category",
                    header: ({ column }) => <SortHeader column={column} label="種別" />,
                    cell: ({ row }) => (
                        <span className="text-xs text-gray-600">{row.original.category ?? "—"}</span>
                    ),
                    filterFn: "includesString",
                },
                {
                    accessorKey: "status",
                    header: ({ column }) => <SortHeader column={column} label="状態" />,
                    cell: ({ row }) => {
                        const s = row.original.status;
                        if (!s) return null;
                        return (
                            <Badge
                                text={s}
                                variant={s === "使用中" ? "green" : s === "売却済み" ? "gray" : "yellow"}
                            />
                        );
                    },
                    filterFn: "includesString",
                },
                {
                    accessorKey: "purchaseDate",
                    header: ({ column }) => <SortHeader column={column} label="入手日" />,
                    cell: ({ row }) => (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                            {fmtDate(row.original.purchaseDate)}
                        </span>
                    ),
                    sortingFn: "datetime",
                },
            ];

        case "qualification":
            return [
                thumbCol,
                titleCol,
                {
                    accessorKey: "organization",
                    header: ({ column }) => <SortHeader column={column} label="実施団体" />,
                    cell: ({ row }) => (
                        <span className="text-sm text-gray-700">{row.original.organization ?? "—"}</span>
                    ),
                    filterFn: "includesString",
                },
                {
                    accessorKey: "category",
                    header: ({ column }) => <SortHeader column={column} label="カテゴリ" />,
                    cell: ({ row }) => (
                        <span className="text-xs text-gray-600">{row.original.category ?? "—"}</span>
                    ),
                    filterFn: "includesString",
                },
                {
                    accessorKey: "status",
                    header: ({ column }) => <SortHeader column={column} label="状態" />,
                    cell: ({ row }) => {
                        const s = row.original.status;
                        if (!s) return null;
                        return (
                            <Badge
                                text={s}
                                variant={s === "取得済み" ? "green" : "yellow"}
                            />
                        );
                    },
                    filterFn: "includesString",
                },
                {
                    accessorKey: "acquiredDate",
                    header: ({ column }) => <SortHeader column={column} label="取得日" />,
                    cell: ({ row }) => (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                            {fmtDate(row.original.acquiredDate)}
                        </span>
                    ),
                    sortingFn: "datetime",
                },
                {
                    accessorKey: "score",
                    header: ({ column }) => <SortHeader column={column} label="スコア" />,
                    cell: ({ row }) => (
                        <span className="text-sm text-gray-600">{row.original.score ?? "—"}</span>
                    ),
                    filterFn: "includesString",
                },
            ];
    }
}

// ────────────────────────────────────────────────
// DataTable 本体
// ────────────────────────────────────────────────
interface DataTableProps {
    kind: ItemKind;
    items: ItemData[];
}

export default function DataTable({ kind, items }: DataTableProps) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = useState("");

    const columns = useMemo(() => buildColumns(kind), [kind]);

    const table = useReactTable({
        data: items,
        columns,
        state: { sorting, globalFilter },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        globalFilterFn: "includesString",
    });

    const rows = table.getRowModel().rows;

    return (
        <div className="space-y-3">
            {/* 検索バー */}
            <div className="relative max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                    placeholder="検索..."
                    value={globalFilter}
                    onChange={(e) => setGlobalFilter(e.target.value)}
                    className="pl-8"
                />
            </div>

            {/* テーブル */}
            <Table>
                <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                        <TableRow key={hg.id}>
                            {hg.headers.map((header) => (
                                <TableHead
                                    key={header.id}
                                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                                >
                                    {header.isPlaceholder
                                        ? null
                                        : flexRender(header.column.columnDef.header, header.getContext())}
                                </TableHead>
                            ))}
                        </TableRow>
                    ))}
                </TableHeader>
                <TableBody>
                    {rows.length > 0 ? (
                        rows.map((row) => (
                            <TableRow key={row.id}>
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell key={cell.id}>
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell
                                colSpan={columns.length}
                                className="h-24 text-center text-gray-400"
                            >
                                該当する項目がありません
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            {/* 件数 */}
            <p className="text-xs text-gray-400 text-right">
                {rows.length} / {items.length} 件
            </p>
        </div>
    );
}

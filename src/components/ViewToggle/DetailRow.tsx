import type { ReactNode } from "react";

interface DetailRowProps {
    href: string;
    title: string;
    thumbnailSrc?: string;
    thumbnailAlt?: string;
    /** タイトル右横に並べるメタ情報 */
    meta?: ReactNode;
    /** 右端に並べるバッジ類 */
    badges?: ReactNode;
}

export default function DetailRow({
    href,
    title,
    thumbnailSrc,
    thumbnailAlt,
    meta,
    badges,
}: DetailRowProps) {
    return (
        <a
            href={href}
            title={title}
            className="group flex items-center gap-3 px-2 py-2 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 transition-colors"
        >
            {/* サムネイル（固定サイズ） */}
            <div className="shrink-0 w-10 h-10 rounded overflow-hidden bg-gray-100 flex items-center justify-center">
                {thumbnailSrc ? (
                    <img
                        src={thumbnailSrc}
                        alt={thumbnailAlt ?? title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <svg
                        className="w-5 h-5 text-gray-300"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                    >
                        <path d="M4 4h16v16H4z" opacity=".2" />
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16z" />
                    </svg>
                )}
            </div>

            {/* タイトル + メタ情報 */}
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate group-hover:text-gray-700">
                    {title}
                </p>
                {meta && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        {meta}
                    </div>
                )}
            </div>

            {/* バッジ類（右端） */}
            {badges && (
                <div className="shrink-0 flex flex-wrap items-center gap-1.5 justify-end">
                    {badges}
                </div>
            )}
        </a>
    );
}

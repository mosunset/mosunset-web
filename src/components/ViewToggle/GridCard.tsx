import { useState } from "react";
import { ZoomIn } from "lucide-react";
import ImageLightbox from "./ImageLightbox";

interface GridCardProps {
    href: string;
    title: string;
    thumbnailSrc?: string;
    thumbnailAlt?: string;
    /** aspect ratio class e.g. "aspect-[2/3]" or "aspect-[3/2]" */
    aspectClass?: string;
}

export default function GridCard({
    href,
    title,
    thumbnailSrc,
    thumbnailAlt,
    aspectClass = "aspect-[3/2]",
}: GridCardProps) {
    const [lightbox, setLightbox] = useState(false);

    return (
        <>
            <div className="group flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-gray-100 transition-colors">
                {/* サムネイルエリア */}
                <div className={`relative w-full ${aspectClass} overflow-hidden rounded bg-gray-50 border border-gray-100 flex items-center justify-center`}>
                    {thumbnailSrc ? (
                        <>
                            {/* メイン画像: object-contain で全体表示 */}
                            <a href={href} title={title} className="block w-full h-full">
                                <img
                                    src={thumbnailSrc}
                                    alt={thumbnailAlt ?? title}
                                    loading="lazy"
                                    className="w-full h-full object-contain transition-transform duration-200 group-hover:scale-105"
                                />
                            </a>

                            {/* 拡大ボタン（ホバーで表示） */}
                            <button
                                onClick={() => setLightbox(true)}
                                aria-label={`${title} を拡大表示`}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70 text-white rounded p-1"
                            >
                                <ZoomIn className="w-3.5 h-3.5" />
                            </button>
                        </>
                    ) : (
                        /* サムネイルなし */
                        <a href={href} title={title} className="flex items-center justify-center w-full h-full">
                            <svg
                                className="w-8 h-8 text-gray-300"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                            >
                                <path d="M4 4h16v16H4z" opacity=".2" />
                                <path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 18H4V4h16v16z" />
                            </svg>
                        </a>
                    )}
                </div>

                {/* タイトル */}
                <a href={href} title={title} className="w-full">
                    <p className="w-full text-sm text-center text-gray-800 leading-snug line-clamp-2 break-words hover:underline">
                        {title}
                    </p>
                </a>
            </div>

            {/* ライトボックス */}
            {lightbox && thumbnailSrc && (
                <ImageLightbox
                    src={thumbnailSrc}
                    alt={thumbnailAlt ?? title}
                    href={href}
                    onClose={() => setLightbox(false)}
                />
            )}
        </>
    );
}

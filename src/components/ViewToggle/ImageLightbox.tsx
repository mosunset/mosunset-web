import { useEffect, useCallback } from "react";
import { X, ExternalLink } from "lucide-react";

interface ImageLightboxProps {
    src: string;
    alt: string;
    href?: string;
    onClose: () => void;
}

export default function ImageLightbox({ src, alt, href, onClose }: ImageLightboxProps) {
    // ESCキーで閉じる
    const handleKey = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        },
        [onClose]
    );

    useEffect(() => {
        document.addEventListener("keydown", handleKey);
        // スクロール禁止
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", handleKey);
            document.body.style.overflow = "";
        };
    }, [handleKey]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label={alt}
        >
            {/* 画像コンテナ — クリックで閉じないようにstop */}
            <div
                className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={src}
                    alt={alt}
                    className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
                />

                {/* 閉じるボタン */}
                <button
                    onClick={onClose}
                    aria-label="閉じる"
                    className="absolute -top-3 -right-3 bg-white rounded-full p-1 shadow-lg hover:bg-gray-100 transition-colors"
                >
                    <X className="w-4 h-4 text-gray-700" />
                </button>

                {/* 詳細ページリンク */}
                {href && (
                    <a
                        href={href}
                        aria-label="詳細ページへ"
                        title="詳細ページへ"
                        className="absolute -bottom-3 right-0 flex items-center gap-1 bg-white rounded-full px-2.5 py-1 shadow-lg hover:bg-gray-100 transition-colors text-xs text-gray-700"
                    >
                        <ExternalLink className="w-3 h-3" />
                        詳細へ
                    </a>
                )}
            </div>
        </div>
    );
}

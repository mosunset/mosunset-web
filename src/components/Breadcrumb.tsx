import { useEffect, useState } from "react";

interface Crumb {
    name: string;
    href: string;
}

export default function Breadcrumb() {
    const [crumbs, setCrumbs] = useState<Crumb[]>([]);

    useEffect(() => {
        const segments = window.location.pathname.split("/").filter(Boolean);
        if (segments.length < 2) {
            setCrumbs([]);
            return;
        }
        const built: Crumb[] = [{ name: "Home", href: "/" }];
        let current = "";
        for (const seg of segments) {
            current += `/${seg}`;
            built.push({ name: decodeURIComponent(seg).replace(/-/g, " "), href: current });
        }
        setCrumbs(built);
    }, []);

    if (crumbs.length === 0) return null;

    return (
        <nav className="w-full py-2 mb-4 text-sm" aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-gray-600">
                {crumbs.map((c, idx) => (
                    <li key={c.href} className="flex items-center">
                        {idx === crumbs.length - 1 ? (
                            <span className="text-gray-900" aria-current="page">
                                {c.name}
                            </span>
                        ) : (
                            <a
                                href={c.href}
                                className="hover:underline hover:underline-offset-2 focus:outline-none focus:underline focus:underline-offset-2"
                            >
                                {c.name}
                            </a>
                        )}
                        {idx < crumbs.length - 1 && (
                            <span className="px-2 text-gray-400">/</span>
                        )}
                    </li>
                ))}
            </ol>
        </nav>
    );
}

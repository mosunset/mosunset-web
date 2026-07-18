import { useState, useEffect } from "react";

interface Device {
    temperature?: number | string;
    humidity?: number | string;
}

interface ApiResponse {
    devices?: Device[];
}

const DI_MIN = 45;
const DI_MAX = 90;

const SEGMENTS = [
    { start: 45, end: 50, text: "🥶 とても寒い" },
    { start: 50, end: 55, text: "❄️ 寒い" },
    { start: 55, end: 60, text: "🧥 肌寒い" },
    { start: 60, end: 65, text: "🙂 ちょうど良い" },
    { start: 65, end: 70, text: "😊 快適" },
    { start: 70, end: 75, text: "😕 少し暑い" },
    { start: 75, end: 80, text: "😣 暑くて不快" },
    { start: 80, end: 85, text: "🥵 とても暑い" },
    { start: 85, end: 90, text: "🔥 危険な暑さ" },
];

const TICK_VALUES = [45, 50, 55, 60, 65, 70, 75, 80, 85, 90];

function diLabel(di: number): string {
    if (di < 50) return "🥶 とても寒い";
    if (di < 55) return "❄️ 寒い";
    if (di < 60) return "🧥 肌寒い";
    if (di < 65) return "🙂 ちょうど良い";
    if (di < 70) return "😊 快適";
    if (di < 75) return "😕 少し暑い";
    if (di < 80) return "😣 暑くて不快";
    if (di < 85) return "🥵 とても暑い";
    return "🔥 危険な暑さ";
}

function toNum(v: number | string | undefined): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}

function avg(arr: number[]): number {
    return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN;
}

function pct(val: number) {
    const c = Math.min(DI_MAX, Math.max(DI_MIN, val));
    return ((c - DI_MIN) / (DI_MAX - DI_MIN)) * 100;
}

export default function SwitchBot() {
    const [temp, setTemp] = useState<number | null>(null);
    const [hum, setHum] = useState<number | null>(null);
    const [di, setDi] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const res = await fetch("/api/get-devices", {
                    cache: "no-store",
                    headers: { "Cache-Control": "no-store, must-revalidate" },
                });
                if (!res.ok) throw new Error(res.statusText);
                const data: ApiResponse = await res.json();
                const devices: Device[] = Array.isArray(data.devices) ? data.devices : [];
                const temps = devices.map((d) => toNum(d.temperature)).filter(Number.isFinite) as number[];
                const hums = devices.map((d) => toNum(d.humidity)).filter(Number.isFinite) as number[];
                const avgT = avg(temps);
                const avgH = avg(hums);
                const diVal = Number.isFinite(avgT) && Number.isFinite(avgH)
                    ? 0.81 * avgT + 0.01 * avgH * (0.99 * avgT - 14.3) + 46.3
                    : NaN;
                setTemp(Number.isFinite(avgT) ? avgT : null);
                setHum(Number.isFinite(avgH) ? avgH : null);
                setDi(Number.isFinite(diVal) ? diVal : null);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Unknown error");
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    const fmt = (v: number | null, unit: string) =>
        v !== null ? `${v.toFixed(1)}${unit}` : "N/A";

    return (
        <section className="py-14 sm:py-20 border-t border-gray-200">
            <div className="mx-auto max-w-4xl">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">私の部屋の温湿度</h2>
                {error ? (
                    <p className="text-red-500">エラー: {error}</p>
                ) : (
                    <>
                        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="rounded border p-4">
                                <p className="text-sm text-gray-500">温度</p>
                                <p className="text-2xl font-semibold mt-2">
                                    {loading ? "読み込み中..." : fmt(temp, "°C")}
                                </p>
                            </div>
                            <div className="rounded border p-4">
                                <p className="text-sm text-gray-500">湿度</p>
                                <p className="text-2xl font-semibold mt-2">
                                    {loading ? "読み込み中..." : fmt(hum, "%")}
                                </p>
                            </div>
                            <div className="rounded border p-4">
                                <p className="text-sm text-gray-500">不快指数</p>
                                <div className="mt-2 flex items-center gap-3">
                                    <p className="text-2xl font-semibold">
                                        {loading ? "読み込み中..." : (di !== null ? di.toFixed(1) : "N/A")}
                                    </p>
                                    <p className="text-xs text-gray-600">
                                        {di !== null ? diLabel(di) : ""}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* DIスケール */}
                        <div className="mt-8 w-full">
                            {/* 目盛り */}
                            <div className="relative h-5 w-full mb-1">
                                {TICK_VALUES.map((v) => (
                                    <span
                                        key={v}
                                        className="absolute text-xs text-gray-600 -translate-x-1/2"
                                        style={{ left: `${pct(v)}%` }}
                                    >
                                        {v === 45 || v === 90 ? "・・・" : v}
                                    </span>
                                ))}
                            </div>

                            {/* バー */}
                            <div className="relative h-4 w-full rounded overflow-hidden">
                                <div
                                    className="absolute inset-0 rounded"
                                    style={{
                                        background:
                                            "linear-gradient(90deg, rgba(0,0,255,1) 0%, rgba(255,0,0,1) 100%)",
                                    }}
                                />
                                {di !== null && (
                                    <div
                                        className="absolute -top-1 h-6 w-0.5 bg-black"
                                        style={{ left: `${pct(di)}%` }}
                                    />
                                )}
                            </div>

                            {/* ラベル */}
                            <div
                                className="relative mt-2 h-6 w-full [writing-mode:vertical-rl] lg:[writing-mode:horizontal-tb]"
                            >
                                {SEGMENTS.map((seg) => {
                                    const center = (seg.start + seg.end) / 2;
                                    return (
                                        <span
                                            key={seg.start}
                                            className="absolute text-xs text-gray-600 -translate-x-1/2 whitespace-nowrap"
                                            style={{ left: `${pct(center)}%` }}
                                        >
                                            {seg.text}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}

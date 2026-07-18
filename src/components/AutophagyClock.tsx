import { useState, useEffect } from "react";

const EATING_START_HOUR = 12;
const EATING_START_MINUTE = 0;
const EATING_DURATION_H = 8;
const FASTING_DURATION_H = 16;

function formatTime(ms: number) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

interface State {
    currentTime: string;
    countdown: string;
    label: string;
    status: string;
    progress: number;
    phase: "teal" | "yellow" | "orange" | "red";
}

function calcState(): State {
    const now = new Date();
    const eatStart = new Date(now);
    eatStart.setHours(EATING_START_HOUR, EATING_START_MINUTE, 0, 0);
    const eatEnd = new Date(eatStart);
    eatEnd.setHours(eatStart.getHours() + EATING_DURATION_H);

    const isFasting = !(now >= eatStart && now < eatEnd);
    let target: Date;
    let fastingStart: Date | null = null;

    if (!isFasting) {
        target = eatEnd;
    } else if (now < eatStart) {
        target = eatStart;
        fastingStart = new Date(eatEnd);
        fastingStart.setDate(fastingStart.getDate() - 1);
    } else {
        target = new Date(eatStart);
        target.setDate(target.getDate() + 1);
        fastingStart = eatEnd;
    }

    const remaining = target.getTime() - now.getTime();

    let label: string;
    let status: string;
    let progress: number;
    let phase: State["phase"] = "teal";

    if (isFasting) {
        label = "次の食事OK時間まで";
        const elapsed = now.getTime() - (fastingStart?.getTime() ?? 0);
        progress = Math.min(100, (elapsed / (FASTING_DURATION_H * 3600000)) * 100);
        if (progress < 25) {
            status = "断食中 - 最初の4時間";
            phase = "teal";
        } else if (progress < 50) {
            status = "断食中 - 4-8時間経過";
            phase = "yellow";
        } else if (progress < 75) {
            status = "断食中 - 8-12時間経過";
            phase = "orange";
        } else {
            status = "断食中 - 12-16時間経過（オートファジー活性化期）";
            phase = "red";
        }
    } else {
        label = "次の絶食時間まで";
        status = "食事を楽しんでください！";
        const elapsed = now.getTime() - eatStart.getTime();
        progress = Math.min(100, (elapsed / (EATING_DURATION_H * 3600000)) * 100);
        phase = "teal";
    }

    return {
        currentTime: now.toLocaleTimeString("ja-JP"),
        countdown: formatTime(remaining),
        label,
        status,
        progress,
        phase,
    };
}

const phaseColor: Record<State["phase"], string> = {
    teal: "text-teal-400",
    yellow: "text-yellow-400",
    orange: "text-orange-400",
    red: "text-red-500",
};

export default function AutophagyClock() {
    const [state, setState] = useState<State>(calcState);

    useEffect(() => {
        const id = setInterval(() => setState(calcState()), 1000);
        return () => clearInterval(id);
    }, []);

    const radius = 56;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (state.progress / 100) * circumference;

    return (
        <section className="py-14 sm:py-20 border-t border-gray-200">
            <div className="mx-auto max-w-4xl">
                <div className="rounded-2xl p-6 text-center">
                    <h2 className="text-3xl font-bold text-center text-teal-400 mb-2">
                        オートファジー時計
                    </h2>
                    <p className="text-center text-gray-400 mb-6">
                        食事: 12:00 - 20:00 / 断食: 20:00 - 12:00
                    </p>

                    <div className="mb-6">
                        <p className="text-lg text-gray-400">現在時刻</p>
                        <p className="text-4xl font-bold tracking-wider">{state.currentTime}</p>
                    </div>

                    <div className="relative w-64 h-64 mx-auto mb-6 flex items-center justify-center">
                        <svg className="w-full h-full" viewBox="0 0 120 120">
                            <circle
                                className="text-gray-700"
                                strokeWidth="8"
                                stroke="currentColor"
                                fill="transparent"
                                r={radius}
                                cx="60"
                                cy="60"
                            />
                            <circle
                                className={`${phaseColor[state.phase]} transition-[stroke-dashoffset] duration-500`}
                                style={{
                                    strokeDasharray: `${circumference} ${circumference}`,
                                    strokeDashoffset: offset,
                                    transform: "rotate(-90deg)",
                                    transformOrigin: "50% 50%",
                                }}
                                strokeWidth="8"
                                strokeLinecap="round"
                                stroke="currentColor"
                                fill="transparent"
                                r={radius}
                                cx="60"
                                cy="60"
                            />
                        </svg>
                        <div className="absolute flex flex-col items-center justify-center">
                            <p className="text-sm font-semibold text-gray-300">{state.label}</p>
                            <p className="text-4xl font-bold">{state.countdown}</p>
                        </div>
                    </div>

                    <div className="rounded-lg p-4 h-20 flex items-center justify-center mb-6">
                        <p className="text-lg font-semibold text-center">{state.status}</p>
                    </div>

                    <div className="mt-8 text-center">
                        <p className="text-gray-500 text-sm">
                            オートファジーについて詳しく知りたい方は{" "}
                            <a
                                href="https://mosunset.com/blog/autophagy"
                                className="text-teal-600 hover:text-teal-700 underline font-medium"
                            >
                                こちら
                            </a>{" "}
                            のブログ記事をご覧ください
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

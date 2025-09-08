// サーバーサイドでのみ .env 変数を読み込む
export const prerender = false;
const token = import.meta.env.SWITCHBOT_TOKEN;
const secret = import.meta.env.SWITCHBOT_SECRET;

// このAPIはブラウザキャッシュを無効化し、CDNは最大10分まで許可
const cacheHeaders = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store, must-revalidate",
    // Cloudflare等のエッジで最大10分だけ許可
    "CDN-Cache-Control": "max-age=120",
} as const;

// AstroのAPIルートでは、GET, POSTなどのHTTPメソッドに対応する関数を export します
export async function GET() {
    if (!token || !secret) {
        console.error("SwitchBot API credentials not set in .env");
        return new Response(
            JSON.stringify({ error: "Server configuration error" }),
            {
                status: 500,
                headers: cacheHeaders,
            }
        );
    }

    try {
        // SwitchBot APIの認証ヘッダーを生成
        const crypto = await import("crypto");
        const timestamp = Date.now().toString();
        const nonce = Math.random().toString(36).substring(2, 15);
        const sign = crypto
            .createHmac("sha256", secret)
            .update(token + timestamp + nonce)
            .digest("base64");

        const response = await fetch(
            "https://api.switch-bot.com/v1.1/devices",
            {
                method: "GET",
                headers: {
                    Authorization: token,
                    t: timestamp,
                    sign: sign,
                    nonce: nonce,
                    "Content-Type": "application/json",
                },
            }
        );

        const data: any = await response.json();

        // SwitchBot APIからエラーが返された場合の処理
        if (data && data.error) {
            console.error("SwitchBot API error:", data.error);
            return new Response(
                JSON.stringify({
                    error: "SwitchBot API authentication failed",
                    details: data.error,
                }),
                {
                    status: 401, // Unauthorized
                    headers: cacheHeaders,
                }
            );
        }

        // デバイスリストを取得
        const devices = data.body?.deviceList || data.deviceList || [];

        // 特定のデバイスタイプ（CO2センサーと温湿度計）に絞り込み
        const targetDevices = devices.filter(
            (device: any) =>
                device.deviceType === "MeterPro(CO2)" ||
                device.deviceType === "Meter"
        );

        // 各デバイスの詳細ステータスを取得
        const devicesWithStatus = await Promise.all(
            targetDevices.map(async (device: any) => {
                try {
                    const statusResponse = await fetch(
                        `https://api.switch-bot.com/v1.1/devices/${device.deviceId}/status`,
                        {
                            method: "GET",
                            headers: {
                                Authorization: token,
                                t: timestamp,
                                sign: sign,
                                nonce: nonce,
                                "Content-Type": "application/json",
                            },
                        }
                    );

                    const statusData: any = await statusResponse.json();
                    const status =
                        statusData?.body ?? statusData?.data ?? statusData;
                    return { ...device, status };
                } catch (e: any) {
                    return {
                        ...device,
                        status: null,
                        statusError: e?.message ?? "Failed to fetch status",
                    };
                }
            })
        );

        // 必要な項目のみ抽出（temperature, battery, humidity）
        const simplified = devicesWithStatus.map((d: any) => ({
            deviceId: d.deviceId,
            deviceName: d.deviceName,
            deviceType: d.deviceType,
            temperature: d.status?.temperature ?? null,
            battery: d.status?.battery ?? null,
            humidity: d.status?.humidity ?? null,
        }));

        // 取得したデータをクライアントにJSONとして返す
        return new Response(
            JSON.stringify({
                devices: simplified,
                total: simplified.length,
                message:
                    "Successfully retrieved temperatures, batteries and humidities",
            }),
            {
                status: 200,
                headers: cacheHeaders,
            }
        );
    } catch (err: unknown) {
        // SwitchBot APIからエラーが返ってきた場合の処理
        const errorData =
            err instanceof Error
                ? { message: err.message }
                : { message: "Unknown error" };
        console.error("SwitchBot API error:", errorData);

        return new Response(
            JSON.stringify({
                error: "Failed to fetch SwitchBot devices",
                details: errorData,
            }),
            {
                status: 502, // 502 Bad Gateway (上流サーバーからのエラー)
                headers: cacheHeaders,
            }
        );
    }
}

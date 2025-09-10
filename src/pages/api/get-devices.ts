// src/pages/api/get-devices.ts

export const prerender = false;

export async function GET() {
    // 環境変数を取得
    const token = import.meta.env.SWITCHBOT_TOKEN;
    const secret = import.meta.env.SWITCHBOT_SECRET;

    // 環境変数が存在するかどうかを判定
    const tokenExists = !!token;
    const secretExists = !!secret;

    // ★重要：セキュリティのため、シークレットそのものではなく、
    // 最初の3文字だけを返すなどして存在を確認
    const tokenPreview = token ? token.substring(0, 3) + "..." : null;

    // 結果をJSONで返す
    return new Response(
        JSON.stringify({
            message: "Environment Variable Test Result",
            tokenExists,
            secretExists,
            tokenPreview,
        }),
        {
            status: 200,
            headers: { "Content-Type": "application/json" },
        }
    );
}

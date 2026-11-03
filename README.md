# mosunset-web

[TanStack Start](https://tanstack.com/start) で作られた Web アプリです。Cloudflare Workers にデプロイします。

# はじめに

アプリを起動するには:

```bash
pnpm install
pnpm dev
```

http://localhost:3000 で開きます。

> **Windows の場合:** ローカル実行に使う Cloudflare のランタイム（workerd）には Visual C++ 再頒布可能パッケージが必要です。
> `pnpm dev` が `write EOF` エラーで起動しない場合は、次のコマンドでインストールしてください。
>
> ```bash
> winget install Microsoft.VCRedist.2015+.x64
> ```

# 本番用ビルド

本番用にビルドするには:

```bash
pnpm build
```

ビルド結果を Workers ランタイムでローカル確認するには:

```bash
pnpm preview
```

# Cloudflare へのデプロイ

初回のみ Cloudflare にログインします:

```bash
npx wrangler login
```

その後、次のコマンドでビルドとデプロイを行います:

```bash
pnpm run deploy
```

Worker の設定は `wrangler.jsonc` にあります。KV / D1 / R2 などのバインディングを追加したら、`pnpm cf-typegen` で型定義を生成してください。

## スタイリング

このプロジェクトではスタイリングに [Tailwind CSS](https://tailwindcss.com/) を使っています。

### Tailwind CSS を外す場合

Tailwind CSS を使わない場合は:

1. `src/styles.css` の Tailwind の import を独自のスタイルに置き換える
2. `vite.config.ts` の plugins 配列から `tailwindcss()` を削除する
3. `package.json` から `@tailwindcss/vite` と `tailwindcss` を削除する

## リントとフォーマット

リントとフォーマットには [Biome](https://biomejs.dev/) を使っています。以下のスクリプトが使えます:

```bash
pnpm lint
pnpm format
pnpm check
```

## ルーティング

[TanStack Router](https://tanstack.com/router) のファイルベースルーティングを使っています。ルートは `src/routes` 内のファイルとして管理されます。

### ルートの追加

新しいルートを追加するには、`./src/routes` ディレクトリに新しいファイルを作成するだけです。

ルートファイルの中身は TanStack が自動で生成します。

ルートが 2 つ以上になったら、`Link` コンポーネントでルート間を移動できます。

### リンクの追加

SPA（シングルページアプリケーション）のナビゲーションを使うには、`@tanstack/react-router` から `Link` コンポーネントを import します。

```tsx
import { Link } from "@tanstack/react-router";
```

あとは JSX の中で次のように使えます:

```tsx
<Link to="/about">About</Link>
```

これで `/about` ルートへ移動するリンクができます。

`Link` コンポーネントの詳細は [Link のドキュメント](https://tanstack.com/router/v1/docs/framework/react/api/router/linkComponent)を参照してください。

### レイアウトの使い方

ファイルベースルーティングでは、レイアウトは `src/routes/__root.tsx` にあります。ルートルートに追加したものは、すべてのページに表示されます。各ページの中身は、`shellComponent` 内で `{children}` を描画している位置に表示されます。

ヘッダーを含むレイアウトの例:

```tsx
import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'My App' },
    ],
  }),
  shellComponent: ({ children }) => (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        <header>
          <nav>
            <Link to="/">Home</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
```

レイアウトの詳細は [Layouts のドキュメント](https://tanstack.com/router/latest/docs/framework/react/guide/routing-concepts#layouts)を参照してください。

## サーバー関数

TanStack Start にはサーバー関数があり、サーバー側のコードを書いてクライアントのコンポーネントからそのまま呼び出せます。

```tsx
import { createServerFn } from '@tanstack/react-start'

const getServerTime = createServerFn({
  method: 'GET',
}).handler(async () => {
  return new Date().toISOString()
})

// コンポーネントでの使用例
function MyComponent() {
  const [time, setTime] = useState('')

  useEffect(() => {
    getServerTime().then(setTime)
  }, [])

  return <div>サーバー時刻: {time}</div>
}
```

## API ルート

ルート定義の `server` プロパティを使うと API ルートを作れます:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'

export const Route = createFileRoute('/api/hello')({
  server: {
    handlers: {
      GET: () => json({ message: 'Hello, World!' }),
    },
  },
})
```

## データ取得

データの取得方法はいくつかあります。TanStack Query でサーバーからデータを取得することもできますし、TanStack Router に組み込まれた `loader` を使って、ページの描画前にそのルートのデータを読み込むこともできます。

例:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/people')({
  loader: async () => {
    const response = await fetch('https://swapi.dev/api/people')
    return response.json()
  },
  component: PeopleComponent,
})

function PeopleComponent() {
  const data = Route.useLoaderData()
  return (
    <ul>
      {data.results.map((person) => (
        <li key={person.name}>{person.name}</li>
      ))}
    </ul>
  )
}
```

loader を使うとデータ取得のロジックがとてもシンプルになります。詳しくは [Loader のドキュメント](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#loader-parameters)を参照してください。

# 詳しく知る

TanStack の各ライブラリについては [TanStack のドキュメント](https://tanstack.com)を参照してください。

TanStack Start 固有のドキュメントは [TanStack Start](https://tanstack.com/start) にあります。

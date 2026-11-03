---
title: YouTube のサムネイルを再生ページに表示する拡張機能
description: YouTube の再生ページで、その動画のサムネイル画像を表示・確認できるブラウザ拡張機能「YouTube Watch Thumbnails」を作りました。Chrome と Firefox に対応しています。
---
YouTube の再生ページで、その動画のサムネイル画像を表示・確認できるブラウザ拡張機能 [YouTube Watch Thumbnails](https://chromewebstore.google.com/detail/youtube-watch-thumbnails/aobeafpjgdgakpagffmlkfeognaiigci?hl=ja) を作りました。

現在は **Chrome** と **Firefox** の両方で使えます。

![バージョン 2.1.21 の画面](/images/blog/youtube-watch-thumbnails/v2.1.21.png)

![バージョン 2.1.11 の画面](/images/blog/youtube-watch-thumbnails/V2.1.11.png)

## 作ったきっかけ

YouTube で動画を見ているとき、「この動画のサムネイルをもう一度見たい」と思ったことはありませんか？ ふつう、再生ページではサムネイルが見られず、検索結果や関連動画の一覧に戻る必要があります。

この拡張機能は、そんなちょっとした不便をなくすために作りました。

## 主な機能

### 1. 再生ページにサムネイルを表示

再生ページ（`/watch`）で、チャンネルアイコンの横にサムネイル画像を自動で表示します。動画を再生している間でも、すぐにサムネイルを確認できます。

### 2. マウスを乗せると拡大

サムネイルにマウスを乗せると、元の大きさの 1.75 倍に拡大します。レイアウトを崩さず、なめらかに拡大します。

### 3. すべての大きさのサムネイルを一覧

サムネイルをクリックすると専用のページが開き、その動画のすべての解像度のサムネイルを一覧で表示します。

- **形式**：WebP と JPG の両方
- **大きさ**：幅 × 高さも表示
- **解像度**：`maxresdefault`（1280×720）、`hq720`、`sddefault`、`hqdefault` など、使えるすべてのサイズ

### 4. ポップアップからも見られる

ブラウザの拡張機能アイコンをクリックすると、今のタブで再生中の動画のサムネイルを表示します。YouTube 以外のページでは、案内のメッセージを表示します。

### 5. プライバシーに配慮

- **データを集めない**：利用者のデータは一切集めず、送信もしません
- **ブラウザの中で完結**：すべての処理をブラウザの中で行います
- **外部の API を使わない**：サムネイル画像は YouTube の公開 CDN から直接取得します

## Chrome ウェブストア・Firefox Add-ons で公開中

誰でも無料でインストールできます。

- [**Chrome ウェブストアでインストール**](https://chromewebstore.google.com/detail/youtube-watch-thumbnails/aobeafpjgdgakpagffmlkfeognaiigci?hl=ja)
- [**Firefox Add-ons でインストール**](https://addons.mozilla.org/ja/firefox/addon/youtube-watch-thumbnails/)

## 技術的なしくみ

ソースコードは GitHub で公開しています。

[**GitHub リポジトリ**](https://github.com/mosunset/youtube_watch_thumbnails)

### 技術スタック

- **フレームワーク**：WXT（複数のブラウザに対応した拡張機能のフレームワーク）
- **UI**：React 19.1.1 + TypeScript 5.9.2
- **スタイリング**：Tailwind CSS 4.1.16
- **ビルドツール**：Vite（WXT に内蔵）

### 構成

- **Manifest V3**（Chrome）/ **Manifest V2**（Firefox）に対応
- **Content Script**：YouTube のページにサムネイルを差し込む
- **Background Script**：タブの管理とメッセージのやり取り
- **Popup**：React で作った UI
- **Thumbnail View**：すべての大きさのサムネイルを表示する専用ページ

### 動作の流れ

1. YouTube の再生ページを見つける
2. URL から動画の ID を取り出す
3. YouTube の公開 CDN（`i.ytimg.com`）からサムネイル画像を取得する
4. チャンネルアイコンの横にサムネイルを差し込む
5. クリックすると専用のページを開き、すべての大きさのサムネイルを一覧で表示する

外部の API は使わず、すべての処理をブラウザの中で行います。

---

## ほかの方による紹介記事

この拡張機能を詳しく紹介してくださっている記事があります。「youtube watch thumbnails 解説」などで検索するといくつか見つかるので、ぜひ見てみてください。

- [紹介記事の一例](https://www.naporitansushi.com/youtube-watch-thumbnails/)

## YouTuber による紹介

さらに、**YouTuber の方にも動画で取り上げていただきました！**

- [有能すぎるChrome拡張おすすめ10選を紹介するぜ！！ - YouTube | ぷらぐら](https://youtu.be/8un8w5nAw2Q?t=390)

シンプルですが、日常のちょっとした不便をなくせる拡張機能です。よければ試してみてください。

![YouTube Watch Thumbnails の利用イメージ](/images/blog/youtube-watch-thumbnails/2d09b5c2-e272-44f0-998f-5188f2dd7050.png)

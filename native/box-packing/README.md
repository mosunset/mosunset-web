# 箱詰めの計算を Rust + CUDA で（ネイティブ版）

`/playground/box-packing` の計算（`src/components/playground/tools/box-packing/solver.ts`）を、Windows のネイティブで動かすものです。サイトのビルドには入らず、この PC で別に動かします（サイトの箱詰めのページが計算を頼みます）。2026-11-08 の試作（`2f62d79`）を 2026-11-16 に戻し、その後に TS で変わった探し方（行き詰まったら崩す強さを上げて探し直す・ときどき新しい並べ方から始める・別の筋）を移しました。「柱で積む」方式（`columns.ts`）も `src/columns.rs` に移しました（ゆらぎの乱数の引き方が違うので TS と同じ形にはなりませんが、できた形の点数は TS で採点し直しても同じ。`node tools/columns-check.ts <入力> <solve の結果> [秒]` で確かめられます）。

- **Rust（CPU）**: TS の `packInOrder`・`finish`（見た目の整いや塔の点数まで全部）・崩し方・焼きなましをそのまま移しました。CPU の全コアで、係ごとに別々に探します。
- **CUDA**: 並べ順どおりに置いていく計算（`packInOrder`）を GPU で動かします。1 ワープ（32 スレッド）で 1 通りを受け持ち、置く場所の候補を 32 本で分けて調べます。GPU で置いた結果は、CPU の全コアで**正式に**評価します（前にブラウザー版にあった GPU 係（2026-11-16 に外した）は見積もりでしたが、こちらは GPU で試したすべての並べ方が正式な点数になります）。
- **GPU を使うときの CPU**: GPU の係と並べて、CPU だけで探す係も動かします。本数は `--cpu-threads N`（0 なら GPU の係だけ）で、既定は `solve` が「スレッド数 − 2」、`serve`（ページから起動したとき）が 2 本です。GPU の結果の採点は、この本数と関係なく rayon で全コアを使うので、CPU の係を 0 本にしても CPU は半分ほど使います。GPU を待つあいだは CPU を眠らせます（`CU_CTX_SCHED_BLOCKING_SYNC`。既定の待ち方では、待つスレッドが 1 コアを使い切っていました）。柱で積む方式は GPU を使わないので、今までどおり全スレッドで探します。
- **結果は TS と同じ**: 同じ並べ方なら、TS・Rust・CUDA で置き方も点数も一致します（3 つの入力で 900 通りを突き合わせ、点数の差は最大 2×10⁻¹⁶）。Rust で見つけた並べ方（genome）は、そのまま画面の `startGenome` に渡せます。2026-11-16 にも 3 つの入力で 600 通りを突き合わせ、食い違いは 0。

## 要るもの

CUDA Toolkit も Visual Studio も要りません。

1. Rust（GNU 版）: `rustup-init.exe -y --default-host x86_64-pc-windows-gnu --profile minimal`
2. NVIDIA のドライバー（`nvcuda.dll`。CUDA 13.x に対応したもの）
3. NVRTC（実行時コンパイラ）: NVIDIA の配布物 `cuda_nvrtc-windows-x86_64-<版>-archive.zip`（[redist](https://developer.download.nvidia.com/compute/cuda/redist/)）を `%USERPROFILE%\.local\share\cuda-nvrtc\` に展開します。ドライバーが対応している CUDA の版以下のものを選びます（`nvidia-smi` の CUDA Version）。別の場所に置くなら、環境変数 `NVRTC_DLL` に `nvrtc64_*.dll` のパスを入れます。

カーネル（`src/kernel.cu`）は起動のたびに、その GPU 用にコンパイルします（1 秒弱）。

## サイトのページから使う（ふだんの使い方）

サイトの箱詰めのページ（`/playground/box-packing`）が画面で、ネイティブ版は裏で動く計算係です。

```sh
cargo build --release
target/release/box-packing.exe install      # 最初の 1 回（ビルドし直したら、もう一度）
```

`install` は、`box-packing.exe` と起動役の `box-packing-launch.exe` を `%LOCALAPPDATA%\box-packing\` に写し、`box-packing://` の呼び出しを自分のユーザーにだけ登録します（HKCU。管理者の権限は要りません）。写して使うのは、動いているあいだも `cargo build` で上書きできるようにするためです。`install` は動いているネイティブ版に先に終わってもらいます。`uninstall` で写したものと登録を消せます。

- ページの「4. 探す」の「**ネイティブ版を起動**」で立ち上がります（初回はブラウザーが開いてよいか聞きます）。窓は出さず裏で動き、すでに動いていれば何もしません。
- ページは 127.0.0.1:8787 を 5 秒ごとに確かめ、いれば「ネイティブ版で計算（GPU の名前・CPU のスレッド数）」に切り替えます。「探す」で、組み合わせを 1 つずつ（範囲で試すときは 15 秒ずつ）ネイティブ版に頼み、0.5 秒ごとに結果を聞いて 3D・部門別ベストを描き替えます。ネイティブ版がいるあいだは、ブラウザーの係は使いません。
- 「**ネイティブ版を終了**」で終わります。10 分どのページからも聞かれなければ、自分で終わります。計算中にページを閉じたら、20 秒で計算を止めます。良い結果が 90 秒出なければ、その受け持ちを終えます（ブラウザーの係と同じ）。
- 答えるのは `https://mosunset.com`・`https://www.mosunset.com`・`http://localhost:*`・`http://127.0.0.1:*` のページだけです（ほかは 403）。
- mosunset.com のページから使うときは、初めてのときにブラウザーが、この PC のほかのアプリにつないでよいかを聞きます（ローカル ネットワーク アクセス）。許可しないと、ページはネイティブ版を見つけられません。localhost のページでは聞かれません。
- サイトの CSP（`src/server/security-headers.ts` の `connect-src`）で `http://127.0.0.1:8787` への通信を許しています。ポートを変えるときは、ネイティブ版（`src/` の `8787` と書いてあるところ）・ページの `native.ts`・CSP をそろえます。
- 窓口: `GET /api/hello`、`POST /api/page/run {token, input}`、`GET /api/page/poll?token=&b=&m=`（ページが知っている版より新しい結果だけ返す）、`POST /api/page/stop {token}`、`POST /api/quit`。`node tools/page-api-test.mjs <入力.json> [秒]` で、ページと同じ形で試せます（先に `serve --no-open` を動かす）。

ネイティブ版が動いていないときは、ページはブラウザーで軽く計算します（2 並列・30 秒・タブが裏なら休む）。

## ネイティブ版だけの画面で使う（前の試作の画面。手を入れていません）

```sh
cargo build --release
target/release/box-packing.exe serve        # http://127.0.0.1:8787/ がブラウザーで開く（exe を引数なしで起動・ダブルクリックしても同じ）
```

床・壁・箱を入れて「詰め方を探す」を押すと、この PC の CPU の全コアと GPU で探し、良くなるたびに 3D の形・高さ・充填率・見た目の整いが変わります。箱にマウスを乗せると名前と寸法が出ます。入力はブラウザーに残り、JSON のファイルに書き出し・読み込みもできます（サイトの画面と同じ形）。3D の表示に three.js を CDN から読むので、インターネットにつながっている必要があります。自分の PC からだけつながります（127.0.0.1）。

## コマンドで使う

```sh
cargo build --release
B=target/release/box-packing.exe

# 1 秒あたりに試せる数を測る（Rust 1 スレッド・全スレッド・GPU）
$B bench fixtures/large.json --seconds 8
# 探す（CPU の全コア + GPU）。結果は PackResult の JSON。入力はサイトの書き出し JSON（settings と result）でもよい
$B solve fixtures/large.json --seconds 60 --gpu --out out/best.json
# CPU の係のうち、いちばん良い並べ方を取り込む「いつもの筋」を N 本にし、残りを別の筋にする（既定は全部いつもの筋）
$B solve fixtures/large.json --seconds 60 --gpu --main 4

# サイトの書き出しの置き方（と solve の結果）を、今の TS の点数の付け方で採点し直す
node tools/score-export.ts box-packing.json out/best.json

# TS と突き合わせる
$B genomes fixtures/large.json 300 7 > out/g.json
$B eval fixtures/large.json out/g.json --gpu > out/rust.json   # GPU と CPU の食い違いも数える
node tools/ts-ref.ts eval fixtures/large.json out/g.json > out/ts.json
node tools/compare.mjs out/rust.json out/ts.json
node tools/ts-ref.ts bench fixtures/large.json 8              # TS の速さ
```

入力は画面と同じ `PackInput` の JSON です（`tools/make-fixtures.mjs` で `fixtures/` を作り直せます）。

## 測った結果（2026-11-08、RTX 5060 Ti・CPU 16 スレッド）

1 秒あたりに試せる並べ方の数（正式な評価まで）:

| 入力 | TS（Node・1 スレッド） | Rust 1 スレッド | Rust 16 スレッド | CUDA + CPU で評価 |
|---|---:|---:|---:|---:|
| 画面の初期値（30 個） | 1,742 | 4,207 | 36,173 | 79,895 |
| 壁あり（60 個） | 268 | 609 | 4,310 | 43,605 |
| 多い（150 個） | 19 | 67 | 371 | 4,496 |

同じ 45 秒で探した結果（150 個）: CPU だけ 点数 1.841・高さ 4150 mm → CPU + GPU 点数 1.767・高さ 4010 mm。

わかったこと:

- 1 スレッドどうしでは、Rust は TS（Node）の 2.3〜3.5 倍。
- GPU は「1 スレッドで 1 通り」だと、箱が多いと CPU より遅い（150 個で 300 通りに 40 秒）。「1 ワープで 1 通り」にすると 245 倍速くなり、箱が多いほど CPU との差が開く（150 個で Rust 16 スレッドの 12 倍）。
- 箱が少ないときは、GPU より CPU での正式な評価（`finish`）のほうが時間を食う（30 個で 8 割）。評価も GPU に移すか、GPU の計算と評価を重ねて動かせば、まだ速くなる。
- 入れ替えた位置から先だけ置き直す工夫は、GPU ではほとんど効かない（CPU では効く）。

## 2026-11-16 に試したこと（実際の 49 個・床 840×430）

- 速さ: Rust CPU 1 スレッド 1,471 通り/秒、16 スレッド 16,455 通り/秒、GPU + CPU で評価 約 5〜7 万通り/秒。
- サイトで書き出した結果を採点し直すと 点数 1.810（高さ 645 mm）。ネイティブで 30 秒探すと、種によって 1.811〜1.922 とばらつく（最初のうちにどこへ落ち着くかで決まる）。
- CPU の係の一部を別の筋（取り込み合わず、行き詰まったら新しく始める）にすると、30 秒では平均で悪くなった（全部いつもの筋 1.864・4 分の 1 1.928・1 本 1.928）。既定は全部いつもの筋。
- 120 秒にすると 1.832（種 1）・1.789（種 3、高さ 700 mm・整い 0.740）。時間をかける・種を変えて何回も回すほど良い結果に当たる。

## 2026-11-16 に CPU の使い方を見直したこと（同じ 49 個・GPU あり・20 秒）

ネイティブ版でも CPU が 100% 近くに張り付いていたので、CPU の探す係の本数を変えて測りました（16 スレッドの CPU。平均で使ったコアは、プロセスの CPU 時間 ÷ 経過時間）。

| CPU の探す係 | 平均で使ったコア | 試した数（通り/秒） |
|---:|---:|---:|
| 14（前の既定） | 15.0 | 7.5 万 |
| 4 | 10.3 | 8.7 万 |
| 2（serve の既定） | 7.8 | 7.3 万 |
| 0 | 9.1 | 10.7 万 |

- CPU の係を減らすほど、GPU の結果の採点に回るコアが増えて GPU の係が速くなり、全体の試せる数はほとんど落ちません（0 本では、採点が全コアを取るので、使うコアはかえって増えます）。
- 点数は種 1 つずつの 20 秒なのでばらつきが大きく（1.886〜2.005）、本数による良し悪しはまだ言えません。
- GPU を待つあいだ眠らせる設定で、使うコアが 1.2〜1.4 本減りました（CPU の係 2 本・15 秒で 9.7→8.3、8.8→7.6）。


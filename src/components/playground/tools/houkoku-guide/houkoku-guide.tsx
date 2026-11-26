import { useEffect, useRef, useState } from 'react'
import { guideCss } from './guide.css'

// 報告・相談の手引き。読み物と「相談前の5分メモ」「質問ログ」。
// メモと質問ログはこのブラウザの localStorage にだけ保存する（サーバーには送らない）

const KEY = 'houkoku-memo-v1'
const memoIds = ['f1', 'f2', 'f3'] as const
type MemoId = (typeof memoIds)[number]
type Store = Record<MemoId | 'qlog', string> & { ck: boolean[]; seen: boolean }

/** 初めて開いたときに入れておく、写真に撮れない言葉だらけのメモ */
const EX: Record<MemoId, string> = {
  f1: '環境構築でエラーが出て、いろいろ対応しています。',
  f2: 'なんか権限まわりがうまくいかない感じです。',
  f3: 'ちょっと相談させてください。',
}

/** 写真に撮れない言葉と、言い換えのための問い */
const NG: readonly [string, string][] = [
  ['頑張', '何を、どれだけやった？'],
  ['対応', '誰が、何をした？'],
  ['調整', '誰と、何を決めようとしている？'],
  ['時間がかか', 'どこで、何日止まった？'],
  ['問題', '何が、どうなっている？'],
  ['いろいろ', '具体的に何と何？'],
  ['色々', '具体的に何と何？'],
  ['例の', 'どの件？ 相手は覚えている？'],
  ['なんか', '何が、どうなった？'],
  ['うまくいかな', '何をしたら、どうなった？'],
  ['ちょっと', 'どのくらい？ 何について？'],
  ['確認中', '誰に、何を確認している？'],
  ['全部', '何の全部？ 何件のうち何件？'],
  ['前の', '何より前？ 日付やバージョンは？'],
  ['さっきの', 'いつの、どれ？'],
  ['いつもの', 'どれ？ 名前で言うと？'],
  ['早めに', 'いつまでに？'],
]

const checks = [
  '相手が知らない前提を一言添えた',
  '「そのあと」ではなく「だから」でつないだ',
  'どこまでわかっていて、どこからわからないかを言える',
  '上司に何をしてほしいかを最初に言える',
]

const initial: Store = { ...EX, qlog: '', ck: [], seen: false }

function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}
    const out: Store = {
      f1: s.f1 ?? '',
      f2: s.f2 ?? '',
      f3: s.f3 ?? '',
      qlog: s.qlog ?? '',
      ck: Array.isArray(s.ck) ? s.ck : [],
      seen: !!s.seen,
    }
    if (!out.seen) Object.assign(out, EX)
    return out
  } catch {
    return initial
  }
}

function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {}
}

export function HoukokuGuide() {
  const [store, setStore] = useState<Store>(initial)
  const [backup, setBackup] = useState<Store | null>(null)
  const [status, setStatus] = useState('')
  const timer = useRef(0)
  const f1Ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => setStore(load()), [])
  useEffect(() => () => clearTimeout(timer.current), [])

  const update = (patch: Partial<Store>) =>
    setStore((s) => {
      const next = { ...s, ...patch }
      save(next)
      return next
    })

  const say = (msg: string) => {
    setStatus(msg)
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setStatus(''), 4000)
  }

  const text = memoIds.map((i) => store[i]).join('\n')
  const hits = NG.filter(([w]) => text.includes(w))
  const isExample = memoIds.every((i) => store[i] === EX[i])

  const copy = () => {
    const v = memoIds.map((i) => store[i].trim())
    const txt = `【やったこと・起きたこと】\n${v[0]}\n\n【どこで止まっているか】\n${v[1]}\n\n【お願いしたいこと】\n${v[2]}`
    const fail = () =>
      say('コピーできませんでした。メモを長押しして選択してください')
    try {
      navigator.clipboard.writeText(txt).then(() => say('コピーしました'), fail)
    } catch {
      fail()
    }
  }

  const clear = () => {
    setBackup(store)
    update({ f1: '', f2: '', f3: '', ck: [], seen: true })
    say('メモをクリアしました')
    f1Ref.current?.focus()
  }

  const undo = () => {
    if (!backup) return
    update({
      f1: backup.f1,
      f2: backup.f2,
      f3: backup.f3,
      ck: backup.ck,
      seen: true,
    })
    setBackup(null)
    say('元に戻しました')
  }

  const memoField = (
    id: MemoId,
    label: string,
    hint: string,
    placeholder: string,
  ) => (
    <div className="field">
      <label htmlFor={`hk-${id}`}>
        {label}
        <span className="hint">{hint}</span>
      </label>
      <textarea
        id={`hk-${id}`}
        ref={id === 'f1' ? f1Ref : undefined}
        placeholder={placeholder}
        value={store[id]}
        onChange={(e) => update({ [id]: e.target.value, seen: true })}
      />
    </div>
  )

  return (
    <div className="hk">
      <style>{guideCss}</style>

      <header className="band">
        <p className="lead">
          「何言ってるかわからない」と言われるのは、語彙が足りないからとは限らない。原因の多くは、話の
          <strong>流れ（つながり）</strong>
          が相手に見えていないこと。言葉を探す前に流れをたどり、
          <strong>写真に撮れる言葉</strong>で話す。
        </p>
        <p className="src">
          シアニン「言語化できる人と、苦手な人の違いは『流れで捉える思考』」（2026年11月25日）の要約と、上司からの指摘をもとにした整理
        </p>
        <div className="pic">
          <p className="cap">
            点で話す <span>相手の頭に場面が浮かばない</span>
          </p>
          <div className="dots" aria-hidden="true">
            {[
              '頑張った',
              '対応中',
              '時間がかかった',
              '例の件',
              'いろいろ',
              '問題があって',
              'なんか',
            ].map((w) => (
              <span key={w} className="chip">
                {w}
              </span>
            ))}
          </div>
          <p className="cap">
            流れで話す <span>相手の頭で場面が再生される</span>
          </p>
          <ol className="route" aria-label="流れをつかむ5つの視点">
            {[
              ['premise', '前提', 'いまの状況'],
              ['background', '背景', 'ここまでの経緯'],
              ['cause', '因果', '原因 → 結果'],
              ['goal', 'ゴール', '何を目指すか'],
              ['rule', '法則', '回っている仕組み'],
            ].map(([id, nm, gist]) => (
              <li key={id}>
                <a href={`#${id}`}>
                  <span className="st" />
                  <span className="nm">{nm}</span>
                  <span className="gist">{gist}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <nav className="toc" aria-label="目次">
        <a href="#memo">相談前の5分メモ</a>
        <a href="#photo">写真に撮れる言葉</a>
        <a href="#basis">頭の中の基準に頼る言葉</a>
        <a href="#views">5つの視点</a>
        <a href="#consult">モヤモヤのまま相談するとき</a>
        <a href="#practice">普段の練習</a>
        <a href="#source">出典</a>
      </nav>

      <section className="band" id="memo">
        <div className="sec">
          <h2>相談前の5分メモ</h2>
          <div>
            <p>
              頭の中だけで整理しようとすると、全部が同時に浮かんでモザイクのままになる。書き出すと出来事が一列に並び、どこでつながりが切れているかが見える。
            </p>
            <div className="tool">
              <div>
                {isExample && (
                  <p className="example">
                    今は例として「写真に撮れない言葉」だらけのメモが入っています。「クリア」してから自分のメモを書いてください。
                  </p>
                )}
                {memoField(
                  'f1',
                  '1. やったこと・起きたこと',
                  '写真に撮れる事実だけ。誰が、何を、どうした、今どうなっているか',
                  '例）デプロイ時に権限エラーが出た。IAMロールの設定を○○さんにメールで問い合わせ中',
                )}
                {memoField(
                  'f2',
                  '2. どこで止まっているか',
                  '書こうとして手が止まるところが、モヤモヤの正体',
                  '例）原因がロールの設定なのかポリシーの書き方なのか、判断できていない',
                )}
                {memoField(
                  'f3',
                  '3. 上司にしてほしいこと',
                  '判断・助言・確認・整理の手伝いのどれか',
                  '例）どちらから調べるべきか、方針をもらいたい',
                )}
              </div>
              <div className="side">
                <h3>写真に撮れない言葉チェック</h3>
                <ul className="found" aria-live="polite">
                  {hits.length ? (
                    hits.map(([w, q]) => (
                      <li key={w}>
                        <b>「{w}」</b> → {q}
                      </li>
                    ))
                  ) : (
                    <li className="none">
                      {text.trim()
                        ? '見つかりませんでした。最後に、相手の頭に場面が浮かぶか読み返してください。'
                        : 'メモを書くと、ここに写真に撮れない言葉と、言い換えのための問いが出ます。'}
                    </li>
                  )}
                </ul>
                <div className="checks">
                  {checks.map((label, n) => (
                    <label key={label}>
                      <input
                        type="checkbox"
                        checked={!!store.ck[n]}
                        onChange={(e) => {
                          const ck = checks.map((_, i) => !!store.ck[i])
                          ck[n] = e.target.checked
                          update({ ck })
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="btns">
                  <button type="button" onClick={copy}>
                    メモをコピー
                  </button>
                  <button type="button" className="ghost" onClick={clear}>
                    クリア
                  </button>
                  {backup && (
                    <button type="button" className="ghost" onClick={undo}>
                      元に戻す
                    </button>
                  )}
                </div>
                <p className="status" aria-live="polite">
                  {status}
                </p>
              </div>
            </div>
            <h3>2がうまく書けないときの切り出し方</h3>
            <p className="say">
              「○○までは進めたんですが、△△のあたりで何を決めればいいのか整理できていません。整理を手伝ってもらえますか」
            </p>
            <p>
              最初に「整理を手伝ってほしい」と伝えると、上司も最初から聞き方を選べる。同じ質問をされても、詰められている感じが減る。「どこまでわかっていて、どこからわからないか」を言えれば、それだけで写真に撮れる状況説明になっている。
            </p>
          </div>
        </div>
      </section>

      <section className="band" id="photo">
        <div className="sec">
          <h2>写真に撮れる言葉</h2>
          <div>
            <p>
              上司の「写真に撮れる言葉にしなさい」は、記事の「映像として浮かぶ」と同じ意味。聞いた人の頭に、カメラで撮れるような具体的な場面が浮かぶかどうか。
            </p>
            <h3>なぜ上司がこだわるのか</h3>
            <ul className="plain">
              <li>
                <b>聞く人ごとに場面がバラバラになるから。</b>
                「時間がかかった」と聞いても、相手が遅いのか、手順が悪いのか、待たされているのか判断できない。判断できない報告が「何言ってるかわからない」になる。
              </li>
              <li>
                <b>抽象的な言葉は、自分の理解不足を隠すから。</b>
                「対応中」は、何が起きているか自分でわかっていなくても文になる。具体的に言おうとして詰まったところが、まだ把握できていないところ。
              </li>
            </ul>
            <h3>写真に撮れない言葉</h3>
            <div className="chips">
              {[
                '頑張った',
                '対応中',
                '調整している',
                '時間がかかった',
                '問題があった',
                'いろいろ',
                '例の件',
              ].map((w) => (
                <span key={w} className="chip">
                  {w}
                </span>
              ))}
            </div>
            <p>これが出てきたら、具体的な行動や状態に言い換えるサイン。</p>
            <h3>言い換えの例</h3>
            {[
              [
                '環境構築でエラーが出て遅れています',
                'デプロイ時に権限エラーが出ています。IAMロールの設定を○○さんにメールで問い合わせていて、返事待ちで今日は作業が止まっています',
              ],
              [
                '確認に時間がかかって遅れました。頑張ったんですが…',
                '承認者が決まっておらず、確認先を探す間に3日止まりました。次回は着手の時点で承認者を決めます',
              ],
              [
                '例の件、やっぱり変更したいです',
                '来月公開する申込ページの件です。スマホからの申込が途中で止まりやすいので、入力項目を減らしたいです',
              ],
            ].map(([ng, ok]) => (
              <div key={ng} className="pair">
                <div className="ng">
                  <span className="tag">撮れない</span>
                  {ng}
                </div>
                <div className="ok">
                  <span className="tag">撮れる</span>
                  {ok}
                </div>
              </div>
            ))}
            <div className="note">
              <p>
                <b>話す前の自問：</b>
                これを聞いた人は、何の写真を撮ればいいかわかるか？
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="basis">
        <div className="sec">
          <h2>頭の中の基準に頼る言葉</h2>
          <div>
            <p>
              「全部」「前の」「さっきの」「いつもの」「早めに」は、意味が話し手の頭の中にある基準で決まる相対的な言葉。基準が相手に見えていないと、相手は自分の基準で解釈するので、ずれが起きる。「ここ」「これ」のような指示語も同じ。
            </p>
            <h3>ずれ方の例</h3>
            <ul className="plain">
              <li>
                <b>「全部」：何の全部か。</b>
                話し手は「今日見た3画面の全部」のつもりでも、聞き手は「システム全体の全部」と受け取るかもしれない
              </li>
              <li>
                <b>「前の」：何より前か。</b>
                前のバージョンなのか、前回の打ち合わせなのか
              </li>
              <li>
                <b>「早めに」：いつまでか。</b>今日中なのか、今週中なのか
              </li>
            </ul>
            <p>
              「全部」が特に危ないのは、範囲を言い切ってしまうから。相手の考える「全部」のほうが広いと、あとで漏れが見つかったときに「全部って言ったのに」となる。説明がわかりにくいだけでは済まず、信頼が下がる。
            </p>
            <h3>主語の省略も同じ仕組み</h3>
            <p>
              話している本人にとって主語は当たり前なので、日本語だと自然に省けてしまう。でも聞き手の頭には候補が複数ある。たとえば「動かなかったので戻しました」には、主語が二つ抜けている。
            </p>
            <div className="pair">
              <div className="ng">
                <span className="tag">撮れない</span>
                動かなかったので戻しました
              </div>
              <div className="ok">
                <span className="tag">撮れる</span>
                ステージング環境のAPIが500エラーを返したので、私がv1.3に戻しました
              </div>
            </div>
            <p>
              何が動かなかったのか、誰が戻したのか、が入ると写真に撮れる文になる。
            </p>
            <h3>根っこはひとつ</h3>
            <p>
              「写真に撮れない言葉」「ここ・これ」「全部・前の」「主語の省略」は、どれも自分の頭の中にしかない情報に頼った言葉。直し方も共通していて、頭の外に存在するもの（名前・数・日付・人）に置き換える。
            </p>
            {[
              [
                '全部確認しました',
                'テストケース12件のうち、正常系の8件を確認しました。異常系の4件はまだです',
              ],
              [
                '前のバージョンだと動いた',
                '11月20日にデプロイしたv1.3では動いていました',
              ],
            ].map(([ng, ok]) => (
              <div key={ng} className="pair">
                <div className="ng">
                  <span className="tag">撮れない</span>
                  {ng}
                </div>
                <div className="ok">
                  <span className="tag">撮れる</span>
                  {ok}
                </div>
              </div>
            ))}
            <div className="note">
              <p>
                <b>自分でできるチェック：</b>
                相手が「どの？」「誰が？」「いつの？」「何と比べて？」と聞き返せそうな言葉があれば、それが置き換え候補。上司に聞き返される前に、自分で聞き返しておく。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="views">
        <div className="sec">
          <h2>流れをつかむ5つの視点</h2>
          <div>
            <p>
              毎回この順番で全部話すための型ではない。自分の理解を確かめて、相手に必要な情報を選ぶための視点。
            </p>
            <div className="view" id="premise">
              <div className="k">前提</div>
              <div>
                <p className="q">そもそも、どんな状況なのか？</p>
                <p>
                  話し手と聞き手の出発点をそろえる。自分の中ではもう「第3話」でも、相手はまだ世界観に入れていない。結論から話すのは大事だが、相手が知らない前提は短く添える。
                </p>
              </div>
            </div>
            <div className="view" id="background">
              <div className="k">背景</div>
              <div>
                <p className="q">その前に、何が積み上がっていたのか？</p>
                <span className="when">指示を受け取るとき</span>
                <p>
                  上司の一言を切り取って判断しない。「もっと早く共有して」の裏には、別部署への報告が間に合わなかった、顧客への説明が食い違った、などの事情があるかもしれない。わからなければ想像で埋めず、「何に間に合わせるための共有ですか？」と聞く。
                </p>
              </div>
            </div>
            <div className="view" id="cause">
              <div className="k">因果</div>
              <div>
                <p className="q">何が原因で、何が起きたのか？</p>
                <p>
                  「そのあと」と「だから」は違う。出来事を順に並べるだけでは説明にならない。言語化が止まるのは、単語を知らないところより、出来事の
                  <b>つなぎ目</b>
                  であることが多い。「なんで遅れたの？」に「頑張ったんですけど」は答えになっていない。
                </p>
                <p>
                  きれいに説明できても事実とは限らないので、記録ややり取りに戻って確かめる。
                </p>
              </div>
            </div>
            <div className="view" id="goal">
              <div className="k">ゴール</div>
              <div>
                <p className="q">何を守り、何を目指していたのか？</p>
                <span className="when">指示を受け取るとき</span>
                <p>
                  「資料を短くして」と言われても、読み手に時間がないなら文章量を減らす。判断に必要な情報が埋もれているなら、重要な情報を先に出す。目的が違えば直し方も違う。
                </p>
                <p>
                  確かめるのは3つ：何を守りたいのか／何を手に入れたいのか／どうなれば目的を果たしたことになるのか。
                </p>
              </div>
            </div>
            <div className="view" id="rule">
              <div className="k">法則</div>
              <div>
                <p className="q">結局、どんなルールで回っているのか？</p>
                <p>
                  表面だけ真似しない。うまくいった報告や資料の言い回しではなく、なぜそれが機能したのかという仕組みを抜き出すと、別の場面でも使える。
                </p>
              </div>
            </div>
            <div className="note">
              <p>
                <b>背景とゴールは、指示を受け取るときの視点でもある。</b>
                目的をつかまないまま作業に入ると、報告の中身も上司の期待とずれる。結果として「わからない」と言われる原因になる。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="consult">
        <div className="sec">
          <h2>モヤモヤのまま相談するとき</h2>
          <div>
            <h3>何が起きているか</h3>
            <p>
              頭がモヤモヤしたまま上司のところへ行くと、上司が質問を通して整理を代わりにやることになる。上司の質問は、5つの視点をその場で当てはめているのと同じ。先輩の補足は、抜けている前提や背景を足している。整理を人前でリアルタイムにやるので、誘導されているように感じ、時間もかかる。
            </p>
            <h3>どうするか</h3>
            <p>
              「何がわからないかわからない」は、全部がわからないわけではない。モヤモヤの中には、写真に撮れる部分（やったこと・起きたこと）と、撮れない部分（引っかかっているところ）が混ざっている。この二つを分けるだけで相談の形になる。分ける作業は
              <a href="#memo">相談前の5分メモ</a>でやる。
            </p>
            <h3>上司・先輩の質問ログ</h3>
            <p>
              上司によく聞かれること、先輩に横から補足されることは、上司が状況をつかむために必要な項目のリスト。毎回似た質問が来ているはずなので、控えておいて、次からは相談前に自分で答えておく。
            </p>
            <div className="field">
              <label htmlFor="hk-qlog">
                よく聞かれること・補足されること
                <span className="hint">このブラウザにだけ保存されます</span>
              </label>
              <textarea
                id="hk-qlog"
                className="tall"
                placeholder="例）いつまでに必要？　誰が決めるの？　で、何に困ってるの？"
                value={store.qlog}
                onChange={(e) => update({ qlog: e.target.value, seen: true })}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="band" id="practice">
        <div className="sec">
          <h2>普段の練習</h2>
          <div>
            <p>
              読んでいるときはわかった気がしても、「で、なぜ？」と聞かれると止まる。止まった場所を埋める練習が、言葉にするための準備になる。
            </p>
            <ul className="plain">
              <li>本を読んだら「つまり何の話だったのか」</li>
              <li>人の話を聞いたら「なぜこの話になったのか」</li>
              <li>問題が起きたら「どこから流れが崩れたのか」</li>
            </ul>
            <p>
              そう考えて、自分の言葉で説明し直す。説明できないところがあれば、そこを調べる、相手に聞く、もう一度自分の言葉にする。
            </p>
            <div className="note">
              <p>
                <b>記事が挙げている研究</b>
              </p>
              <p>
                人は物語を読むとき、出来事を時間・場所・人物・因果・意図で結びつけて理解している（Zwaanら、1995年）。
              </p>
              <p>
                教材を一文ずつ自分で説明した中学生は、2回読んだだけの生徒より理解度テストの成績が伸びた（Chiら、1994年。24人の小規模研究）。
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="band" id="source">
        <p>
          元記事：
          <a
            href="https://x.com/antoshia2n/status/2125507152722927871"
            target="_blank"
            rel="noopener noreferrer"
          >
            シアニン｜言語化コンサル「言語化できる人と、苦手な人の違いは『流れで捉える思考』」
          </a>
          （X、2026年11月25日）
        </p>
        <p>
          記事内の参考書籍：西岡壱誠『「考える技術」と「地頭力」がいっきに身につく
          東大思考』、安達裕哉『頭のいい人が話す前に考えていること』、細谷功『具体と抽象』
        </p>
        <p>メモと質問ログは、このブラウザの中にだけ保存されます。</p>
      </footer>
    </div>
  )
}

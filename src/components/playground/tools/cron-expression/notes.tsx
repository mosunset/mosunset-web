/** ツールの下に出す、cron でつまずきやすいところのまとめ（サーバーでも描画する） */
export function CronNotes() {
  const items = [
    {
      title: '日と曜日の両方を指定すると「どちらか」になる',
      body: '「0 9 13 * 5」は「13 日の金曜日」ではなく、「毎月 13 日」と「毎週金曜日」の両方で動きます（OR）。ただし、どちらかが * で始まる（*/2 など）と「両方」に当てはまる日だけになります。',
    },
    {
      title: 'タイムゾーンは動く場所で決まる',
      body: 'GitHub Actions と Cloudflare Workers の cron は UTC です。日本時間の 9:00 に動かすには、時を 0 にします（9 − 9 = 0）。日本時間の 0:00〜8:59 は、UTC では前の日になるので、曜日や日もずれます。',
    },
    {
      title: '曜日の数字は場所によって違う',
      body: 'Linux の crontab や GitHub Actions は 0 が日曜（7 も日曜）、Cloudflare Workers は 1 が日曜・7 が土曜です。MON・FRI のような名前で書くと間違えにくくなります。',
    },
    {
      title: '「*/n」は区切りのよいところから数える',
      body: '「*/7」（分）は 0・7・14 … 56 分のあと、次の時間の 0 分に戻るので、56 分から 0 分までは 4 分しか空きません。きっちり 7 分おきにはなりません。',
    },
    {
      title: '31 日や 2 月 29 日のように、ない月がある日付',
      body: '「0 0 31 * *」は 31 日がない月には動きません。月末に動かしたいときは、L（末日）が使える場所なら L を使います。',
    },
    {
      title: '夏時間がある地域',
      body: '切り替わる日は、存在しない時刻（飛ばされる 1 時間）や、2 回ある時刻ができます。実行されるかどうかは cron の実装によって違うので、夏時間の地域で動かすなら UTC で書くのが安全です。',
    },
  ]
  return (
    <section className="mt-10 space-y-4">
      <h2 className="text-lg font-semibold">つまずきやすいところ</h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div key={item.title} className="rounded-lg border p-4">
            <dt className="font-medium">{item.title}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        入力した式はサーバーに送らず、ブラウザの中だけで計算しています。
      </p>
    </section>
  )
}

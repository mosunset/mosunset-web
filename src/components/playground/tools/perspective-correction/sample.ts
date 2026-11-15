import { makeMapper, type Pt, type Quad } from './warp'

/**
 * 「サンプルで試す」の写真を、その場で描いて作る。
 * 方眼入りのチラシを描き、このツールと同じ式（射影変換＋辺のうねり）で、
 * 机の上に斜めから撮って少し反った紙のように貼り付ける。
 * 正しく合わせて変換すると、元のチラシ（A4 の縦横比）に戻る。
 */

const PHOTO_W = 1400
const PHOTO_H = 1050
const SHEET_W = 840
const SHEET_H = Math.round(SHEET_W * Math.SQRT2)

/** サンプルの紙の位置（写真の px）と、辺の反り */
export const sampleQuad: Quad = {
  // A4 の紙を、焦点距離 1150 px のカメラで斜めから撮ったときの四隅（光軸は写真の真ん中）
  corners: [
    { x: 494, y: 332 },
    { x: 963, y: 280 },
    { x: 1185, y: 807 },
    { x: 290, y: 869 },
  ],
  handles: [
    // 上: 小さく S 字にうねる
    [
      { x: 0, y: -12 },
      { x: 0, y: 9 },
    ],
    // 右: 外へふくらむ
    [
      { x: 14, y: 2 },
      { x: 20, y: 0 },
    ],
    // 下: 手前へふくらむ
    [
      { x: 0, y: 18 },
      { x: 0, y: 12 },
    ],
    // 左: 外へふくらむ
    [
      { x: -18, y: 0 },
      { x: -12, y: 0 },
    ],
  ],
}

function drawSheet(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SHEET_W
  c.height = SHEET_H
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('canvas を使えません')
  ctx.fillStyle = '#fbfaf6'
  ctx.fillRect(0, 0, SHEET_W, SHEET_H)

  // 方眼（補正がうまくいったかが分かりやすいように）
  ctx.strokeStyle = 'rgba(14, 116, 144, 0.16)'
  ctx.lineWidth = 2
  for (let x = 40; x < SHEET_W; x += 40) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, SHEET_H)
    ctx.stroke()
  }
  for (let y = 40; y < SHEET_H; y += 40) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(SHEET_W, y)
    ctx.stroke()
  }

  // 見出しの帯
  ctx.fillStyle = '#0e7490'
  ctx.fillRect(60, 60, SHEET_W - 120, 150)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 64px sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('射影変換のサンプル', 96, 135)

  // 絵（太陽と丘）
  ctx.save()
  ctx.beginPath()
  ctx.rect(60, 250, SHEET_W - 120, 420)
  ctx.clip()
  ctx.fillStyle = '#e0f2fe'
  ctx.fillRect(60, 250, SHEET_W - 120, 420)
  ctx.fillStyle = '#fcd34d'
  ctx.beginPath()
  ctx.arc(600, 370, 64, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#86efac'
  ctx.beginPath()
  ctx.moveTo(60, 670)
  ctx.bezierCurveTo(220, 470, 380, 520, 520, 600)
  ctx.bezierCurveTo(640, 540, 720, 520, SHEET_W - 60, 560)
  ctx.lineTo(SHEET_W - 60, 670)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#4ade80'
  ctx.beginPath()
  ctx.moveTo(60, 670)
  ctx.bezierCurveTo(180, 600, 300, 600, 420, 670)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // 本文の行（文字の代わりの灰色の帯）
  ctx.fillStyle = '#94a3b8'
  let y = 720
  for (let line = 0; line < 9; line++) {
    const w = line % 4 === 3 ? 380 : SHEET_W - 120 - ((line * 37) % 90)
    ctx.fillRect(60, y, w, 18)
    y += 40
  }

  // 下の帯と、四隅の目印
  ctx.fillStyle = '#f97316'
  ctx.fillRect(60, SHEET_H - 110, SHEET_W - 120, 50)
  ctx.strokeStyle = '#0f172a'
  ctx.lineWidth = 6
  ctx.strokeRect(20, 20, SHEET_W - 40, SHEET_H - 40)
  return c
}

/** 木目の机 */
function drawDesk(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, PHOTO_W, PHOTO_H)
  g.addColorStop(0, '#b07a4a')
  g.addColorStop(1, '#8a5a32')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H)
  for (let i = 0; i < 90; i++) {
    const y0 = (i / 90) * (PHOTO_H + 200) - 100
    ctx.strokeStyle = `rgba(70, 40, 20, ${0.05 + ((i * 7) % 5) * 0.025})`
    ctx.lineWidth = 1 + ((i * 13) % 4)
    ctx.beginPath()
    ctx.moveTo(0, y0)
    for (let x = 0; x <= PHOTO_W; x += 40) {
      ctx.lineTo(x, y0 + x * 0.12 + Math.sin(x / 140 + i) * 6)
    }
    ctx.stroke()
  }
  // 窓からの光（右上を明るく）
  const light = ctx.createRadialGradient(
    PHOTO_W,
    0,
    50,
    PHOTO_W,
    0,
    PHOTO_W * 1.2,
  )
  light.addColorStop(0, 'rgba(255, 248, 230, 0.35)')
  light.addColorStop(1, 'rgba(255, 248, 230, 0)')
  ctx.fillStyle = light
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H)
}

/** 三角形 s（紙の px）を三角形 d（写真の px）へ貼る */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  s: [Pt, Pt, Pt],
  d: [Pt, Pt, Pt],
) {
  // つなぎ目に細い線が出ないよう、貼る先を重心から少し広げる
  const cx = (d[0].x + d[1].x + d[2].x) / 3
  const cy = (d[0].y + d[1].y + d[2].y) / 3
  const grow = (p: Pt): Pt => {
    const dx = p.x - cx
    const dy = p.y - cy
    const len = Math.hypot(dx, dy) || 1
    return { x: p.x + (dx / len) * 0.8, y: p.y + (dy / len) * 0.8 }
  }
  const [g0, g1, g2] = d.map(grow)
  const det =
    (s[1].x - s[0].x) * (s[2].y - s[0].y) -
    (s[2].x - s[0].x) * (s[1].y - s[0].y)
  if (Math.abs(det) < 1e-9) return
  // s → d のアフィン変換
  const a =
    ((d[1].x - d[0].x) * (s[2].y - s[0].y) -
      (d[2].x - d[0].x) * (s[1].y - s[0].y)) /
    det
  const b =
    ((d[1].y - d[0].y) * (s[2].y - s[0].y) -
      (d[2].y - d[0].y) * (s[1].y - s[0].y)) /
    det
  const c =
    ((d[2].x - d[0].x) * (s[1].x - s[0].x) -
      (d[1].x - d[0].x) * (s[2].x - s[0].x)) /
    det
  const e =
    ((d[2].y - d[0].y) * (s[1].x - s[0].x) -
      (d[1].y - d[0].y) * (s[2].x - s[0].x)) /
    det
  const f = d[0].x - a * s[0].x - c * s[0].y
  const g = d[0].y - b * s[0].x - e * s[0].y
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(g0.x, g0.y)
  ctx.lineTo(g1.x, g1.y)
  ctx.lineTo(g2.x, g2.y)
  ctx.closePath()
  ctx.clip()
  ctx.setTransform(a, b, c, e, f, g)
  ctx.drawImage(img, 0, 0)
  ctx.restore()
}

export async function makeSamplePhoto(): Promise<Blob> {
  const photo = document.createElement('canvas')
  photo.width = PHOTO_W
  photo.height = PHOTO_H
  const ctx = photo.getContext('2d')
  const mapper = makeMapper(sampleQuad, true)
  if (!ctx || !mapper) throw new Error('canvas を使えません')
  drawDesk(ctx)

  const N = 48
  const grid: Pt[] = []
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      grid.push(mapper.map(i / N, j / N) ?? { x: 0, y: 0 })
    }
  }
  const at = (i: number, j: number) => grid[j * (N + 1) + i]

  // 紙の影
  ctx.save()
  ctx.shadowColor = 'rgba(40, 20, 5, 0.45)'
  ctx.shadowBlur = 28
  ctx.shadowOffsetX = -10
  ctx.shadowOffsetY = 14
  ctx.fillStyle = '#fbfaf6'
  ctx.beginPath()
  for (let i = 0; i <= N; i++) ctx.lineTo(at(i, 0).x, at(i, 0).y)
  for (let j = 0; j <= N; j++) ctx.lineTo(at(N, j).x, at(N, j).y)
  for (let i = N; i >= 0; i--) ctx.lineTo(at(i, N).x, at(i, N).y)
  for (let j = N; j >= 0; j--) ctx.lineTo(at(0, j).x, at(0, j).y)
  ctx.fill()
  ctx.restore()

  const sheet = drawSheet()
  const sx = SHEET_W / N
  const sy = SHEET_H / N
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const s00 = { x: i * sx, y: j * sy }
      const s10 = { x: (i + 1) * sx, y: j * sy }
      const s01 = { x: i * sx, y: (j + 1) * sy }
      const s11 = { x: (i + 1) * sx, y: (j + 1) * sy }
      drawTriangle(
        ctx,
        sheet,
        [s00, s10, s11],
        [at(i, j), at(i + 1, j), at(i + 1, j + 1)],
      )
      drawTriangle(
        ctx,
        sheet,
        [s00, s11, s01],
        [at(i, j), at(i + 1, j + 1), at(i, j + 1)],
      )
    }
  }

  // 紙の反りの陰影（左下から右上へ、うっすら明暗）
  ctx.save()
  ctx.beginPath()
  for (let i = 0; i <= N; i++) ctx.lineTo(at(i, 0).x, at(i, 0).y)
  for (let j = 0; j <= N; j++) ctx.lineTo(at(N, j).x, at(N, j).y)
  for (let i = N; i >= 0; i--) ctx.lineTo(at(i, N).x, at(i, N).y)
  for (let j = N; j >= 0; j--) ctx.lineTo(at(0, j).x, at(0, j).y)
  ctx.clip()
  const shade = ctx.createLinearGradient(290, 869, 963, 280)
  shade.addColorStop(0, 'rgba(0, 0, 0, 0.08)')
  shade.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)')
  shade.addColorStop(1, 'rgba(0, 0, 0, 0.04)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H)
  ctx.restore()

  return new Promise((resolve, reject) =>
    photo.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('作れませんでした'))),
      'image/jpeg',
      0.9,
    ),
  )
}

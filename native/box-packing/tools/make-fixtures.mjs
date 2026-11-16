// 確かめ・測る用の入力を作る（画面の初期値と、箱の多いもの）
import { writeFileSync } from 'node:fs'

const tidy = {
  weight: 50, group: true, flat: true, bigBottom: true, upright: true, even: true,
  bigWall: true, front: true, frontFlat: true, near: true, balance: true,
}
const base = {
  floorX: 1100, floorY: 1100, walls: { back: false, left: false, right: false },
  gap: 5, edgeGap: 5, supportPercent: 95, objective: 'height', wallBias: 50, tidy, seed: 1,
}
const out = new URL('../fixtures/', import.meta.url)
writeFileSync(new URL('default.json', out), JSON.stringify({
  ...base,
  boxes: [
    { tag: '冬服', x: 500, y: 400, z: 350, count: 4, canLayDown: false },
    { tag: '本', x: 400, y: 300, z: 250, count: 8, canLayDown: false },
    { tag: '食器', x: 330, y: 250, z: 200, count: 10, canLayDown: false },
    { tag: '細長いもの', x: 600, y: 200, z: 150, count: 4, canLayDown: true },
    { tag: '小物', x: 250, y: 200, z: 150, count: 4, canLayDown: false },
  ],
}, null, 2))

// mulberry32
function random(seed) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function randomBoxes(types, total, seed) {
  const r = random(seed)
  const size = () => Math.round((150 + r() * 450) / 10) * 10
  const boxes = []
  for (let i = 0; i < types; i++)
    boxes.push({ tag: `箱${i + 1}`, x: size(), y: size(), z: size(), count: 0, canLayDown: r() < 0.5 })
  for (let i = 0; i < total; i++) boxes[Math.floor(r() * types)].count++
  return boxes
}
writeFileSync(new URL('large.json', out), JSON.stringify({
  ...base, floorX: 1800, floorY: 1500, boxes: randomBoxes(12, 150, 3),
}, null, 2))
writeFileSync(new URL('walls.json', out), JSON.stringify({
  ...base, floorX: 1400, floorY: 1200, walls: { back: true, left: true, right: false },
  objective: 'floor', boxes: randomBoxes(8, 60, 5),
}, null, 2))

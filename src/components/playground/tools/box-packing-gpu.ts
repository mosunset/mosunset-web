/// <reference types="@webgpu/types" />
/**
 * 箱詰めの「1 つの並べ方で 1 つずつ置いていく」計算を、GPU（WebGPU）で何万通りも同時に行う。
 * 置き方の決め方は box-packing-solver.ts の packInOrder と同じ（同じ並べ方なら同じ置き方になる）:
 *   置く単位（ばらの箱か、同じ寸法の箱のかたまり）を並べ順に置く。候補 = 床の端か置いた単位の右・奥の端＋すき間
 *  （組み合わせが多いときは置いた単位の角のまわりだけ）、真下の上に乗せる、横のすき間、底面の支え、
 *   並べ方ごとのルールの重みで点数を付け、小さい順（同じなら先に見つけたほう）。
 * 置き終えたら、重心・置いた範囲・見た目の整い（同じ寸法のまとまり・平らさ・大きい箱が下・くぼみ）・塔も
 * GPU で見積もり、CPU が正式な点数に近い点数を出して、上位だけを CPU で正式に評価する（box-packing-gpu.worker.ts）。
 *
 * Windows は GPU の 1 回の計算が長いと GPU をリセットするので、「全部の並べ方について 1 つ置く」
 * 短い計算に分けて、何回かずつ GPU に渡す。
 */
import {
  alongSideFirstOf,
  anchorOf,
  type PackInput,
  RULE_SIZE,
  type UnitTable,
  unitExtras,
  wallSidesOf,
} from './box-packing-solver'

/** 置き方は単位 1 つにつき最大 6 通り */
const MAX_ORIENTATIONS = 6
/** 1 回に GPU へ渡す「1 つ置く」計算の数（長くなりすぎないように区切る） */
const STEPS_PER_SUBMIT = 8
/** 並べ方ごとの状態の数・見積もりの数 */
const SS = 10
const FS = 16
/** 並べ順の空き（並べ順の長さが単位の数より短いときの埋め草） */
export const NONE = 0xffffffff

const shader = /* wgsl */ `
struct Params {
  m: u32, k: u32, U: i32, V: i32,
  gap: i32, support: i32, alongUFirst: i32, stride: u32,
  wallV: i32, wallU: i32, evenStep: i32, evenReach: i32,
  spread: i32, nUnits: u32, pad1: i32, pad2: i32,
}
struct Best {
  found: i32, score: i32, u: i32, v: i32, z: i32, w: i32, d: i32, h: i32,
  flags: i32, internal: i32, boxVol: i32,
}

/** 置いた単位 1 つぶんの数（u, v, z, w, d, h, まとまり, 箱の数 + 256 × 横倒し, 中の接触面積, 箱 1 個の体積） */
const PS: u32 = 10u;
const SS: u32 = ${SS}u;
const FS: u32 = ${FS}u;
const NONE: u32 = 0xffffffffu;

@group(0) @binding(0) var<uniform> P: Params;
// 前半: 単位 × 6 の置き方 × 2（(w, d, h, 印), (中の接触面積, 箱 1 個の体積, 0, 0)）。
//       印 = 1（有効）+ 2（横倒し）+ 4 × 箱の数 + 256 × まとまりの番号
// 後半: 元の良い並べ方の記録（1 つごとに 3 つ: (u, v, z, w), (d, h, その時点で置いた数, その時点の高さ),
//       (まとまり, 箱の数 + 256 × 横倒し, 中の接触面積, 箱 1 個の体積)）
@group(0) @binding(1) var<storage, read> orients: array<vec4<i32>>;
// 並べ方ごとに stride 個: 置く単位の番号 × m（空きは NONE）、ルールの重み × 10
@group(0) @binding(2) var<storage, read> orders: array<u32>;
@group(0) @binding(3) var<storage, read_write> placed: array<i32>;
@group(0) @binding(4) var<storage, read_write> cand: array<i32>;
// 並べ方ごとに SS 個（次の位置, 置いた単位の数, u 候補の数, v 候補の数, 点の数, 高さ, 1 段目の面積, 横倒しの箱の数, 置いた箱の数, 0）
@group(0) @binding(5) var<storage, read_write> state: array<i32>;
// 並べ方ごとに FS 個（体積 × 重心の高さ, 体積, 体積 × u, 体積 × v, 範囲 4 つ, まとまり, 平ら, 大が下, くぼみ, 塔, 壁側, 0, 0）
@group(0) @binding(6) var<storage, read_write> fstate: array<f32>;

var<private> Wt: array<i32, 10>;

fn candSize() -> u32 { return 2u * (P.m + 1u) + 2u * (5u * P.m + 1u); }
fn usBase(k: u32) -> u32 { return k * candSize(); }
fn vsBase(k: u32) -> u32 { return usBase(k) + P.m + 1u; }
fn ptBase(k: u32) -> u32 { return usBase(k) + 2u * (P.m + 1u); }
fn recBase() -> u32 { return P.nUnits * 12u; }

fn scoreAt(height: i32, z: i32, h: i32, fixed: i32) -> i32 {
  let top = z + h;
  return Wt[0] * (max(height, top) - height) + Wt[1] * top + Wt[2] * z + fixed;
}

/** (u, v) に、この単位を置けるか（置き方ごとに）調べ、今の最良より良ければ入れ替える */
fn tryAt(k: u32, u: i32, v: i32, unit: u32, n: u32, height: i32, b: ptr<function, Best>) {
  let pb = k * P.m * PS;
  var a1 = v;
  var a2 = u;
  if (P.alongUFirst == 1) { a1 = u; a2 = v; }
  for (var o = 0u; o < 6u; o++) {
    let ori = orients[(unit * 6u + o) * 2u];
    if ((ori.w & 1) == 0) { continue; }
    let w = ori.x;
    let d = ori.y;
    let h = ori.z;
    let isLaid = (ori.w >> 1u) & 1;
    let grp = ori.w >> 8u;
    if (u + w > P.U || v + d > P.V) { continue; }
    let fixed = Wt[3] * isLaid * 100 + Wt[5] * a1 + Wt[6] * a2;
    if ((*b).found == 1 && scoreAt(height, 0, h, fixed) >= (*b).score) { continue; }
    var z = 0;
    for (var j = 0u; j < n; j++) {
      let q = pb + j * PS;
      let qu = placed[q]; let qv = placed[q + 1u]; let qz = placed[q + 2u];
      let qw = placed[q + 3u]; let qd = placed[q + 4u]; let qh = placed[q + 5u];
      if (u < qu + qw && qu < u + w && v < qv + qd && qv < v + d && qz + qh > z) { z = qz + qh; }
    }
    if ((*b).found == 1 && scoreAt(height, z, h, fixed) >= (*b).score) { continue; }
    var blocked = false;
    for (var j = 0u; j < n; j++) {
      let q = pb + j * PS;
      let qu = placed[q]; let qv = placed[q + 1u]; let qz = placed[q + 2u];
      let qw = placed[q + 3u]; let qd = placed[q + 4u]; let qh = placed[q + 5u];
      if (qz >= z + h || qz + qh <= z) { continue; }
      if (u < qu + qw + P.gap && qu < u + w + P.gap && v < qv + qd + P.gap && qv < v + d + P.gap) {
        blocked = true;
        break;
      }
    }
    if (blocked) { continue; }
    var align = 0;
    if (z > 0) {
      var sup = 0;
      for (var j = 0u; j < n; j++) {
        let q = pb + j * PS;
        let qu = placed[q]; let qv = placed[q + 1u]; let qz = placed[q + 2u];
        let qw = placed[q + 3u]; let qd = placed[q + 4u]; let qh = placed[q + 5u];
        if (qz + qh != z) { continue; }
        let ou = min(u + w, qu + qw) - max(u, qu);
        let ov = min(v + d, qv + qd) - max(v, qv);
        if (ou > 0 && ov > 0) {
          sup += ou * ov;
          if (qu == u) { align++; }
          if (qu + qw == u + w) { align++; }
          if (qv == v) { align++; }
          if (qv + qd == v + d) { align++; }
        }
      }
      // 大きな床では i32 があふれるので f32 で比べる
      if (w * d <= 20000000) {
        if (sup * 100 < P.support * w * d) { continue; }
      } else if (f32(sup) * 100.0 < f32(P.support) * f32(w) * f32(d)) { continue; }
    }
    var contact = 0;
    if (u == 0) { contact += d * h; }
    if (u + w == P.U) { contact += d * h; }
    if (v == 0) { contact += w * h; }
    if (v + d == P.V) { contact += w * h; }
    var boxContact = 0;
    var same = 0;
    var flush = 0;
    for (var j = 0u; j < n; j++) {
      let q = pb + j * PS;
      let qu = placed[q]; let qv = placed[q + 1u]; let qz = placed[q + 2u];
      let qw = placed[q + 3u]; let qd = placed[q + 4u]; let qh = placed[q + 5u];
      let oz = min(z + h, qz + qh) - max(z, qz);
      if (oz <= 0) { continue; }
      let isSame = placed[q + 6u] == grp;
      let isFlat = qz + qh == z + h;
      let ov = min(v + d, qv + qd) - max(v, qv);
      if (ov > 0 && (qu + qw + P.gap == u || u + w + P.gap == qu)) {
        contact += ov * oz;
        boxContact += ov * oz;
        if (isSame) { same += ov * oz; }
        if (isFlat) { flush += ov; }
        if (qv == v) { align++; }
        if (qv + qd == v + d) { align++; }
      }
      let ou = min(u + w, qu + qw) - max(u, qu);
      if (ou > 0 && (qv + qd + P.gap == v || v + d + P.gap == qv)) {
        contact += ou * oz;
        boxContact += ou * oz;
        if (isSame) { same += ou * oz; }
        if (isFlat) { flush += ou; }
        if (qu == u) { align++; }
        if (qu + qw == u + w) { align++; }
      }
    }
    let openR = 1000 - min(1000, contact / max(1, (2 * (w + d) * h) / 1000));
    let unflush = 1000 - min(1000, (flush * 1000) / (2 * (w + d)));
    let unaligned = 1000 - min(8, align) * 125;
    var notSame = 1000;
    if (boxContact > 0) { notSame = 1000 - min(1000, same / max(1, boxContact / 1000)); }
    let score = scoreAt(height, z, h, fixed) + Wt[4] * openR + Wt[7] * unflush + Wt[8] * unaligned + Wt[9] * notSame;
    if ((*b).found == 1 && score >= (*b).score) { continue; }
    let ex = orients[(unit * 6u + o) * 2u + 1u];
    (*b) = Best(1, score, u, v, z, w, d, h, ((ori.w >> 2u) & 63) | (isLaid << 8u), ex.x, ex.y);
  }
}

fn addPoint(k: u32, np: ptr<function, u32>, u: i32, v: i32) {
  if (u >= P.U || v >= P.V) { return; }
  let base = ptBase(k);
  for (var i = 0u; i < *np; i++) {
    if (cand[base + 2u * i] == u && cand[base + 2u * i + 1u] == v) { return; }
  }
  cand[base + 2u * (*np)] = u;
  cand[base + 2u * (*np) + 1u] = v;
  *np = *np + 1u;
}

fn addSet(base: u32, count: ptr<function, u32>, x: i32) {
  for (var i = 0u; i < *count; i++) {
    if (cand[base + i] == x) { return; }
  }
  cand[base + *count] = x;
  *count = *count + 1u;
}

fn addCands(k: u32, nu: ptr<function, u32>, nv: ptr<function, u32>, np: ptr<function, u32>, u: i32, v: i32, w: i32, d: i32) {
  addSet(usBase(k), nu, u + w + P.gap);
  addSet(vsBase(k), nv, v + d + P.gap);
  addPoint(k, np, u + w + P.gap, v);
  addPoint(k, np, u, v + d + P.gap);
  addPoint(k, np, u, v);
  addPoint(k, np, u + w + P.gap, 0);
  addPoint(k, np, 0, v + d + P.gap);
}

/**
 * 始める前の準備。state[k * SS] には CPU が「入れ替えた位置 s」を入れておく。
 * s より前は元の良い並べ方と同じ置き方になるので、その記録（orients の後ろ）を写し、
 * 候補の場所も同じ順に作り直してから、s 番目から計算する
 */
@compute @workgroup_size(64)
fn init(@builtin(global_invocation_id) gid: vec3<u32>) {
  let k = gid.x;
  if (k >= P.k) { return; }
  let sb = k * SS;
  let s = u32(state[sb]);
  let tb = recBase();
  var n0 = 0u;
  var height0 = 0;
  if (s > 0u) {
    let rec = orients[tb + 3u * (s - 1u) + 1u];
    n0 = u32(rec.z);
    height0 = rec.w;
  }
  cand[usBase(k)] = 0;
  cand[vsBase(k)] = 0;
  cand[ptBase(k)] = 0;
  cand[ptBase(k) + 1u] = 0;
  var nu = 1u;
  var nv = 1u;
  var np = 1u;
  var floorArea = 0;
  var laidBoxes = 0;
  var boxes = 0;
  var cog = 0.0;
  var vol = 0.0;
  for (var j = 0u; j < n0; j++) {
    let a = orients[tb + 3u * j];
    let b = orients[tb + 3u * j + 1u];
    let c = orients[tb + 3u * j + 2u];
    let u = a.x; let v = a.y; let z = a.z; let w = a.w; let d = b.x; let h = b.y;
    let q = k * P.m * PS + j * PS;
    placed[q] = u; placed[q + 1u] = v; placed[q + 2u] = z;
    placed[q + 3u] = w; placed[q + 4u] = d; placed[q + 5u] = h;
    placed[q + 6u] = c.x; placed[q + 7u] = c.y; placed[q + 8u] = c.z; placed[q + 9u] = c.w;
    addCands(k, &nu, &nv, &np, u, v, w, d);
    if (z == 0) { floorArea += w * d; }
    let size = c.y & 255;
    laidBoxes += (c.y >> 8u) * size;
    boxes += size;
    let bv = f32(w) * f32(d) * f32(h);
    cog += bv * (f32(z) + f32(h) / 2.0);
    vol += bv;
  }
  state[sb] = i32(s);
  state[sb + 1u] = i32(n0);
  state[sb + 2u] = i32(nu);
  state[sb + 3u] = i32(nv);
  state[sb + 4u] = i32(np);
  state[sb + 5u] = height0;
  state[sb + 6u] = floorArea;
  state[sb + 7u] = laidBoxes;
  state[sb + 8u] = boxes;
  fstate[k * FS] = cog;
  fstate[k * FS + 1u] = vol;
}

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let k = gid.x;
  if (k >= P.k) { return; }
  let sb = k * SS;
  let idx = u32(state[sb]);
  if (idx >= P.m) { return; }
  let unit = orders[k * P.stride + idx];
  // 並べ順の空きは後ろにまとまっているので、そこで終わり
  if (unit == NONE) {
    state[sb] = i32(P.m);
    return;
  }
  for (var i = 0u; i < 10u; i++) { Wt[i] = i32(orders[k * P.stride + P.m + i]); }
  var n = u32(state[sb + 1u]);
  var nu = u32(state[sb + 2u]);
  var nv = u32(state[sb + 3u]);
  var np = u32(state[sb + 4u]);
  var height = state[sb + 5u];
  var b: Best;
  b.found = 0;
  if (nu * nv <= 2500u) {
    for (var a = 0u; a < nu; a++) {
      let u = cand[usBase(k) + a];
      for (var c = 0u; c < nv; c++) {
        tryAt(k, u, cand[vsBase(k) + c], unit, n, height, &b);
      }
    }
  } else {
    for (var p = 0u; p < np; p++) {
      tryAt(k, cand[ptBase(k) + 2u * p], cand[ptBase(k) + 2u * p + 1u], unit, n, height, &b);
    }
  }
  if (b.found == 1) {
    let q = k * P.m * PS + n * PS;
    placed[q] = b.u; placed[q + 1u] = b.v; placed[q + 2u] = b.z;
    placed[q + 3u] = b.w; placed[q + 4u] = b.d; placed[q + 5u] = b.h;
    placed[q + 6u] = orients[unit * 12u].w >> 8u;
    placed[q + 7u] = b.flags; placed[q + 8u] = b.internal; placed[q + 9u] = b.boxVol;
    n++;
    addCands(k, &nu, &nv, &np, b.u, b.v, b.w, b.d);
    height = max(height, b.z + b.h);
    if (b.z == 0) { state[sb + 6u] = state[sb + 6u] + b.w * b.d; }
    let size = b.flags & 255;
    state[sb + 7u] = state[sb + 7u] + (b.flags >> 8u) * size;
    state[sb + 8u] = state[sb + 8u] + size;
    let vol = f32(b.w) * f32(b.d) * f32(b.h);
    fstate[k * FS] = fstate[k * FS] + vol * (f32(b.z) + f32(b.h) / 2.0);
    fstate[k * FS + 1u] = fstate[k * FS + 1u] + vol;
  }
  state[sb] = i32(idx + 1u);
  state[sb + 1u] = i32(n);
  state[sb + 2u] = i32(nu);
  state[sb + 3u] = i32(nv);
  state[sb + 4u] = i32(np);
  state[sb + 5u] = height;
}

/**
 * 置き終えたあとの見積もり。重心と置いた範囲、見た目の整い（同じ寸法どうしの接触・平らさ・大きい箱が下・
 * くぼみと飛び出し）、塔の度合いを、CPU の正式な評価（finish）に近いやり方で、粗いマス目で測る
 */
@compute @workgroup_size(64)
fn fin(@builtin(global_invocation_id) gid: vec3<u32>) {
  let k = gid.x;
  if (k >= P.k) { return; }
  let n = u32(state[k * SS + 1u]);
  let pb = k * P.m * PS;
  let fb = k * FS;
  var su = 0.0;
  var sv = 0.0;
  var minU = 1e9;
  var maxU = 0.0;
  var minV = 1e9;
  var maxV = 0.0;
  var cAll = 0.0;
  var cSame = 0.0;
  var sAll = 0.0;
  var sBad = 0.0;
  for (var j = 0u; j < n; j++) {
    let q = pb + j * PS;
    let pu = placed[q]; let pv = placed[q + 1u]; let pz = placed[q + 2u];
    let pw = placed[q + 3u]; let pd = placed[q + 4u]; let ph = placed[q + 5u];
    let pg = placed[q + 6u]; let pVol = placed[q + 9u];
    let vol = f32(pw) * f32(pd) * f32(ph);
    su += vol * (f32(pu) + f32(pw) / 2.0);
    sv += vol * (f32(pv) + f32(pd) / 2.0);
    minU = min(minU, f32(pu));
    maxU = max(maxU, f32(pu + pw));
    minV = min(minV, f32(pv));
    maxV = max(maxV, f32(pv + pd));
    let internal = f32(placed[q + 8u]);
    cAll += internal;
    cSame += internal;
    for (var i = j + 1u; i < n; i++) {
      let r = pb + i * PS;
      let ru = placed[r]; let rv = placed[r + 1u]; let rz = placed[r + 2u];
      let rw = placed[r + 3u]; let rd = placed[r + 4u]; let rh = placed[r + 5u];
      let ox = min(pu + pw, ru + rw) - max(pu, ru);
      let oy = min(pv + pd, rv + rd) - max(pv, rv);
      let oz = min(pz + ph, rz + rh) - max(pz, rz);
      if (oz > 0) {
        var area = 0.0;
        if (oy > 0 && (pu + pw + P.gap == ru || ru + rw + P.gap == pu)) { area += f32(oy) * f32(oz); }
        if (ox > 0 && (pv + pd + P.gap == rv || rv + rd + P.gap == pv)) { area += f32(ox) * f32(oz); }
        cAll += area;
        if (pg == placed[r + 6u]) { cSame += area; }
      }
      if (ox > 0 && oy > 0) {
        let area = f32(ox) * f32(oy);
        let rVol = placed[r + 9u];
        if (pz + ph == rz) {
          sAll += area;
          if (rVol > pVol) { sBad += area; }
        } else if (rz + rh == pz) {
          sAll += area;
          if (pVol > rVol) { sBad += area; }
        }
      }
    }
  }
  var grp = 1.0;
  if (cAll > 0.0) { grp = cSame / cAll; }
  var bigBottom = 1.0;
  if (sAll > 0.0) { bigBottom = 1.0 - sBad / sAll; }

  // 置いた範囲の高さの地図（16 × 16）。箱は少し広げて塗る（決めたすき間ほどの細いすき間は埋まって見える）
  var tops: array<f32, 256>;
  let cw = max(1.0, maxU - minU) / 16.0;
  let ch = max(1.0, maxV - minV) / 16.0;
  let sp = f32(P.spread);
  var maxTop = 0.0;
  var sum = 0.0;
  for (var c = 0u; c < 256u; c++) {
    let px = minU + (f32(c % 16u) + 0.5) * cw;
    let py = minV + (f32(c / 16u) + 0.5) * ch;
    var top = 0.0;
    for (var j = 0u; j < n; j++) {
      let q = pb + j * PS;
      let u = f32(placed[q]); let v = f32(placed[q + 1u]);
      if (px >= u - sp && px < u + f32(placed[q + 3u]) + sp && py >= v - sp && py < v + f32(placed[q + 4u]) + sp) {
        top = max(top, f32(placed[q + 2u] + placed[q + 5u]));
      }
    }
    tops[c] = top;
    maxTop = max(maxTop, top);
    sum += top;
  }
  let mean = sum / 256.0;
  var varSum = 0.0;
  for (var c = 0u; c < 256u; c++) { varSum += (tops[c] - mean) * (tops[c] - mean); }
  var flatV = 1.0;
  if (maxTop > 0.0) { flatV = max(0.0, 1.0 - 2.0 * sqrt(varSum / 256.0) / maxTop); }

  // くぼみ（両側に段差以上高いところがある）と飛び出し（両側の近くに段差以上低いところがある）
  var bad: array<u32, 8>;
  let stepH = f32(P.evenStep);
  for (var axis = 0u; axis < 2u; axis++) {
    var size = cw;
    if (axis == 1u) { size = ch; }
    let R = max(1u, u32(round(f32(P.evenReach) / size)));
    for (var ln = 0u; ln < 16u; ln++) {
      for (var p = 0u; p < 16u; p++) {
        var cell = ln * 16u + p;
        if (axis == 1u) { cell = p * 16u + ln; }
        let t = tops[cell];
        var leftMax = 0.0;
        var rightMax = 0.0;
        var lowL = false;
        var lowR = false;
        for (var x = 0u; x < 16u; x++) {
          var oc = ln * 16u + x;
          if (axis == 1u) { oc = x * 16u + ln; }
          let o = tops[oc];
          if (x < p) {
            leftMax = max(leftMax, o);
            if (p - x <= R && o <= t - stepH) { lowL = true; }
          } else if (x > p) {
            rightMax = max(rightMax, o);
            if (x - p <= R && o <= t - stepH) { lowR = true; }
          }
        }
        if (min(leftMax, rightMax) - t >= stepH || (lowL && lowR)) {
          bad[cell / 32u] = bad[cell / 32u] | (1u << (cell % 32u));
        }
      }
    }
  }
  var badCount = 0u;
  for (var i = 0u; i < 8u; i++) { badCount += countOneBits(bad[i]); }
  let even = max(0.0, 1.0 - 5.0 * f32(badCount) / 256.0);

  // 塔: 床全体の高さの地図（16 × 16）で、まわりより飛び抜けて高いところと、壁側より高いところ
  let fw = f32(P.U) / 16.0;
  let fh = f32(P.V) / 16.0;
  for (var c = 0u; c < 256u; c++) {
    let px = (f32(c % 16u) + 0.5) * fw;
    let py = (f32(c / 16u) + 0.5) * fh;
    var top = 0.0;
    for (var j = 0u; j < n; j++) {
      let q = pb + j * PS;
      let u = f32(placed[q]); let v = f32(placed[q + 1u]);
      if (px >= u && px < u + f32(placed[q + 3u]) && py >= v && py < v + f32(placed[q + 4u])) {
        top = max(top, f32(placed[q + 2u] + placed[q + 5u]));
      }
    }
    tops[c] = top;
  }
  var spike = 0.0;
  var towardWall = 0.0;
  for (var c = 0u; c < 256u; c++) {
    let h = tops[c];
    if (h == 0.0) { continue; }
    let i = c % 16u;
    let j = c / 16u;
    var around = 0.0;
    var count = 0.0;
    if (i > 0u) { around += tops[c - 1u]; count += 1.0; }
    if (i < 15u) { around += tops[c + 1u]; count += 1.0; }
    if (j > 0u) { around += tops[c - 16u]; count += 1.0; }
    if (j < 15u) { around += tops[c + 16u]; count += 1.0; }
    spike += max(0.0, h - around / count);
    if (P.wallV == 1 && j > 0u) { towardWall += max(0.0, h - tops[c - 16u]); }
    if (P.wallU == 1 && i > 0u) { towardWall += max(0.0, h - tops[c - 1u]); }
  }

  fstate[fb + 2u] = su;
  fstate[fb + 3u] = sv;
  fstate[fb + 4u] = minU;
  fstate[fb + 5u] = maxU;
  fstate[fb + 6u] = minV;
  fstate[fb + 7u] = maxV;
  fstate[fb + 8u] = grp;
  fstate[fb + 9u] = flatV;
  fstate[fb + 10u] = bigBottom;
  fstate[fb + 11u] = even;
  fstate[fb + 12u] = spike;
  fstate[fb + 13u] = towardWall;
}
`

/** 元の良い並べ方の記録（traceIds の結果） */
export type GpuBase = {
  /** 置いた単位ごとに u, v, z, w, d, h, まとまり, 箱の数 + 256 × 横倒し, 中の接触面積, 箱 1 個の体積 */
  placed: readonly (readonly number[])[]
  placedAfter: readonly number[]
  heightAfter: readonly number[]
}

/** GPU で評価した結果（並べ方ごと） */
export type GpuMetrics = {
  height: Int32Array
  /** 置けた箱の数 */
  placed: Int32Array
  floorArea: Int32Array
  cogZ: Float32Array
  /** 正式な点数に近い点数（小さいほど良い）と、見た目の整いの見積もり（0〜1） */
  score: Float64Array
  tidiness: Float32Array
}

export type GpuContext = {
  device: GPUDevice
  init: GPUComputePipeline
  step: GPUComputePipeline
  fin: GPUComputePipeline
  layout: GPUBindGroupLayout
  description: string
}

/** GPU を使えるようにする（使えなければ null） */
export async function createGpuContext(): Promise<GpuContext | null> {
  const gpu = (globalThis.navigator as Navigator | undefined)?.gpu
  if (!gpu) return null
  const adapter = await gpu.requestAdapter({
    powerPreference: 'high-performance',
  })
  if (!adapter) return null
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBuffersPerShaderStage: Math.min(
        8,
        adapter.limits.maxStorageBuffersPerShaderStage,
      ),
    },
  })
  const module = device.createShaderModule({ code: shader })
  const info = await module.getCompilationInfo()
  if (info.messages.some((m) => m.type === 'error')) {
    console.error(
      info.messages.map((m) => `${m.lineNum}: ${m.message}`).join('\n'),
    )
    return null
  }
  const layout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'uniform' },
      },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'read-only-storage' },
      },
      ...[3, 4, 5, 6].map((binding) => ({
        binding,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: 'storage' as const },
      })),
    ],
  })
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [layout],
  })
  const make = (entryPoint: string) =>
    device.createComputePipeline({
      layout: pipelineLayout,
      compute: { module, entryPoint },
    })
  const info2 = adapter.info
  return {
    device,
    init: make('init'),
    step: make('step'),
    fin: make('fin'),
    layout,
    description: [info2?.vendor, info2?.architecture, info2?.description]
      .filter(Boolean)
      .join(' '),
  }
}

/**
 * 1 つの組み合わせ（設定）について、並べ方をまとめて評価する部品を作る。
 * 並べ方は「置く単位の番号 × m（空きは NONE）＋ ルールの重み × RULE_SIZE」の行
 */
export function createGpuEvaluator(
  ctx: GpuContext,
  input: PackInput,
  table: UnitTable,
) {
  const { device } = ctx
  const m = Math.max(1, table.boxCount)
  const stride = m + RULE_SIZE
  const nUnits = table.units.length
  const orientData = new Int32Array((nUnits * MAX_ORIENTATIONS * 2 + m * 3) * 4)
  table.units.forEach((unit, i) => {
    unit.orientations.slice(0, MAX_ORIENTATIONS).forEach((o, j) => {
      const at = (i * MAX_ORIENTATIONS + j) * 2 * 4
      orientData.set(
        [
          o.w,
          o.d,
          o.h,
          1 + (o.laidDown ? 2 : 0) + 4 * unit.size + 256 * unit.group,
        ],
        at,
      )
      const ex = unitExtras(table, i, j)
      orientData.set(
        [ex.internal, Math.round(ex.boxVolume / 1000), 0, 0],
        at + 4,
      )
    })
  })
  const S = GPUBufferUsage.STORAGE
  const orientBuf = device.createBuffer({
    size: orientData.byteLength,
    usage: S | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(orientBuf, 0, orientData)
  const paramBuf = device.createBuffer({
    size: 64,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const U = input.floorX - 2 * input.edgeGap
  const V = input.floorY - 2 * input.edgeGap
  const walls = wallSidesOf(input.walls)
  // くぼみを数える段差と近さ（CPU の unevenShare と同じ考え方。箱の高さ・長い辺の中央値から）
  const median = (xs: number[]) =>
    [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
  const heights: number[] = []
  const longs: number[] = []
  for (const g of table.groups) {
    const o = g.orientations[0]
    for (let i = 0; i < g.members.length; i++) {
      heights.push(o.h)
      longs.push(Math.max(o.w, o.d))
    }
  }
  const evenStep = Math.max(20, Math.round(median(heights) / 2))
  const evenReach = Math.max(1, median(longs))

  // 並べ方の数ごとに作る作業用の場所（数が変わったら作り直す）
  let cap = 0
  let bufs: GPUBuffer[] = []
  let orderBuf: GPUBuffer
  let stateBuf: GPUBuffer
  let fstateBuf: GPUBuffer
  let readState: GPUBuffer
  let readF: GPUBuffer
  let bind: GPUBindGroup
  const candSize = 2 * (m + 1) + 2 * (5 * m + 1)
  const ensure = (k: number) => {
    if (k <= cap) return
    for (const b of bufs) b.destroy()
    cap = k
    orderBuf = device.createBuffer({
      size: k * stride * 4,
      usage: S | GPUBufferUsage.COPY_DST,
    })
    const placedBuf = device.createBuffer({ size: k * m * 10 * 4, usage: S })
    const candBuf = device.createBuffer({ size: k * candSize * 4, usage: S })
    stateBuf = device.createBuffer({
      size: k * SS * 4,
      usage: S | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
    fstateBuf = device.createBuffer({
      size: k * FS * 4,
      usage: S | GPUBufferUsage.COPY_SRC,
    })
    readState = device.createBuffer({
      size: k * SS * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    readF = device.createBuffer({
      size: k * FS * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    bufs = [orderBuf, placedBuf, candBuf, stateBuf, fstateBuf, readState, readF]
    bind = device.createBindGroup({
      layout: ctx.layout,
      entries: [
        paramBuf,
        orientBuf,
        orderBuf,
        placedBuf,
        candBuf,
        stateBuf,
        fstateBuf,
      ].map((buffer, binding) => ({ binding, resource: { buffer } })),
    })
  }

  // 一度に評価できる並べ方の数の上限（作業用の場所が、いちばん大きいものでも 256MB に収まるように）
  const bytesPerOrder = Math.max(candSize * 4, m * 10 * 4, stride * 4)
  const maxBatch = Math.max(
    64,
    Math.floor(
      Math.min(256 * 1024 * 1024, device.limits.maxStorageBufferBindingSize) /
        bytesPerOrder /
        64,
    ) * 64,
  )

  // 正式な点数（solver の finish）に近い点数を出すための値
  const { floorX: X, floorY: Y, edgeGap: e } = input
  const anchor = anchorOf(input.walls)
  const allVolume = input.boxes.reduce(
    (s, b) => s + b.x * b.y * b.z * b.count,
    0,
  )
  const h0 = Math.max(1, allVolume / (X * Y))
  const tooBigCount = table.tooBig.reduce((s, u) => s + u.count, 0)
  const offset = (input.wallBias / 100) * 0.25
  const tx =
    X / 2 +
    (input.walls.left === input.walls.right
      ? 0
      : input.walls.left
        ? -offset * X
        : offset * X)
  const ty = Y / 2 + (input.walls.back ? offset * Y : 0)
  const hasWall = input.walls.back || input.walls.left || input.walls.right
  const cogWeight = hasWall ? 0.15 + 0.35 * (input.wallBias / 100) : 0.3
  const centerX = input.walls.left === input.walls.right
  const centerY = !input.walls.back
  const tidy = input.tidy

  return {
    /** 並べ順の長さ（箱の数）と、1 行の長さ */
    m,
    stride,
    maxBatch,
    /**
     * k 通りの並べ方（k × stride）をまとめて評価する。
     * starts[i] は、i 番目の並べ方が元の良い並べ方（base）と初めて違う位置。そこより前は base の記録を写す。
     * 同じ GPU の計算単位（32 本ずつ）の中で starts が近いほど、待ちが減って速い
     */
    async evaluate(
      rows: Uint32Array,
      starts: Int32Array,
      base: GpuBase,
      k: number,
      /** いちばん長い並べ順の長さ（そこから先は空きなので、計算しない） */
      length = m,
    ): Promise<GpuMetrics> {
      ensure(k)
      // 元の良い並べ方の記録を、orients の後ろに書く
      const rec = new Int32Array(m * 3 * 4)
      for (let j = 0; j < m; j++) {
        const p = base.placed[j]
        if (p) rec.set([p[0], p[1], p[2], p[3]], j * 12)
        rec.set(
          [
            p ? p[4] : 0,
            p ? p[5] : 0,
            base.placedAfter[j] ?? 0,
            base.heightAfter[j] ?? 0,
          ],
          j * 12 + 4,
        )
        if (p) rec.set([p[6], p[7], p[8], Math.round(p[9] / 1000)], j * 12 + 8)
      }
      device.queue.writeBuffer(
        orientBuf,
        nUnits * MAX_ORIENTATIONS * 2 * 16,
        rec,
      )
      // 入れ替えた位置を、state の先頭に入れておく（init が読む）
      const st0 = new Int32Array(k * SS)
      let minStart = m
      for (let i = 0; i < k; i++) {
        st0[i * SS] = starts[i]
        if (starts[i] < minStart) minStart = starts[i]
      }
      device.queue.writeBuffer(stateBuf, 0, st0)
      device.queue.writeBuffer(
        paramBuf,
        0,
        new Int32Array([
          m,
          k,
          U,
          V,
          input.gap,
          input.supportPercent,
          alongSideFirstOf(input.walls) ? 1 : 0,
          stride,
          walls.wallV ? 1 : 0,
          walls.wallU ? 1 : 0,
          evenStep,
          evenReach,
          input.gap + 10,
          nUnits,
          0,
          0,
        ]),
      )
      device.queue.writeBuffer(orderBuf, 0, rows, 0, k * stride)
      const groups = Math.ceil(k / 64)
      const run = (pipeline: GPUComputePipeline, times: number) => {
        const enc = device.createCommandEncoder()
        for (let t = 0; t < times; t++) {
          const pass = enc.beginComputePass()
          pass.setPipeline(pipeline)
          pass.setBindGroup(0, bind)
          pass.dispatchWorkgroups(groups)
          pass.end()
        }
        return enc
      }
      device.queue.submit([run(ctx.init, 1).finish()])
      // 「1 つ置く」を、何回かずつ区切って GPU に渡す（1 回の計算を短くして、GPU のリセットを避ける）。
      // 区切りは全部まとめて先に渡しておく（JavaScript が次の回の準備で忙しいあいだも、GPU が止まらない）
      const last = Math.min(m, Math.max(1, length))
      const chunks: GPUCommandBuffer[] = []
      for (let done = minStart; done < last; done += STEPS_PER_SUBMIT) {
        chunks.push(
          run(ctx.step, Math.min(STEPS_PER_SUBMIT, last - done)).finish(),
        )
      }
      for (const chunk of chunks) device.queue.submit([chunk])
      const enc = run(ctx.fin, 1)
      enc.copyBufferToBuffer(stateBuf, 0, readState, 0, k * SS * 4)
      enc.copyBufferToBuffer(fstateBuf, 0, readF, 0, k * FS * 4)
      device.queue.submit([enc.finish()])
      await Promise.all([
        readState.mapAsync(GPUMapMode.READ, 0, k * SS * 4),
        readF.mapAsync(GPUMapMode.READ, 0, k * FS * 4),
      ])
      const st = new Int32Array(
        readState.getMappedRange(0, k * SS * 4).slice(0),
      )
      const fs = new Float32Array(readF.getMappedRange(0, k * FS * 4).slice(0))
      readState.unmap()
      readF.unmap()
      const height = new Int32Array(k)
      const placed = new Int32Array(k)
      const floorArea = new Int32Array(k)
      const cogZ = new Float32Array(k)
      const score = new Float64Array(k)
      const tidiness = new Float32Array(k)
      for (let i = 0; i < k; i++) {
        const s = i * SS
        const f = i * FS
        height[i] = st[s + 5]
        floorArea[i] = st[s + 6]
        placed[i] = st[s + 8]
        const vol = fs[f + 1]
        cogZ[i] = vol > 0 ? fs[f] / vol : 0
        // 置いた範囲と重心を床の座標に直す（solver の finish と同じ向きの直し方と、中央への寄せ方）
        let cogError = 0
        if (vol > 0) {
          const cu = fs[f + 2] / vol
          const cv = fs[f + 3] / vol
          const [x0, x1, cx] = anchor.fromRight
            ? [X - e - fs[f + 5], X - e - fs[f + 4], X - e - cu]
            : [e + fs[f + 4], e + fs[f + 5], e + cu]
          const [y0, y1, cy] = anchor.fromBack
            ? [Y - e - fs[f + 7], Y - e - fs[f + 6], Y - e - cv]
            : [e + fs[f + 6], e + fs[f + 7], e + cv]
          const dx = centerX ? Math.round((X - x1 - x0) / 2) : 0
          const dy = centerY ? Math.round((Y - y1 - y0) / 2) : 0
          cogError = Math.hypot((cx + dx - tx) / X, (cy + dy - ty) / Y)
        }
        const parts: number[] = []
        if (tidy.group) parts.push(fs[f + 8])
        if (tidy.flat) parts.push(fs[f + 9])
        if (tidy.bigBottom) parts.push(fs[f + 10])
        if (tidy.upright)
          parts.push(placed[i] > 0 ? 1 - st[s + 7] / placed[i] : 1)
        if (tidy.even) parts.push(fs[f + 11])
        const penalty = parts.reduce((a, x) => a + (1 - x), 0)
        tidiness[i] =
          parts.length > 0 ? parts.reduce((a, x) => a + x, 0) / parts.length : 1
        const floorCoverage = floorArea[i] / (X * Y)
        score[i] =
          100 * (table.boxCount - placed[i] + tooBigCount) +
          (input.objective === 'height'
            ? height[i] / h0
            : 3 * (1 - floorCoverage) + 0.3 * (height[i] / h0)) +
          cogWeight * cogError +
          (0.3 * (0.5 * fs[f + 12] + fs[f + 13])) / (256 * h0) +
          0.05 * (cogZ[i] / h0) +
          (tidy.weight / 100) * 0.3 * penalty
      }
      return { height, placed, floorArea, cogZ, score, tidiness }
    },
    destroy() {
      for (const b of bufs) b.destroy()
      orientBuf.destroy()
      paramBuf.destroy()
    },
  }
}

export type GpuEvaluator = ReturnType<typeof createGpuEvaluator>

/// <reference types="@webgpu/types" />
/**
 * 箱詰めの「1 つの並べ順で 1 個ずつ置いていく」計算を、GPU（WebGPU）で何千通りも同時に行う。
 * 置き方の決め方は box-packing-solver.ts の packInOrder と同じ（同じ並べ順なら同じ置き方になる）:
 *   候補 = 床の端か置いた箱の右・奥の端＋すき間（組み合わせが多いときは置いた箱の角のまわりだけ）、
 *   真下の箱の上に乗せる、横のすき間、底面の支え、点数の小さい順（同じなら先に見つけたほう）。
 * GPU が返すのは、高さ・置けた数・1 段目の面積・重心の高さだけ。重心の前後左右や「ぽつんと高い塔」は
 * 置き場所が要るので、上位の並べ順だけを CPU で正式に評価する（box-packing-gpu.worker.ts）。
 *
 * Windows は GPU の 1 回の計算が長いと GPU をリセットするので、「全部の並べ順について 1 個置く」
 * 短い計算に分けて、何回かずつ GPU に渡す。
 */
import { alongSideFirstOf, itemsOf, type PackInput } from './box-packing-solver'

/** 置き方は箱 1 個につき最大 6 通り */
const MAX_ORIENTATIONS = 6
/** 1 回に GPU へ渡す「1 個置く」計算の数（長くなりすぎないように区切る） */
const STEPS_PER_SUBMIT = 8

const shader = /* wgsl */ `
struct Params {
  m: u32, k: u32, U: i32, V: i32,
  gap: i32, support: i32, objective: i32, alongUFirst: i32,
}
struct Best {
  found: i32, s0: i32, s1: i32, s2: i32, s3: i32, s4: i32,
  u: i32, v: i32, z: i32, w: i32, d: i32, h: i32,
}

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> orients: array<vec4<i32>>;  // 箱 × 6（w, d, h, 有効なら 1）
@group(0) @binding(2) var<storage, read> orders: array<u32>;         // 並べ順 × 箱（箱の番号）
@group(0) @binding(3) var<storage, read_write> placed: array<i32>;   // 並べ順 × 箱 × 6（u, v, z, w, d, h）
@group(0) @binding(4) var<storage, read_write> cand: array<i32>;     // 並べ順ごとに u の候補・v の候補・角の点
@group(0) @binding(5) var<storage, read_write> state: array<i32>;    // 並べ順 × 8（次の箱, 置いた数, u 候補の数, v 候補の数, 点の数, 高さ, 1 段目の面積）
@group(0) @binding(6) var<storage, read_write> fstate: array<f32>;   // 並べ順 × 2（体積 × 重心の高さの和, 体積の和）

fn candSize() -> u32 { return 2u * (P.m + 1u) + 2u * (5u * P.m + 1u); }
fn usBase(k: u32) -> u32 { return k * candSize(); }
fn vsBase(k: u32) -> u32 { return usBase(k) + P.m + 1u; }
fn ptBase(k: u32) -> u32 { return usBase(k) + 2u * (P.m + 1u); }

fn makeScore(height: i32, z: i32, h: i32, u: i32, v: i32) -> array<i32, 5> {
  var a0 = v;
  var a1 = u;
  if (P.alongUFirst == 1) { a0 = u; a1 = v; }
  let top = z + h;
  if (P.objective == 0) { return array<i32, 5>(max(height, top), top, z, a0, a1); }
  return array<i32, 5>(z, top, a0, a1, 0);
}

/** s が今の最良より（同じなら負け）良いか */
fn better(s: array<i32, 5>, b: ptr<function, Best>) -> bool {
  if ((*b).found == 0) { return true; }
  if (s[0] != (*b).s0) { return s[0] < (*b).s0; }
  if (s[1] != (*b).s1) { return s[1] < (*b).s1; }
  if (s[2] != (*b).s2) { return s[2] < (*b).s2; }
  if (s[3] != (*b).s3) { return s[3] < (*b).s3; }
  if (s[4] != (*b).s4) { return s[4] < (*b).s4; }
  return false;
}

/** (u, v) に、この箱を置けるか（置き方ごとに）調べ、今の最良より良ければ入れ替える */
fn tryAt(k: u32, u: i32, v: i32, item: u32, n: u32, height: i32, b: ptr<function, Best>) {
  let pb = k * P.m * 6u;
  for (var o = 0u; o < 6u; o++) {
    let ori = orients[item * 6u + o];
    if (ori.w == 0) { continue; }
    let w = ori.x;
    let d = ori.y;
    let h = ori.z;
    if (u + w > P.U || v + d > P.V) { continue; }
    // 床に直接置けたとしても勝てない場所は、調べるまでもない
    if (!better(makeScore(height, 0, h, u, v), b)) { continue; }
    var z = 0;
    for (var j = 0u; j < n; j++) {
      let q = pb + j * 6u;
      let qu = placed[q]; let qv = placed[q + 1u]; let qz = placed[q + 2u];
      let qw = placed[q + 3u]; let qd = placed[q + 4u]; let qh = placed[q + 5u];
      if (u < qu + qw && qu < u + w && v < qv + qd && qv < v + d && qz + qh > z) { z = qz + qh; }
    }
    let s = makeScore(height, z, h, u, v);
    if (!better(s, b)) { continue; }
    var blocked = false;
    for (var j = 0u; j < n; j++) {
      let q = pb + j * 6u;
      let qu = placed[q]; let qv = placed[q + 1u]; let qz = placed[q + 2u];
      let qw = placed[q + 3u]; let qd = placed[q + 4u]; let qh = placed[q + 5u];
      if (qz >= z + h || qz + qh <= z) { continue; }
      if (u < qu + qw + P.gap && qu < u + w + P.gap && v < qv + qd + P.gap && qv < v + d + P.gap) {
        blocked = true;
        break;
      }
    }
    if (blocked) { continue; }
    if (z > 0) {
      var sup = 0;
      for (var j = 0u; j < n; j++) {
        let q = pb + j * 6u;
        let qu = placed[q]; let qv = placed[q + 1u]; let qz = placed[q + 2u];
        let qw = placed[q + 3u]; let qd = placed[q + 4u]; let qh = placed[q + 5u];
        if (qz + qh != z) { continue; }
        let ou = min(u + w, qu + qw) - max(u, qu);
        let ov = min(v + d, qv + qd) - max(v, qv);
        if (ou > 0 && ov > 0) { sup += ou * ov; }
      }
      // 大きな床では i32 があふれるので f32 で比べる
      if (w * d <= 20000000) {
        if (sup * 100 < P.support * w * d) { continue; }
      } else if (f32(sup) * 100.0 < f32(P.support) * f32(w) * f32(d)) { continue; }
    }
    (*b) = Best(1, s[0], s[1], s[2], s[3], s[4], u, v, z, w, d, h);
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

/**
 * 始める前の準備。state[k * 8] には CPU が「入れ替えた位置 s」を入れておく。
 * s より前は元の良い並べ順と同じ置き方になるので、その記録（orients の後ろ）を写し、
 * 候補の場所も同じ順に作り直してから、s 番目から計算する
 */
@compute @workgroup_size(64)
fn init(@builtin(global_invocation_id) gid: vec3<u32>) {
  let k = gid.x;
  if (k >= P.k) { return; }
  let sb = k * 8u;
  let s = u32(state[sb]);
  let tb = P.m * 6u;
  var n0 = 0u;
  var height0 = 0;
  if (s > 0u) {
    let rec = orients[tb + 2u * (s - 1u) + 1u];
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
  var cog = 0.0;
  var vol = 0.0;
  for (var j = 0u; j < n0; j++) {
    let a = orients[tb + 2u * j];
    let b = orients[tb + 2u * j + 1u];
    let u = a.x; let v = a.y; let z = a.z; let w = a.w; let d = b.x; let h = b.y;
    let q = k * P.m * 6u + j * 6u;
    placed[q] = u; placed[q + 1u] = v; placed[q + 2u] = z;
    placed[q + 3u] = w; placed[q + 4u] = d; placed[q + 5u] = h;
    addSet(usBase(k), &nu, u + w + P.gap);
    addSet(vsBase(k), &nv, v + d + P.gap);
    addPoint(k, &np, u + w + P.gap, v);
    addPoint(k, &np, u, v + d + P.gap);
    addPoint(k, &np, u, v);
    addPoint(k, &np, u + w + P.gap, 0);
    addPoint(k, &np, 0, v + d + P.gap);
    if (z == 0) { floorArea += w * d; }
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
  state[sb + 7u] = 0;
  fstate[k * 2u] = cog;
  fstate[k * 2u + 1u] = vol;
}

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let k = gid.x;
  if (k >= P.k) { return; }
  let sb = k * 8u;
  let idx = u32(state[sb]);
  if (idx >= P.m) { return; }
  let item = orders[k * P.m + idx];
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
        tryAt(k, u, cand[vsBase(k) + c], item, n, height, &b);
      }
    }
  } else {
    for (var p = 0u; p < np; p++) {
      tryAt(k, cand[ptBase(k) + 2u * p], cand[ptBase(k) + 2u * p + 1u], item, n, height, &b);
    }
  }
  if (b.found == 1) {
    let q = k * P.m * 6u + n * 6u;
    placed[q] = b.u; placed[q + 1u] = b.v; placed[q + 2u] = b.z;
    placed[q + 3u] = b.w; placed[q + 4u] = b.d; placed[q + 5u] = b.h;
    n++;
    addSet(usBase(k), &nu, b.u + b.w + P.gap);
    addSet(vsBase(k), &nv, b.v + b.d + P.gap);
    addPoint(k, &np, b.u + b.w + P.gap, b.v);
    addPoint(k, &np, b.u, b.v + b.d + P.gap);
    addPoint(k, &np, b.u, b.v);
    addPoint(k, &np, b.u + b.w + P.gap, 0);
    addPoint(k, &np, 0, b.v + b.d + P.gap);
    height = max(height, b.z + b.h);
    if (b.z == 0) { state[sb + 6u] = state[sb + 6u] + b.w * b.d; }
    let vol = f32(b.w) * f32(b.d) * f32(b.h);
    fstate[k * 2u] = fstate[k * 2u] + vol * (f32(b.z) + f32(b.h) / 2.0);
    fstate[k * 2u + 1u] = fstate[k * 2u + 1u] + vol;
  }
  state[sb] = i32(idx + 1u);
  state[sb + 1u] = i32(n);
  state[sb + 2u] = i32(nu);
  state[sb + 3u] = i32(nv);
  state[sb + 4u] = i32(np);
  state[sb + 5u] = height;
}
`

/** 元の良い並べ順の記録（traceOrder の結果） */
export type GpuBase = {
  placed: readonly (readonly number[])[]
  placedAfter: readonly number[]
  heightAfter: readonly number[]
}

/** GPU で評価した結果（並べ順ごと） */
export type GpuMetrics = {
  height: Int32Array
  placed: Int32Array
  floorArea: Int32Array
  cogZ: Float32Array
}

export type GpuContext = {
  device: GPUDevice
  init: GPUComputePipeline
  step: GPUComputePipeline
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
    layout,
    description: [info2?.vendor, info2?.architecture, info2?.description]
      .filter(Boolean)
      .join(' '),
  }
}

/**
 * 1 つの組み合わせ（設定）について、並べ順をまとめて評価する部品を作る。
 * 並べ順は itemsOf の箱の番号（0〜m-1）の列
 */
export function createGpuEvaluator(ctx: GpuContext, input: PackInput) {
  const { device } = ctx
  const { items } = itemsOf(input)
  const m = items.length
  // 前半は箱ごとの置き方（箱 × 6）、後半は元の良い並べ順の記録（1 個ごとに 2 つ:
  // (u, v, z, w), (d, h, その時点で置いた数, その時点の高さ)）。後半は評価のたびに書き換える
  const orientData = new Int32Array(Math.max(1, m) * (MAX_ORIENTATIONS + 2) * 4)
  items.forEach((it, i) => {
    it.orientations.slice(0, MAX_ORIENTATIONS).forEach((o, j) => {
      orientData.set([o.w, o.d, o.h, 1], (i * MAX_ORIENTATIONS + j) * 4)
    })
  })
  const S = GPUBufferUsage.STORAGE
  const orientBuf = device.createBuffer({
    size: orientData.byteLength,
    usage: S | GPUBufferUsage.COPY_DST,
  })
  device.queue.writeBuffer(orientBuf, 0, orientData)
  const paramBuf = device.createBuffer({
    size: 32,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  // 並べ順の数ごとに作る作業用の場所（数が変わったら作り直す）
  let cap = 0
  let bufs: GPUBuffer[] = []
  let orderBuf: GPUBuffer
  let stateBuf: GPUBuffer
  let fstateBuf: GPUBuffer
  let readState: GPUBuffer
  let readF: GPUBuffer
  let bind: GPUBindGroup
  const ensure = (k: number) => {
    if (k <= cap) return
    for (const b of bufs) b.destroy()
    cap = k
    orderBuf = device.createBuffer({
      size: k * m * 4,
      usage: S | GPUBufferUsage.COPY_DST,
    })
    const placedBuf = device.createBuffer({ size: k * m * 6 * 4, usage: S })
    const candBuf = device.createBuffer({
      size: k * (2 * (m + 1) + 2 * (5 * m + 1)) * 4,
      usage: S,
    })
    stateBuf = device.createBuffer({
      size: k * 8 * 4,
      usage: S | GPUBufferUsage.COPY_SRC,
    })
    fstateBuf = device.createBuffer({
      size: k * 2 * 4,
      usage: S | GPUBufferUsage.COPY_SRC,
    })
    readState = device.createBuffer({
      size: k * 8 * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    readF = device.createBuffer({
      size: k * 2 * 4,
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

  // 一度に評価できる並べ順の数の上限（作業用の場所が、いちばん大きいものでも 256MB に収まるように）
  const bytesPerOrder = Math.max((2 * (m + 1) + 2 * (5 * m + 1)) * 4, m * 6 * 4)
  const maxBatch = Math.max(
    64,
    Math.floor(
      Math.min(256 * 1024 * 1024, device.limits.maxStorageBufferBindingSize) /
        bytesPerOrder /
        64,
    ) * 64,
  )

  return {
    /** 箱の数と、箱の番号 → 種類の番号 */
    m,
    types: items.map((it) => it.type),
    maxBatch,
    /**
     * k 通りの並べ順（k × m）をまとめて評価する。
     * starts[i] は、i 番目の並べ順が元の良い並べ順（base）と初めて違う位置。そこより前は base の記録を写す。
     * 同じ GPU の計算単位（32 本ずつ）の中で starts が近いほど、待ちが減って速い
     */
    async evaluate(
      orders: Uint32Array,
      starts: Int32Array,
      base: GpuBase,
      k: number,
    ): Promise<GpuMetrics> {
      ensure(k)
      // 元の良い並べ順の記録を、orients の後ろに書く
      const rec = new Int32Array(m * 2 * 4)
      for (let j = 0; j < m; j++) {
        const p = base.placed[j]
        if (p) rec.set([p[0], p[1], p[2], p[3]], j * 8)
        rec.set(
          [
            p ? p[4] : 0,
            p ? p[5] : 0,
            base.placedAfter[j] ?? 0,
            base.heightAfter[j] ?? 0,
          ],
          j * 8 + 4,
        )
      }
      device.queue.writeBuffer(orientBuf, m * MAX_ORIENTATIONS * 16, rec)
      // 入れ替えた位置を、state の先頭に入れておく（init が読む）
      const st0 = new Int32Array(k * 8)
      let minStart = m
      for (let i = 0; i < k; i++) {
        st0[i * 8] = starts[i]
        if (starts[i] < minStart) minStart = starts[i]
      }
      device.queue.writeBuffer(stateBuf, 0, st0)
      const U = input.floorX - 2 * input.edgeGap
      const V = input.floorY - 2 * input.edgeGap
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
          input.objective === 'height' ? 0 : 1,
          alongSideFirstOf(input.walls) ? 1 : 0,
        ]),
      )
      device.queue.writeBuffer(orderBuf, 0, orders, 0, k * m)
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
      // 「1 個置く」を、何回かずつ区切って GPU に渡す（1 回の計算を短くして、GPU のリセットを避ける）。
      // いちばん早く入れ替えた位置から最後までの回数だけでよい
      for (let done = minStart; done < m; done += STEPS_PER_SUBMIT) {
        device.queue.submit([
          run(ctx.step, Math.min(STEPS_PER_SUBMIT, m - done)).finish(),
        ])
        await device.queue.onSubmittedWorkDone()
      }
      const enc = device.createCommandEncoder()
      enc.copyBufferToBuffer(stateBuf, 0, readState, 0, k * 8 * 4)
      enc.copyBufferToBuffer(fstateBuf, 0, readF, 0, k * 2 * 4)
      device.queue.submit([enc.finish()])
      await Promise.all([
        readState.mapAsync(GPUMapMode.READ, 0, k * 8 * 4),
        readF.mapAsync(GPUMapMode.READ, 0, k * 2 * 4),
      ])
      const st = new Int32Array(readState.getMappedRange(0, k * 8 * 4).slice(0))
      const fs = new Float32Array(readF.getMappedRange(0, k * 2 * 4).slice(0))
      readState.unmap()
      readF.unmap()
      const height = new Int32Array(k)
      const placed = new Int32Array(k)
      const floorArea = new Int32Array(k)
      const cogZ = new Float32Array(k)
      for (let i = 0; i < k; i++) {
        placed[i] = st[i * 8 + 1]
        height[i] = st[i * 8 + 5]
        floorArea[i] = st[i * 8 + 6]
        cogZ[i] = fs[i * 2 + 1] > 0 ? fs[i * 2] / fs[i * 2 + 1] : 0
      }
      return { height, placed, floorArea, cogZ }
    },
    destroy() {
      for (const b of bufs) b.destroy()
      orientBuf.destroy()
      paramBuf.destroy()
    },
  }
}

export type GpuEvaluator = ReturnType<typeof createGpuEvaluator>

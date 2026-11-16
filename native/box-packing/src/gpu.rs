//! GPU で何千通りもまとめて置いてみる（置く場所の決め方は kernel.cu）。
//! 置いた結果は CPU のすべてのコアで正式に評価する（finish）。ブラウザー版のように見積もりではなく、
//! GPU で試したすべての並べ方の点数が、正式な点数になる。

use crate::cuda::Gpu;
use crate::solver::*;
use std::ffi::c_void;

const NF: usize = 10;
const KERNEL: &str = include_str!("kernel.cu");
pub const MAX_PARENTS: usize = 16;
const BLOCK: u32 = 64;

pub struct Cand {
    pub ids: Vec<usize>,
    pub rule: Rule,
    /// 置き方を写す元（親）の番号。-1 なら最初から置く
    pub parent: i32,
    pub start: usize,
}

pub struct GpuPacker {
    pub gpu: Gpu,
    func: *mut c_void,
    func_warp: *mut c_void,
    /// true: 1 ワープで 1 通り（packWarp）/ false: 1 スレッドで 1 通り（pack）
    pub warp: bool,
    warps: usize,
    scratch: u64,
    maxm: usize,
    cap: usize,
    units: u64,
    u: i32,
    v: i32,
    gap: i32,
    support: i32,
    along: i32,
    // 候補
    cand_ids: u64,
    cand_len: u64,
    cand_w: u64,
    cand_parent: u64,
    cand_start: u64,
    // 親
    par_placed: u64,
    par_placed_after: u64,
    par_height_after: u64,
    par_unplaced: u64,
    par_unplaced_after: u64,
    // 結果
    out_placed: u64,
    out_np: u64,
    out_unplaced: u64,
    out_nu: u64,
    out_height: u64,
}

unsafe impl Send for GpuPacker {}

/// GPU で置いた結果（finish に渡せる形）
pub struct Packed {
    pub trace: Trace,
}

impl GpuPacker {
    pub fn new(ctx: &Ctx, cap: usize) -> Result<GpuPacker, String> {
        let gpu = Gpu::open()?;
        let table = &ctx.table;
        let input = ctx.input;
        let maxm = table.box_count.max(1);
        let t0 = std::time::Instant::now();
        let warps = (12288 / (maxm * NF)).clamp(1, 4);
        let cubin = crate::cuda::compile(KERNEL, gpu.sm, &[("MAXM", maxm.to_string()), ("WARPS", warps.to_string())])?;
        eprintln!(
            "GPU: {}（sm_{}{}・{} SM）、カーネルを {:.0} ms でコンパイル（{} バイト）",
            gpu.name,
            gpu.sm.0,
            gpu.sm.1,
            gpu.sm_count,
            t0.elapsed().as_secs_f64() * 1000.0,
            cubin.len()
        );
        let func = gpu.load(&cubin, "pack")?;
        let func_warp = gpu.load(&cubin, "packWarp")?;
        let mut ut: Vec<i32> = Vec::new();
        for u in &table.units {
            let mut row = vec![0i32; 33];
            row[0] = u.orientations.len() as i32;
            row[1] = u.group as i32;
            row[2] = u.rank as i32;
            for (i, o) in u.orientations.iter().enumerate().take(6) {
                row[3 + i * 5] = o.w as i32;
                row[3 + i * 5 + 1] = o.d as i32;
                row[3 + i * 5 + 2] = o.h as i32;
                row[3 + i * 5 + 3] = o.laid as i32;
                row[3 + i * 5 + 4] = o.front_ok as i32;
            }
            ut.extend(row);
        }
        let units = gpu.alloc(ut.len() * 4)?;
        gpu.upload(units, &ut)?;
        let a = |n: usize| gpu.alloc(n * 4);
        let scr = 2 * (maxm + 1) + 2 * (5 * maxm + 1);
        let p = GpuPacker {
            func,
            func_warp,
            warp: true,
            warps,
            scratch: a(cap * scr)?,
            maxm,
            cap,
            units,
            u: (input.floor_x - 2 * input.edge_gap) as i32,
            v: (input.floor_y - 2 * input.edge_gap) as i32,
            gap: input.gap as i32,
            support: input.support_percent as i32,
            along: anchor_of(&input.walls).along_side_first as i32,
            cand_ids: a(cap * maxm)?,
            cand_len: a(cap)?,
            cand_w: a(cap * RULE_SIZE)?,
            cand_parent: a(cap)?,
            cand_start: a(cap)?,
            par_placed: a(MAX_PARENTS * maxm * NF)?,
            par_placed_after: a(MAX_PARENTS * maxm)?,
            par_height_after: a(MAX_PARENTS * maxm)?,
            par_unplaced: a(MAX_PARENTS * maxm)?,
            par_unplaced_after: a(MAX_PARENTS * maxm)?,
            out_placed: a(cap * maxm * NF)?,
            out_np: a(cap)?,
            out_unplaced: a(cap * maxm)?,
            out_nu: a(cap)?,
            out_height: a(cap)?,
            gpu,
        };
        Ok(p)
    }

    pub fn capacity(&self) -> usize {
        self.cap
    }

    /// 親の置き方を GPU に送る（候補はここから先だけを置き直す）
    pub fn set_parents(&self, parents: &[&Trace]) -> Result<(), String> {
        let m = self.maxm;
        let n = parents.len().min(MAX_PARENTS);
        let mut placed = vec![0i32; n * m * NF];
        let mut pa = vec![0i32; n * m];
        let mut ha = vec![0i32; n * m];
        let mut un = vec![0i32; n * m];
        let mut ua = vec![0i32; n * m];
        for (pi, t) in parents.iter().take(n).enumerate() {
            for (k, p) in t.placed.iter().enumerate() {
                let o = (pi * m + k) * NF;
                placed[o..o + NF].copy_from_slice(&[
                    p.u as i32,
                    p.v as i32,
                    p.z as i32,
                    p.w as i32,
                    p.d as i32,
                    p.h as i32,
                    p.group as i32,
                    p.rank as i32,
                    p.unit as i32,
                    p.oi as i32,
                ]);
            }
            for (k, &x) in t.placed_after.iter().enumerate() {
                pa[pi * m + k] = x as i32;
                ha[pi * m + k] = t.height_after[k] as i32;
                ua[pi * m + k] = t.unplaced_after[k] as i32;
            }
            for (k, &x) in t.unplaced.iter().enumerate() {
                un[pi * m + k] = x as i32;
            }
        }
        let g = &self.gpu;
        g.upload(self.par_placed, &placed)?;
        g.upload(self.par_placed_after, &pa)?;
        g.upload(self.par_height_after, &ha)?;
        g.upload(self.par_unplaced, &un)?;
        g.upload(self.par_unplaced_after, &ua)?;
        Ok(())
    }

    pub fn run(&self, cands: &[Cand], table: &Table) -> Result<Vec<Packed>, String> {
        let b = cands.len();
        assert!(b <= self.cap);
        if b == 0 {
            return Ok(vec![]);
        }
        let m = self.maxm;
        let mut ids = vec![0i32; b * m];
        let mut len = vec![0i32; b];
        let mut w = vec![0i32; b * RULE_SIZE];
        let mut parent = vec![-1i32; b];
        let mut start = vec![0i32; b];
        for (i, c) in cands.iter().enumerate() {
            for (k, &id) in c.ids.iter().enumerate() {
                ids[i * m + k] = id as i32;
            }
            len[i] = c.ids.len() as i32;
            w[i * RULE_SIZE..(i + 1) * RULE_SIZE].copy_from_slice(&c.rule);
            parent[i] = c.parent;
            start[i] = c.start as i32;
        }
        let g = &self.gpu;
        g.bind()?;
        g.upload(self.cand_ids, &ids)?;
        g.upload(self.cand_len, &len)?;
        g.upload(self.cand_w, &w)?;
        g.upload(self.cand_parent, &parent)?;
        g.upload(self.cand_start, &start)?;
        let bi = b as i32;
        let mut args: [*mut c_void; 23] = [
            &self.units as *const u64 as *mut c_void,
            &self.u as *const i32 as *mut c_void,
            &self.v as *const i32 as *mut c_void,
            &self.gap as *const i32 as *mut c_void,
            &self.support as *const i32 as *mut c_void,
            &self.along as *const i32 as *mut c_void,
            &self.cand_ids as *const u64 as *mut c_void,
            &self.cand_len as *const u64 as *mut c_void,
            &self.cand_w as *const u64 as *mut c_void,
            &self.cand_parent as *const u64 as *mut c_void,
            &self.cand_start as *const u64 as *mut c_void,
            &self.par_placed as *const u64 as *mut c_void,
            &self.par_placed_after as *const u64 as *mut c_void,
            &self.par_height_after as *const u64 as *mut c_void,
            &self.par_unplaced as *const u64 as *mut c_void,
            &self.par_unplaced_after as *const u64 as *mut c_void,
            &self.out_placed as *const u64 as *mut c_void,
            &self.out_np as *const u64 as *mut c_void,
            &self.out_unplaced as *const u64 as *mut c_void,
            &self.out_nu as *const u64 as *mut c_void,
            &self.out_height as *const u64 as *mut c_void,
            &bi as *const i32 as *mut c_void,
            &self.scratch as *const u64 as *mut c_void,
        ];
        if self.warp {
            let w = self.warps as u32;
            g.launch(self.func_warp, (b as u32).div_ceil(w), w * 32, &mut args)?;
        } else {
            g.launch(self.func, (b as u32).div_ceil(BLOCK), BLOCK, &mut args[..22])?;
        }
        let mut np = vec![0i32; b];
        let mut nu = vec![0i32; b];
        let mut height = vec![0i32; b];
        g.download(&mut np, self.out_np)?;
        g.download(&mut nu, self.out_nu)?;
        g.download(&mut height, self.out_height)?;
        let max_np = np.iter().copied().max().unwrap_or(0) as usize;
        let mut placed = vec![0i32; max_np * NF * b];
        g.download(&mut placed, self.out_placed)?;
        let mut unplaced = vec![0i32; b * m];
        if nu.iter().any(|&x| x > 0) {
            g.download(&mut unplaced, self.out_unplaced)?;
        }
        let out = (0..b)
            .map(|c| {
                let at = |k: usize, f: usize| placed[(k * NF + f) * b + c];
                let ps: Vec<Placed> = (0..np[c] as usize)
                    .map(|k| {
                        let unit = at(k, 8) as usize;
                        Placed {
                            unit: unit as u32,
                            oi: at(k, 9) as u32,
                            group: at(k, 6) as u32,
                            rank: at(k, 7) as i64,
                            u: at(k, 0) as i64,
                            v: at(k, 1) as i64,
                            z: at(k, 2) as i64,
                            w: at(k, 3) as i64,
                            d: at(k, 4) as i64,
                            h: at(k, 5) as i64,
                        }
                    })
                    .collect();
                let _ = table;
                Packed {
                    trace: Trace {
                        placed: ps,
                        unplaced: (0..nu[c] as usize).map(|k| unplaced[c * m + k] as usize).collect(),
                        height: height[c] as i64,
                        ..Default::default()
                    },
                }
            })
            .collect();
        Ok(out)
    }
}

impl Drop for GpuPacker {
    fn drop(&mut self) {
        for p in [
            self.scratch,
            self.units,
            self.cand_ids,
            self.cand_len,
            self.cand_w,
            self.cand_parent,
            self.cand_start,
            self.par_placed,
            self.par_placed_after,
            self.par_height_after,
            self.par_unplaced,
            self.par_unplaced_after,
            self.out_placed,
            self.out_np,
            self.out_unplaced,
            self.out_nu,
            self.out_height,
        ] {
            self.gpu.free(p);
        }
    }
}

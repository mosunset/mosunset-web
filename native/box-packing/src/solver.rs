//! box-packing-solver.ts の計算をそのまま Rust に移したもの。
//! 置く場所の決め方（packInOrder）と評価（finish）は、TS と同じ数字になるように
//! 計算の順番（候補を調べる順・浮動小数の足し算の順）までそろえている。

use crate::model::*;
use std::collections::{HashMap, HashSet};

// ---- 箱の向き ----

#[derive(Clone, Copy, Debug)]
pub struct Orient {
    pub w: i64,
    pub d: i64,
    pub h: i64,
    pub faces: [Face; 6],
    pub laid: bool,
    pub front_ok: bool,
}

const PERMUTATIONS: [[usize; 3]; 6] = [
    [0, 1, 2],
    [1, 0, 2],
    [0, 2, 1],
    [2, 0, 1],
    [1, 2, 0],
    [2, 1, 0],
];

fn parity(p: &[usize; 3]) -> i32 {
    let mut sign = 1;
    for i in 0..3 {
        for j in (i + 1)..3 {
            if p[i] > p[j] {
                sign = -sign;
            }
        }
    }
    sign
}

/// 元の軸と向きから面（上0 下1 左2 右3 前4 後5）
fn face_name(axis: usize, sign: i32) -> Face {
    match (axis, sign > 0) {
        (0, true) => 3,
        (0, false) => 2,
        (1, true) => 5,
        (1, false) => 4,
        (2, true) => 0,
        _ => 1,
    }
}

/// 上に向けてよい面（上・前・左）
const ALLOWED_UP: [Face; 3] = [0, 4, 2];

pub fn orientations_of(b: &BoxSpec, all: bool) -> Vec<Orient> {
    let dims = [b.x, b.y, b.z];
    let mut result = Vec::new();
    let mut seen: Vec<(i64, i64, i64)> = Vec::new();
    for p in &PERMUTATIONS {
        for s in 0..8 {
            let signs = [
                if s & 1 != 0 { -1 } else { 1 },
                if s & 2 != 0 { -1 } else { 1 },
                if s & 4 != 0 { -1 } else { 1 },
            ];
            if parity(p) * signs[0] * signs[1] * signs[2] != 1 {
                continue;
            }
            let mut faces = [0u8; 6];
            for i in 0..3 {
                faces[2 * i] = face_name(p[i], signs[i]);
                faces[2 * i + 1] = face_name(p[i], -signs[i]);
            }
            let up = faces[4];
            let upright = up == UP;
            if !ALLOWED_UP.contains(&up) || (!upright && !b.can_lay_down) {
                continue;
            }
            let (w, d, h) = (dims[p[0]], dims[p[1]], dims[p[2]]);
            let key = (w, d, h);
            if !all && seen.contains(&key) {
                continue;
            }
            seen.push(key);
            result.push(Orient { w, d, h, faces, laid: !upright, front_ok: false });
        }
    }
    result
}

pub fn fits_floor(b: &BoxSpec, input: &PackInput) -> bool {
    let u = input.floor_x - 2 * input.edge_gap;
    let v = input.floor_y - 2 * input.edge_gap;
    orientations_of(b, false).iter().any(|o| o.w <= u && o.d <= v)
}

// ---- かたまり ----

pub struct Group {
    pub members: Vec<usize>,
    pub orientations: Vec<Orient>,
}

pub struct Unit {
    pub group: usize,
    pub a: i64,
    pub b: i64,
    pub c: i64,
    pub size: i64,
    pub code: i64,
    pub rank: i64,
    pub orientations: Vec<Orient>,
    pub base: Vec<usize>,
}

const MAX_SIDE: i64 = 4;
const MAX_FLOOR: i64 = 8;
const MAX_STACK: i64 = 3;
const MAX_UNIT: i64 = 12;

fn code_of(group: usize, a: i64, b: i64, c: i64) -> i64 {
    group as i64 * 64 + (c - 1) * 16 + (a - 1) * 4 + (b - 1)
}

pub struct Table {
    pub groups: Vec<Group>,
    pub units: Vec<Unit>,
    pub single: Vec<usize>,
    pub by_code: HashMap<i64, usize>,
    pub too_big: Vec<Unplaced>,
    pub box_count: usize,
    pub orients_by_type: Vec<Vec<Orient>>,
}

impl Table {
    fn unit_at(&self, g: usize, a: i64, b: i64, c: i64) -> Option<usize> {
        if a < 1 || b < 1 || c < 1 || a > MAX_SIDE || b > MAX_SIDE || c > MAX_STACK {
            return None;
        }
        self.by_code.get(&code_of(g, a, b, c)).copied()
    }
}

/// JS の Math.round（0.5 は +∞ 側へ）
fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

pub fn units_of(input: &PackInput) -> Table {
    let mut groups: Vec<Group> = Vec::new();
    let mut too_big = Vec::new();
    let mut key_index: HashMap<(i64, i64, i64, bool), usize> = HashMap::new();
    let mut orients_by_type = Vec::new();
    for (ty, b) in input.boxes.iter().enumerate() {
        orients_by_type.push(orientations_of(b, true));
        if b.count <= 0 {
            continue;
        }
        if !fits_floor(b, input) {
            too_big.push(Unplaced { ty, count: b.count, reason: "too-big" });
            continue;
        }
        let key = (b.x, b.y, b.z, b.can_lay_down);
        let g = *key_index.entry(key).or_insert_with(|| {
            groups.push(Group { members: vec![], orientations: orientations_of(b, false) });
            groups.len() - 1
        });
        for _ in 0..b.count {
            groups[g].members.push(ty);
        }
    }
    let uu = input.floor_x - 2 * input.edge_gap;
    let vv = input.floor_y - 2 * input.edge_gap;
    let gap = input.gap;
    let mut units: Vec<Unit> = Vec::new();
    let mut single = vec![usize::MAX; groups.len()];
    let mut by_code = HashMap::new();
    let mut present: Vec<usize> = groups.iter().flat_map(|g| g.members.iter().copied()).collect();
    present.sort_unstable();
    present.dedup();
    let rank_of_type: HashMap<usize, usize> = present.iter().enumerate().map(|(i, t)| (*t, i)).collect();
    let rank_scale = 1000.0 / (present.len() as f64 - 1.0).max(1.0);
    for (gi, g) in groups.iter().enumerate() {
        let n = g.members.len() as i64;
        let sum: usize = g.members.iter().map(|t| rank_of_type[t]).sum();
        let rank = js_round((sum as f64 / n as f64) * rank_scale) as i64;
        let all = &orients_by_type[g.members[0]];
        for c in 1..=MAX_STACK {
            for a in 1..=MAX_SIDE {
                for b in 1..=MAX_SIDE {
                    let size = a * b * c;
                    if size > n || size > MAX_UNIT || a * b > MAX_FLOOR {
                        continue;
                    }
                    let mut orientations = Vec::new();
                    let mut base = Vec::new();
                    let mut seen: Vec<(i64, i64, i64)> = Vec::new();
                    for (oi, o) in g.orientations.iter().enumerate() {
                        let w = a * o.w + (a - 1) * gap;
                        let d = b * o.d + (b - 1) * gap;
                        let h = c * o.h;
                        if w > uu || d > vv {
                            continue;
                        }
                        if seen.contains(&(w, d, h)) {
                            continue;
                        }
                        seen.push((w, d, h));
                        let front_ok = all.iter().any(|x| {
                            x.w == o.w && x.d == o.d && x.h == o.h && x.laid == o.laid && x.faces[3] == FRONT
                        });
                        orientations.push(Orient { w, d, h, faces: o.faces, laid: o.laid, front_ok });
                        base.push(oi);
                    }
                    if orientations.is_empty() {
                        continue;
                    }
                    let code = code_of(gi, a, b, c);
                    if size == 1 {
                        single[gi] = units.len();
                    }
                    by_code.insert(code, units.len());
                    units.push(Unit { group: gi, a, b, c, size, code, rank, orientations, base });
                }
            }
        }
    }
    let box_count = groups.iter().map(|g| g.members.len()).sum();
    Table { groups, units, single, by_code, too_big, box_count, orients_by_type }
}

// ---- ルール ----

pub const RULE_SIZE: usize = 12;
pub const RULE_MAX: i32 = 11;
pub type Rule = [i32; RULE_SIZE];
pub type Weights = [i64; RULE_SIZE];

pub fn weights_of(rule: &Rule) -> Weights {
    let mut w = [0i64; RULE_SIZE];
    for i in 0..RULE_SIZE {
        w[i] = if rule[i] <= 0 { 0 } else { 1i64 << (rule[i] - 1) };
    }
    w
}

pub fn default_rules(input: &PackInput) -> [Rule; 3] {
    let t = input.tidy.weight > 0.0;
    let up = if t && input.tidy.upright { 5 } else { 0 };
    let same = if t && input.tidy.group { 5 } else { 2 };
    let front = if t && input.tidy.front { 5 } else { 0 };
    let near = if t && input.tidy.near { 5 } else { 0 };
    [
        if input.objective == Objective::Height {
            [11, 8, 6, up, 4, 2, 1, 0, 0, same, front, near]
        } else {
            [3, 8, 11, up, 5, 2, 1, 0, 0, same, front, near]
        },
        [9, 7, 5, up, 6, 2, 1, 8, 8, same + 2, front + 2, near + 2],
        [8, 6, 4, up, 9, 2, 1, 5, 5, same, front, near],
    ]
}

// ---- 1 つの並べ方で置いていく ----

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Placed {
    pub unit: u32,
    pub oi: u32,
    pub group: u32,
    pub rank: i64,
    pub u: i64,
    pub v: i64,
    pub z: i64,
    pub w: i64,
    pub d: i64,
    pub h: i64,
}

#[derive(Clone, Debug, Default)]
pub struct Trace {
    pub placed: Vec<Placed>,
    pub unplaced: Vec<usize>,
    pub height: i64,
    pub placed_after: Vec<usize>,
    pub unplaced_after: Vec<usize>,
    pub height_after: Vec<i64>,
}

pub struct Anchor {
    pub from_right: bool,
    pub from_back: bool,
    pub along_side_first: bool,
}

pub fn anchor_of(w: &Walls) -> Anchor {
    Anchor {
        from_right: w.right && !w.left,
        from_back: w.back,
        along_side_first: (w.left || w.right) && !w.back,
    }
}

struct Grid {
    cells: Vec<Vec<u32>>,
    cols: i64,
    cw: f64,
    ch: f64,
    marks: Vec<u32>,
    stamp: u32,
}

impl Grid {
    fn new(uu: i64, vv: i64, capacity: usize, cell: f64) -> Grid {
        let cols = 2.max(32.min(js_round(uu.max(vv) as f64 / cell) as i64));
        Grid {
            cells: vec![Vec::new(); (cols * cols) as usize],
            cols,
            cw: uu as f64 / cols as f64,
            ch: vv as f64 / cols as f64,
            marks: vec![0; capacity.max(1)],
            stamp: 0,
        }
    }
    fn range(&self, u0: i64, v0: i64, u1: i64, v1: i64) -> [i64; 4] {
        let last = self.cols - 1;
        let clamp = |n: f64| (n as i64).clamp(0, last);
        [
            clamp((u0 as f64 / self.cw).floor()),
            clamp((v0 as f64 / self.ch).floor()),
            clamp(((u1 - 1) as f64 / self.cw).floor()),
            clamp(((v1 - 1) as f64 / self.ch).floor()),
        ]
    }
    fn add(&mut self, id: u32, u0: i64, v0: i64, u1: i64, v1: i64) {
        let [i0, j0, i1, j1] = self.range(u0, v0, u1, v1);
        for i in i0..=i1 {
            for j in j0..=j1 {
                self.cells[(i * self.cols + j) as usize].push(id);
            }
        }
    }
    fn query(&mut self, u0: i64, v0: i64, u1: i64, v1: i64, out: &mut Vec<u32>) {
        out.clear();
        self.stamp += 1;
        let [i0, j0, i1, j1] = self.range(u0, v0, u1, v1);
        for i in i0..=i1 {
            for j in j0..=j1 {
                for &id in &self.cells[(i * self.cols + j) as usize] {
                    if self.marks[id as usize] == self.stamp {
                        continue;
                    }
                    self.marks[id as usize] = self.stamp;
                    out.push(id);
                }
            }
        }
    }
}

const SMALL: usize = 40;

/// 置く場所の候補の集め方（TS の Set の、入れた順で回す）
struct Cands {
    us: Vec<i64>,
    vs: Vec<i64>,
    points: Vec<(i64, i64)>,
    point_keys: HashSet<i64>,
    uu: i64,
    vv: i64,
}

impl Cands {
    fn add_u(&mut self, u: i64) {
        if !self.us.contains(&u) {
            self.us.push(u);
        }
    }
    fn add_v(&mut self, v: i64) {
        if !self.vs.contains(&v) {
            self.vs.push(v);
        }
    }
    fn add_point(&mut self, u: i64, v: i64) {
        if u >= self.uu || v >= self.vv {
            return;
        }
        let key = u * 1_000_003 + v;
        if self.point_keys.insert(key) {
            self.points.push((u, v));
        }
    }
}

pub fn pack_in_order(
    order: &[usize],
    w: &Weights,
    input: &PackInput,
    table: &Table,
    base: Option<&Trace>,
    from: usize,
) -> Trace {
    let gap = input.gap;
    let uu = input.floor_x - 2 * input.edge_gap;
    let vv = input.floor_y - 2 * input.edge_gap;
    let anchor = anchor_of(&input.walls);
    let start = if base.is_some() { from } else { 0 };
    let (mut placed, mut unplaced, mut height, mut placed_after, mut unplaced_after, mut height_after) =
        match base {
            Some(b) => (
                b.placed[..if start > 0 { b.placed_after[start - 1] } else { 0 }].to_vec(),
                b.unplaced[..if start > 0 { b.unplaced_after[start - 1] } else { 0 }].to_vec(),
                if start > 0 { b.height_after[start - 1] } else { 0 },
                b.placed_after[..start].to_vec(),
                b.unplaced_after[..start].to_vec(),
                b.height_after[..start].to_vec(),
            ),
            None => (vec![], vec![], 0, vec![], vec![], vec![]),
        };
    placed.reserve(order.len());

    let mut cands = Cands {
        us: vec![0],
        vs: vec![0],
        points: vec![(0, 0)],
        point_keys: HashSet::from([0]),
        uu,
        vv,
    };
    let side_sum: i64 = order
        .iter()
        .map(|&id| {
            let o = &table.units[id].orientations[0];
            o.w.min(o.d)
        })
        .sum();
    let mut grid = Grid::new(uu, vv, order.len(), side_sum as f64 / (order.len().max(1)) as f64);
    let mut all: Vec<u32> = Vec::with_capacity(order.len());
    let register = |p: &Placed, id: u32, cands: &mut Cands, grid: &mut Grid, all: &mut Vec<u32>| {
        cands.add_u(p.u + p.w + gap);
        cands.add_v(p.v + p.d + gap);
        cands.add_point(p.u + p.w + gap, p.v);
        cands.add_point(p.u, p.v + p.d + gap);
        cands.add_point(p.u, p.v);
        cands.add_point(p.u + p.w + gap, 0);
        cands.add_point(0, p.v + p.d + gap);
        all.push(id);
        grid.add(id, p.u - gap, p.v - gap, p.u + p.w + gap, p.v + p.d + gap);
    };
    for (i, p) in placed.iter().enumerate() {
        register(p, i as u32, &mut cands, &mut grid, &mut all);
    }

    let mut found: Vec<u32> = Vec::new();
    let mut cand_list: Vec<(i64, i64)> = Vec::new();
    for index in start..order.len() {
        let unit_id = order[index];
        let item = &table.units[unit_id];
        let mut best: Option<(i64, Placed)> = None;
        cand_list.clear();
        if cands.us.len() * cands.vs.len() <= 2500 {
            for &u in &cands.us {
                for &v in &cands.vs {
                    cand_list.push((u, v));
                }
            }
        } else {
            cand_list.extend_from_slice(&cands.points);
        }
        for &(u, v) in &cand_list {
            let a1 = if anchor.along_side_first { u } else { v };
            let a2 = if anchor.along_side_first { v } else { u };
            for (oi, o) in item.orientations.iter().enumerate() {
                if u + o.w > uu || v + o.d > vv {
                    continue;
                }
                let fixed = w[3] * (if o.laid { 100 } else { 0 })
                    + w[5] * a1
                    + w[6] * a2
                    + w[10] * (if o.front_ok { 0 } else { 100 });
                let at = |z: i64| w[0] * ((height.max(z + o.h)) - height) + w[1] * (z + o.h) + w[2] * z + fixed;
                if let Some((bs, _)) = best {
                    if at(0) >= bs {
                        continue;
                    }
                }
                let near: &[u32] = if all.len() > SMALL {
                    grid.query(u, v, u + o.w, v + o.d, &mut found);
                    &found
                } else {
                    &all
                };
                let mut z = 0;
                for &id in near {
                    let b = &placed[id as usize];
                    if u < b.u + b.w && b.u < u + o.w && v < b.v + b.d && b.v < v + o.d && b.z + b.h > z {
                        z = b.z + b.h;
                    }
                }
                if let Some((bs, _)) = best {
                    if at(z) >= bs {
                        continue;
                    }
                }
                let mut blocked = false;
                for &id in near {
                    let b = &placed[id as usize];
                    if b.z >= z + o.h || b.z + b.h <= z {
                        continue;
                    }
                    if u < b.u + b.w + gap && b.u < u + o.w + gap && v < b.v + b.d + gap && b.v < v + o.d + gap {
                        blocked = true;
                        break;
                    }
                }
                if blocked {
                    continue;
                }
                let mut align = 0i64;
                if z > 0 {
                    let mut supported = 0i64;
                    for &id in near {
                        let b = &placed[id as usize];
                        if b.z + b.h != z {
                            continue;
                        }
                        let ou = (u + o.w).min(b.u + b.w) - u.max(b.u);
                        let ov = (v + o.d).min(b.v + b.d) - v.max(b.v);
                        if ou > 0 && ov > 0 {
                            supported += ou * ov;
                            if b.u == u {
                                align += 1;
                            }
                            if b.u + b.w == u + o.w {
                                align += 1;
                            }
                            if b.v == v {
                                align += 1;
                            }
                            if b.v + b.d == v + o.d {
                                align += 1;
                            }
                        }
                    }
                    if supported * 100 < input.support_percent * o.w * o.d {
                        continue;
                    }
                }
                let mut contact = 0i64;
                if u == 0 {
                    contact += o.d * o.h;
                }
                if u + o.w == uu {
                    contact += o.d * o.h;
                }
                if v == 0 {
                    contact += o.w * o.h;
                }
                if v + o.d == vv {
                    contact += o.w * o.h;
                }
                let (mut box_contact, mut same, mut flush, mut side_len, mut far_sum) = (0i64, 0i64, 0i64, 0i64, 0i64);
                let side: &[u32] = if all.len() > SMALL {
                    grid.query(u - 1, v - 1, u + o.w + 1, v + o.d + 1, &mut found);
                    &found
                } else {
                    &all
                };
                for &id in side {
                    let b = &placed[id as usize];
                    let oz = (z + o.h).min(b.z + b.h) - z.max(b.z);
                    if oz <= 0 {
                        continue;
                    }
                    let is_same = b.group as usize == item.group;
                    let flat = b.z + b.h == z + o.h;
                    let ov = (v + o.d).min(b.v + b.d) - v.max(b.v);
                    if ov > 0 && (b.u + b.w + gap == u || u + o.w + gap == b.u) {
                        contact += ov * oz;
                        box_contact += ov * oz;
                        if is_same {
                            same += ov * oz;
                        }
                        if flat {
                            flush += ov;
                        }
                        side_len += ov;
                        far_sum += ov * (b.rank - item.rank).abs();
                        if b.v == v {
                            align += 1;
                        }
                        if b.v + b.d == v + o.d {
                            align += 1;
                        }
                    }
                    let ou = (u + o.w).min(b.u + b.w) - u.max(b.u);
                    if ou > 0 && (b.v + b.d + gap == v || v + o.d + gap == b.v) {
                        contact += ou * oz;
                        box_contact += ou * oz;
                        if is_same {
                            same += ou * oz;
                        }
                        if flat {
                            flush += ou;
                        }
                        side_len += ou;
                        far_sum += ou * (b.rank - item.rank).abs();
                        if b.u == u {
                            align += 1;
                        }
                        if b.u + b.w == u + o.w {
                            align += 1;
                        }
                    }
                }
                let open = 1000 - 1000.min(contact / 1.max((2 * (o.w + o.d) * o.h) / 1000));
                let unflush = 1000 - 1000.min((flush * 1000) / (2 * (o.w + o.d)));
                let unaligned = 1000 - align.min(8) * 125;
                let not_same = if box_contact > 0 {
                    1000 - 1000.min(same / 1.max(box_contact / 1000))
                } else {
                    1000
                };
                let far_order = if side_len > 0 { far_sum / side_len } else { 1000 };
                let score = at(z) + w[4] * open + w[7] * unflush + w[8] * unaligned + w[9] * not_same + w[11] * far_order;
                if let Some((bs, _)) = best {
                    if score >= bs {
                        continue;
                    }
                }
                best = Some((
                    score,
                    Placed {
                        unit: unit_id as u32,
                        oi: oi as u32,
                        group: item.group as u32,
                        rank: item.rank,
                        u,
                        v,
                        z,
                        w: o.w,
                        d: o.d,
                        h: o.h,
                    },
                ));
            }
        }
        if let Some((_, p)) = best {
            placed.push(p);
            let id = (placed.len() - 1) as u32;
            register(&p, id, &mut cands, &mut grid, &mut all);
            height = height.max(p.z + p.h);
        } else {
            unplaced.push(unit_id);
        }
        placed_after.push(placed.len());
        unplaced_after.push(unplaced.len());
        height_after.push(height);
    }
    Trace { placed, unplaced, height, placed_after, unplaced_after, height_after }
}

// ---- 結果を床の座標に直して、評価する ----

pub const COG_WEIGHT: f64 = 0.3;
const TIDY_SCALE: f64 = 0.3;
const EVEN_SCALE: f64 = 5.0;

/// 評価に要る、入力から決まる値（毎回作り直さない）
pub struct Ctx<'a> {
    pub input: &'a PackInput,
    pub table: Table,
    /// 種類ごとのタグ（同じ名前なら同じ番号）
    name_id: Vec<usize>,
    h0: f64,
}

impl<'a> Ctx<'a> {
    pub fn new(input: &'a PackInput) -> Ctx<'a> {
        let table = units_of(input);
        let mut names: HashMap<String, usize> = HashMap::new();
        let name_id = input
            .boxes
            .iter()
            .enumerate()
            .map(|(t, b)| {
                let trimmed = b.tag.trim();
                let n = if trimmed.is_empty() { format!("#{t}") } else { trimmed.to_string() };
                let len = names.len();
                *names.entry(n).or_insert(len)
            })
            .collect();
        let all_volume: i64 = input.boxes.iter().map(|b| b.x * b.y * b.z * b.count).sum();
        let h0 = (all_volume as f64 / (input.floor_x * input.floor_y) as f64).max(1.0);
        Ctx { input, table, name_id, h0 }
    }
}

pub fn cog_error_of(x: f64, y: f64, input: &PackInput) -> f64 {
    let (xx, yy) = (input.floor_x as f64, input.floor_y as f64);
    let walls = &input.walls;
    let bias = input.wall_bias / 100.0;
    let ex = if walls.left == walls.right {
        (x - xx / 2.0) / xx
    } else {
        (if walls.left { x / xx } else { (xx - x) / xx }) * bias
    };
    let ey = if walls.back { ((yy - y) / yy) * bias } else { (y - yy / 2.0) / yy };
    ex.hypot(ey)
}

pub fn finish(packed: &Trace, ctx: &Ctx, genome: Option<Genome>) -> PackResult {
    let input = ctx.input;
    let table = &ctx.table;
    let (xx, yy, e, walls, gap) = (input.floor_x, input.floor_y, input.edge_gap, &input.walls, input.gap);
    let anchor = anchor_of(walls);
    let mut cursor = vec![0usize; table.groups.len()];
    let mut take_type = |g: usize| {
        let t = table.groups[g].members[cursor[g]];
        cursor[g] += 1;
        t
    };
    let mut placements: Vec<Placement> = Vec::with_capacity(table.box_count);
    for p in &packed.placed {
        let unit = &table.units[p.unit as usize];
        let bo = &table.groups[p.group as usize].orientations[unit.base[p.oi as usize]];
        for ic in 0..unit.c {
            for ib in 0..unit.b {
                for ia in 0..unit.a {
                    let ty = take_type(p.group as usize);
                    let own = &table.orients_by_type[ty];
                    let fits = |x: &Orient| x.w == bo.w && x.d == bo.d && x.h == bo.h && x.laid == bo.laid;
                    let o = own
                        .iter()
                        .find(|x| fits(x) && x.faces[3] == FRONT)
                        .or_else(|| own.iter().find(|x| fits(x)))
                        .or_else(|| own.iter().find(|x| x.w == bo.w && x.d == bo.d && x.h == bo.h))
                        .unwrap_or(bo);
                    let bu = p.u + ia * (bo.w + gap);
                    let bv = p.v + ib * (bo.d + gap);
                    placements.push(Placement {
                        ty,
                        x: if anchor.from_right { xx - e - bu - bo.w } else { e + bu },
                        y: if anchor.from_back { yy - e - bv - bo.d } else { e + bv },
                        z: p.z + ic * bo.h,
                        w: bo.w,
                        d: bo.d,
                        h: bo.h,
                        faces: o.faces,
                        laid_down: o.laid,
                    });
                }
            }
        }
    }
    let mut unplaced_types: Vec<usize> = Vec::new();
    for &id in &packed.unplaced {
        let unit = &table.units[id];
        for _ in 0..unit.size {
            unplaced_types.push(take_type(unit.group));
        }
    }

    let center_x = walls.left == walls.right;
    let center_y = !walls.back;
    if !placements.is_empty() && (center_x || center_y) {
        let min_x = placements.iter().map(|p| p.x).min().unwrap();
        let max_x = placements.iter().map(|p| p.x + p.w).max().unwrap();
        let min_y = placements.iter().map(|p| p.y).min().unwrap();
        let max_y = placements.iter().map(|p| p.y + p.d).max().unwrap();
        let shift = |min: i64, max: i64, size: i64| js_round((size - max - min) as f64 / 2.0) as i64;
        let dx = if center_x { shift(min_x, max_x, xx) } else { 0 };
        let dy = if center_y { shift(min_y, max_y, yy) } else { 0 };
        for p in placements.iter_mut() {
            p.x += dx;
            p.y += dy;
        }
    }

    let (mut box_volume, mut floor_area) = (0f64, 0f64);
    let (mut cx, mut cy, mut cz) = (0f64, 0f64, 0f64);
    for p in &placements {
        let vol = (p.w * p.d * p.h) as f64;
        box_volume += vol;
        if p.z == 0 {
            floor_area += (p.w * p.d) as f64;
        }
        cx += vol * (p.x as f64 + p.w as f64 / 2.0);
        cy += vol * (p.y as f64 + p.d as f64 / 2.0);
        cz += vol * (p.z as f64 + p.h as f64 / 2.0);
    }
    let height = packed.height;
    let cog = if box_volume > 0.0 {
        Some(Cog { x: cx / box_volume, y: cy / box_volume, z: cz / box_volume })
    } else {
        None
    };
    let floor_coverage = floor_area / (xx * yy) as f64;
    let h0 = ctx.h0;
    let cog_error = cog.map(|c| cog_error_of(c.x, c.y, input)).unwrap_or(0.0);
    let (tidy_value, tidy_penalty) = tidiness_of(&placements, ctx, gap);
    let too_big_count: i64 = table.too_big.iter().map(|u| u.count).sum();
    let hf = height as f64;
    let score = 100.0 * (unplaced_types.len() as f64 + too_big_count as f64)
        + (if input.objective == Objective::Height {
            hf / h0
        } else {
            3.0 * (1.0 - floor_coverage) + 0.3 * (hf / h0)
        })
        + COG_WEIGHT * cog_error
        + 0.3 * tower_penalty(&placements, input, h0)
        + 0.05 * cog.map(|c| c.z / h0).unwrap_or(0.0)
        + (input.tidy.weight / 100.0) * TIDY_SCALE * tidy_penalty;

    let mut unplaced: Vec<Unplaced> = table.too_big.clone();
    // TS は Map に入れた順（初めて出てきた順）
    let mut counts: Vec<(usize, i64)> = Vec::new();
    for t in unplaced_types {
        match counts.iter_mut().find(|(ty, _)| *ty == t) {
            Some(c) => c.1 += 1,
            None => counts.push((t, 1)),
        }
    }
    for (ty, count) in counts {
        unplaced.push(Unplaced { ty, count, reason: "support" });
    }
    PackResult {
        placements,
        unplaced,
        height,
        fill_rate: if height > 0 { box_volume / (xx * yy * height) as f64 } else { 0.0 },
        floor_coverage,
        cog,
        tidiness: tidy_value,
        score,
        genome,
    }
}

fn tidiness_of(placements: &[Placement], ctx: &Ctx, gap: i64) -> (f64, f64) {
    let input = ctx.input;
    let n = placements.len();
    if n == 0 {
        return (1.0, 0.0);
    }
    let (xx, yy, walls) = (input.floor_x, input.floor_y, &input.walls);
    let mut present: Vec<usize> = placements.iter().map(|p| p.ty).collect();
    present.sort_unstable();
    present.dedup();
    let denom = (present.len() as f64 - 1.0).max(1.0);
    let mut rank_of = vec![0f64; input.boxes.len()];
    for (i, &t) in present.iter().enumerate() {
        rank_of[t] = i as f64 / denom;
    }
    let wall_dist = |p: &Placement| {
        let mut d = f64::INFINITY;
        if walls.back {
            d = d.min(yy as f64 - (p.y as f64 + p.d as f64 / 2.0));
        }
        if walls.left && !walls.right {
            d = d.min(p.x as f64 + p.w as f64 / 2.0);
        }
        if walls.right && !walls.left {
            d = d.min(xx as f64 - (p.x as f64 + p.w as f64 / 2.0));
        }
        d
    };
    let has_wall = walls.back || walls.left != walls.right;
    let (mut contact_all, mut contact_same, mut support_all, mut support_bad) = (0f64, 0f64, 0f64, 0f64);
    let (mut near_area, mut near_sum) = (0f64, 0f64);
    let (mut wall_pairs, mut wall_good) = (0u64, 0u64);
    let dists: Vec<f64> = if has_wall { placements.iter().map(wall_dist).collect() } else { vec![] };
    for a in 0..n {
        let p = &placements[a];
        for b in (a + 1)..n {
            let q = &placements[b];
            let ox = (p.x + p.w).min(q.x + q.w) - p.x.max(q.x);
            let oy = (p.y + p.d).min(q.y + q.d) - p.y.max(q.y);
            let oz = (p.z + p.h).min(q.z + q.h) - p.z.max(q.z);
            if oz > 0 {
                let mut area = 0i64;
                if oy > 0 && (p.x + p.w + gap == q.x || q.x + q.w + gap == p.x) {
                    area += oy * oz;
                }
                if ox > 0 && (p.y + p.d + gap == q.y || q.y + q.d + gap == p.y) {
                    area += ox * oz;
                }
                if area > 0 {
                    let af = area as f64;
                    contact_all += af;
                    if ctx.name_id[p.ty] == ctx.name_id[q.ty] {
                        contact_same += af;
                    }
                    near_area += af;
                    near_sum += af * (rank_of[p.ty] - rank_of[q.ty]).abs();
                }
            }
            if ox > 0 && oy > 0 {
                let pair = if p.z + p.h == q.z {
                    Some((p, q))
                } else if q.z + q.h == p.z {
                    Some((q, p))
                } else {
                    None
                };
                if let Some((lower, upper)) = pair {
                    let area = (ox * oy) as f64;
                    support_all += area;
                    if upper.w * upper.d * upper.h > lower.w * lower.d * lower.h {
                        support_bad += area;
                    }
                }
            }
            if has_wall {
                let vp = p.w * p.d * p.h;
                let vq = q.w * q.d * q.h;
                let (dp, dq) = (dists[a], dists[b]);
                if vp != vq && dp != dq {
                    wall_pairs += 1;
                    if (vp > vq) == (dp < dq) {
                        wall_good += 1;
                    }
                }
            }
        }
    }
    let (mut min_x, mut min_y, mut max_x, mut max_y) = (i64::MAX, i64::MAX, 0i64, 0i64);
    for p in placements {
        min_x = min_x.min(p.x);
        min_y = min_y.min(p.y);
        max_x = max_x.max(p.x + p.w);
        max_y = max_y.max(p.y + p.d);
    }
    let (min_xf, min_yf) = (min_x as f64, min_y as f64);
    let cell = 10f64.max(((max_x - min_x).max(max_y - min_y)) as f64 / 48.0);
    let gx = 1i64.max(js_round((max_x - min_x) as f64 / cell) as i64) as usize;
    let gy = 1i64.max(js_round((max_y - min_y) as f64 / cell) as i64) as usize;
    let cw = (max_x - min_x) as f64 / gx as f64;
    let ch = (max_y - min_y) as f64 / gy as f64;
    let mut tops = vec![0f64; gx * gy];
    let spread = (gap + 10) as f64;
    let cells = |from: f64, size: f64, min: f64, step: f64, g: usize| -> (i64, i64) {
        (
            0i64.max(((from - spread - min) / step - 0.5).ceil() as i64),
            (g as i64 - 1).min(((from + size + spread - min) / step - 0.5).ceil() as i64 - 1),
        )
    };
    for p in placements {
        let (i0, i1) = cells(p.x as f64, p.w as f64, min_xf, cw, gx);
        let (j0, j1) = cells(p.y as f64, p.d as f64, min_yf, ch, gy);
        let top = (p.z + p.h) as f64;
        let mut j = j0;
        while j <= j1 {
            let mut i = i0;
            while i <= i1 {
                let k = j as usize * gx + i as usize;
                if top > tops[k] {
                    tops[k] = top;
                }
                i += 1;
            }
            j += 1;
        }
    }
    let mut max_top = 0f64;
    let mut sum = 0f64;
    for &t in &tops {
        max_top = max_top.max(t);
        sum += t;
    }
    let mean = sum / tops.len() as f64;
    let mut var_sum = 0f64;
    for &t in &tops {
        var_sum += (t - mean) * (t - mean);
    }
    let std = (var_sum / tops.len() as f64).sqrt();
    let tidy = &input.tidy;
    let mut parts: Vec<f64> = Vec::with_capacity(10);
    if tidy.group {
        parts.push(if contact_all > 0.0 { contact_same / contact_all } else { 1.0 });
    }
    if tidy.flat {
        parts.push(if max_top > 0.0 { 0f64.max(1.0 - (2.0 * std) / max_top) } else { 1.0 });
    }
    if tidy.big_bottom {
        parts.push(if support_all > 0.0 { 1.0 - support_bad / support_all } else { 1.0 });
    }
    if tidy.upright {
        parts.push(1.0 - placements.iter().filter(|p| p.laid_down).count() as f64 / n as f64);
    }
    if tidy.big_wall && has_wall {
        parts.push(if wall_pairs > 0 { wall_good as f64 / wall_pairs as f64 } else { 1.0 });
    }
    if tidy.front {
        parts.push(placements.iter().filter(|p| p.faces[3] == FRONT).count() as f64 / n as f64);
    }
    if tidy.front_flat {
        let mut fronts: Vec<f64> = Vec::new();
        for i in 0..gx {
            let px = min_xf + (i as f64 + 0.5) * cw;
            let mut f = f64::INFINITY;
            for p in placements {
                if px >= p.x as f64 && px < (p.x + p.w) as f64 && (p.y as f64) < f {
                    f = p.y as f64;
                }
            }
            if f.is_finite() {
                fronts.push(f);
            }
        }
        let cnt = (fronts.len() as f64).max(1.0);
        let fm = fronts.iter().fold(0.0, |a, x| a + x) / cnt;
        let fs = (fronts.iter().fold(0.0, |a, x| a + (x - fm) * (x - fm)) / cnt).sqrt();
        parts.push(0f64.max(1.0 - (2.0 * fs) / 1f64.max((max_y - min_y) as f64)));
    }
    if tidy.near {
        parts.push(if near_area > 0.0 { 0f64.max(1.0 - (2.0 * near_sum) / near_area) } else { 1.0 });
    }
    if tidy.balance && walls.left == walls.right {
        let (mut diff, mut total) = (0f64, 0f64);
        for j in 0..gy {
            for i in 0..gx {
                let a = tops[j * gx + i];
                let b = tops[j * gx + (gx - 1 - i)];
                diff += (a - b).abs();
                total += a + b;
            }
        }
        parts.push(if total > 0.0 { 1.0 - diff / total } else { 1.0 });
    }
    if tidy.even {
        parts.push(0f64.max(1.0 - EVEN_SCALE * uneven_share(&tops, gx, gy, cw, ch, placements)));
    }
    if parts.is_empty() {
        return (1.0, 0.0);
    }
    let value = parts.iter().fold(0.0, |s, x| s + x) / parts.len() as f64;
    let penalty = parts.iter().fold(0.0, |s, x| s + (1.0 - x));
    (value, penalty)
}

fn median(mut xs: Vec<f64>) -> f64 {
    xs.sort_by(|a, b| a.partial_cmp(b).unwrap());
    xs.get(xs.len() / 2).copied().unwrap_or(0.0)
}

fn uneven_share(tops: &[f64], gx: usize, gy: usize, cw: f64, ch: f64, placements: &[Placement]) -> f64 {
    let step = 20f64.max(median(placements.iter().map(|p| p.h as f64).collect()) / 2.0);
    let reach = median(placements.iter().map(|p| p.w.max(p.d) as f64).collect());
    let mut bad = vec![0u8; gx * gy];
    let mut left_max = vec![0f64; gx.max(gy)];
    let mut line = |len: usize, at: &dyn Fn(usize) -> usize, size: f64, bad: &mut Vec<u8>| {
        let r = 1i64.max(js_round(reach / size) as i64) as usize;
        let mut m = 0f64;
        for k in 0..len {
            left_max[k] = m;
            m = m.max(tops[at(k)]);
        }
        let mut right_max = 0f64;
        for k in (0..len).rev() {
            let t = tops[at(k)];
            if left_max[k].min(right_max) - t >= step {
                bad[at(k)] = 1;
            } else if bad[at(k)] == 0 {
                let mut low_l = false;
                let mut low_r = false;
                let mut d = 1;
                while d <= r && !low_l {
                    if k >= d && tops[at(k - d)] <= t - step {
                        low_l = true;
                    }
                    d += 1;
                }
                d = 1;
                while d <= r && !low_r {
                    if k + d < len && tops[at(k + d)] <= t - step {
                        low_r = true;
                    }
                    d += 1;
                }
                if low_l && low_r {
                    bad[at(k)] = 1;
                }
            }
            right_max = right_max.max(t);
        }
    };
    for j in 0..gy {
        line(gx, &|k| j * gx + k, cw, &mut bad);
    }
    for i in 0..gx {
        line(gy, &|k| k * gx + i, ch, &mut bad);
    }
    let count: usize = bad.iter().map(|&b| b as usize).sum();
    count as f64 / bad.len() as f64
}

fn tower_penalty(placements: &[Placement], input: &PackInput, h0: f64) -> f64 {
    const G: usize = 16;
    let (xx, yy, walls) = (input.floor_x as f64, input.floor_y as f64, &input.walls);
    let mut heights = [0f64; G * G];
    for i in 0..G {
        for j in 0..G {
            let px = ((i as f64 + 0.5) * xx) / G as f64;
            let py = ((j as f64 + 0.5) * yy) / G as f64;
            let mut top = 0i64;
            for p in placements {
                if px >= p.x as f64 && px < (p.x + p.w) as f64 && py >= p.y as f64 && py < (p.y + p.d) as f64 {
                    top = top.max(p.z + p.h);
                }
            }
            heights[i * G + j] = top as f64;
        }
    }
    let at = |i: usize, j: usize| heights[i * G + j];
    let (mut spike, mut toward_wall) = (0f64, 0f64);
    for i in 0..G {
        for j in 0..G {
            let h = at(i, j);
            if h == 0.0 {
                continue;
            }
            let mut s = 0f64;
            let mut c = 0f64;
            if i > 0 {
                s += at(i - 1, j);
                c += 1.0;
            }
            if i < G - 1 {
                s += at(i + 1, j);
                c += 1.0;
            }
            if j > 0 {
                s += at(i, j - 1);
                c += 1.0;
            }
            if j < G - 1 {
                s += at(i, j + 1);
                c += 1.0;
            }
            let mean = s / c;
            spike += 0f64.max(h - mean);
            if walls.back && j < G - 1 {
                toward_wall += 0f64.max(h - at(i, j + 1));
            }
            if walls.left && !walls.right && i > 0 {
                toward_wall += 0f64.max(h - at(i - 1, j));
            }
            if walls.right && !walls.left && i < G - 1 {
                toward_wall += 0f64.max(h - at(i + 1, j));
            }
        }
    }
    (0.5 * spike + toward_wall) / ((G * G) as f64 * h0)
}

// ---- 並べ順 ----

/// mulberry32（TS の random と同じ列）
pub struct Rand(u32);
impl Rand {
    pub fn new(seed: i64) -> Rand {
        Rand(seed as i32 as u32)
    }
    pub fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_add(0x6d2b79f5);
        let a = self.0;
        let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
        t = (t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t))) ^ t;
        ((t ^ (t >> 14)) as f64) / 4294967296.0
    }
    pub fn below_pub(&mut self, n: usize) -> usize {
        self.below(n)
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() * n as f64).floor() as usize
    }
}

fn size_of_code(code: i64) -> i64 {
    let r = code % 64;
    (r / 16 + 1) * ((r / 4) % 4 + 1) * (r % 4 + 1)
}

pub fn unit_ids_of(seq: &[i64], table: &Table) -> Vec<usize> {
    let mut need: Vec<i64> = table.groups.iter().map(|g| g.members.len() as i64).collect();
    let mut out = Vec::new();
    let push_singles = |group: usize, count: i64, need: &mut Vec<i64>, out: &mut Vec<usize>| {
        let mut i = 0;
        while i < count && need[group] > 0 {
            out.push(table.single[group]);
            need[group] -= 1;
            i += 1;
        }
    };
    for &code in seq {
        let group = (code / 64) as usize;
        if group >= table.groups.len() {
            continue;
        }
        match table.by_code.get(&code) {
            None => push_singles(group, size_of_code(code), &mut need, &mut out),
            Some(&id) => {
                let u = &table.units[id];
                if u.size <= need[group] {
                    out.push(id);
                    need[group] -= u.size;
                } else {
                    let n = need[group];
                    push_singles(group, n, &mut need, &mut out);
                }
            }
        }
    }
    for g in 0..need.len() {
        let n = need[g];
        push_singles(g, n, &mut need, &mut out);
    }
    out
}

pub fn normalize_rule(rule: Option<&[f64]>, input: &PackInput) -> Rule {
    let fallback = default_rules(input)[0];
    let mut r = [0i32; RULE_SIZE];
    for i in 0..RULE_SIZE {
        r[i] = match rule.and_then(|r| r.get(i)) {
            Some(e) if e.is_finite() => (js_round(*e) as i32).clamp(0, RULE_MAX),
            _ => fallback[i],
        };
    }
    r
}

fn ids_from_types(types: &[i64], table: &Table) -> Vec<usize> {
    let mut group_of_type = HashMap::new();
    for (gi, g) in table.groups.iter().enumerate() {
        for &t in &g.members {
            group_of_type.insert(t as i64, gi);
        }
    }
    let seq: Vec<i64> = types.iter().filter_map(|t| group_of_type.get(t).map(|&g| code_of(g, 1, 1, 1))).collect();
    unit_ids_of(&seq, table)
}

pub fn genome_of(ids: &[usize], rule: &Rule, table: &Table) -> Genome {
    Genome {
        seq: ids.iter().map(|&id| table.units[id].code).collect(),
        rule: rule.iter().map(|&x| x as f64).collect(),
    }
}

#[derive(Clone)]
pub struct Plan {
    pub ids: Vec<usize>,
    pub rule: Rule,
}

pub fn decode_start(input: &PackInput, table: &Table) -> Option<Plan> {
    if let Some(g) = &input.start_genome {
        if !g.seq.is_empty() {
            return Some(Plan { ids: unit_ids_of(&g.seq, table), rule: normalize_rule(Some(&g.rule), input) });
        }
    }
    if let Some(o) = &input.start_order {
        if !o.is_empty() {
            return Some(Plan { ids: ids_from_types(o, table), rule: default_rules(input)[0] });
        }
    }
    None
}

pub fn evaluate_ids(ctx: &Ctx, ids: &[usize], rule: &Rule) -> (Trace, PackResult) {
    let trace = pack_in_order(ids, &weights_of(rule), ctx.input, &ctx.table, None, 0);
    let r = finish(&trace, ctx, Some(genome_of(ids, rule, &ctx.table)));
    (trace, r)
}

pub fn evaluate_genome(ctx: &Ctx, g: &Genome) -> PackResult {
    let ids = unit_ids_of(&g.seq, &ctx.table);
    let rule = normalize_rule(Some(&g.rule), ctx.input);
    evaluate_ids(ctx, &ids, &rule).1
}

pub fn start_plans(input: &PackInput, table: &Table) -> Vec<Plan> {
    let rules = default_rules(input);
    let dims = |g: usize| &table.groups[g].orientations[0];
    let area = |g: usize| dims(g).w * dims(g).d;
    let tall = |g: usize| dims(g).h;
    let long = |g: usize| dims(g).w.max(dims(g).d).max(dims(g).h);
    let mut singles = Vec::new();
    for (gi, g) in table.groups.iter().enumerate() {
        for _ in 0..g.members.len() {
            singles.push(gi);
        }
    }
    let sorts: [&dyn Fn(usize, usize) -> i64; 5] = [
        &|a, b| {
            let x = area(b) - area(a);
            if x != 0 { x } else { tall(b) - tall(a) }
        },
        &|a, b| area(b) * tall(b) - area(a) * tall(a),
        &|a, b| {
            let x = tall(b) - tall(a);
            if x != 0 { x } else { area(b) - area(a) }
        },
        &|a, b| {
            let x = long(b) - long(a);
            if x != 0 { x } else { area(b) - area(a) }
        },
        &|a, b| {
            let x = tall(a) - tall(b);
            if x != 0 { x } else { area(b) - area(a) }
        },
    ];
    let single_orders: Vec<Vec<usize>> = sorts
        .iter()
        .map(|sort| {
            let mut s = singles.clone();
            s.sort_by(|&a, &b| {
                let x = sort(a, b);
                let x = if x != 0 { x } else { a as i64 - b as i64 };
                x.cmp(&0)
            });
            s.into_iter().map(|g| table.single[g]).collect()
        })
        .collect();
    let mut blocks = Vec::new();
    for gi in 0..table.groups.len() {
        let mut left = table.groups[gi].members.len() as i64;
        let mut shapes: Vec<usize> = (0..table.units.len()).filter(|&id| table.units[id].group == gi).collect();
        shapes.sort_by(|&x, &y| {
            let (ux, uy) = (&table.units[x], &table.units[y]);
            let d = uy.size - ux.size;
            let d = if d != 0 { d } else { ux.c - uy.c };
            d.cmp(&0)
        });
        while left > 0 {
            match shapes.iter().find(|&&id| table.units[id].size <= left) {
                None => break,
                Some(&id) => {
                    blocks.push(id);
                    left -= table.units[id].size;
                }
            }
        }
    }
    let footprint = |id: usize| {
        let o = &table.units[id].orientations[0];
        o.w * o.d
    };
    blocks.sort_by(|&a, &b| {
        let d = footprint(b) - footprint(a);
        let d = if d != 0 { d } else { table.units[b].orientations[0].h - table.units[a].orientations[0].h };
        d.cmp(&0)
    });
    let mut plans = Vec::new();
    if let Some(first) = decode_start(input, table) {
        plans.push(first);
    }
    plans.push(Plan { ids: single_orders[0].clone(), rule: rules[0] });
    plans.push(Plan { ids: blocks.clone(), rule: rules[1] });
    plans.push(Plan { ids: blocks.clone(), rule: rules[0] });
    plans.push(Plan { ids: single_orders[0].clone(), rule: rules[1] });
    plans.push(Plan { ids: blocks, rule: rules[2] });
    for ids in single_orders.into_iter().skip(1) {
        plans.push(Plan { ids, rule: rules[0] });
    }
    plans
}

// ---- 崩し方 ----

pub const MUTATION_KINDS: usize = 7;
const BASE_KIND_WEIGHTS: [f64; MUTATION_KINDS] = [40.0, 15.0, 7.0, 14.0, 8.0, 8.0, 8.0];

pub struct KindStats {
    tries: [f64; MUTATION_KINDS],
    wins: [f64; MUTATION_KINDS],
    total: f64,
}

impl KindStats {
    pub fn new() -> KindStats {
        KindStats { tries: [0.0; MUTATION_KINDS], wins: [0.0; MUTATION_KINDS], total: 0.0 }
    }
    pub fn weights(&self) -> [f64; MUTATION_KINDS] {
        let mut rates = [0f64; MUTATION_KINDS];
        for k in 0..MUTATION_KINDS {
            rates[k] = (self.wins[k] + 1.0) / (self.tries[k] + 50.0);
        }
        let mean = rates.iter().sum::<f64>() / MUTATION_KINDS as f64;
        let mut w = [0f64; MUTATION_KINDS];
        for k in 0..MUTATION_KINDS {
            w[k] = BASE_KIND_WEIGHTS[k] * (0.25 + rates[k] / mean);
        }
        w
    }
    pub fn record(&mut self, kind: i32, count: f64, win: f64) {
        if kind < 0 {
            return;
        }
        self.tries[kind as usize] += count;
        self.wins[kind as usize] += win;
        self.total += count;
        if self.total > 20000.0 {
            for k in 0..MUTATION_KINDS {
                self.tries[k] *= 0.5;
                self.wins[k] *= 0.5;
            }
            self.total = 0.0;
        }
    }
}

pub struct Mutation {
    pub ids: Vec<usize>,
    pub rule: Rule,
    /// 元と初めて違う位置（ルールが変われば 0）
    pub start: usize,
    pub kind: i32,
}

pub fn mutate(
    ids: &[usize],
    rule: &Rule,
    rand: &mut Rand,
    table: &Table,
    other: Option<&[usize]>,
    kind_weights: &[f64; MUTATION_KINDS],
) -> Mutation {
    let w = kind_weights;
    for _attempt in 0..6 {
        let mut o: Vec<usize> = ids.to_vec();
        let mut r = *rule;
        let m = o.len();
        let weight_of_kind = |k: usize| if k == 6 && other.is_none() { 0.0 } else { w[k] };
        let total: f64 = (0..7).map(weight_of_kind).sum();
        let mut roll = rand.next() * total;
        let mut kind = 0;
        while kind < 6 {
            if roll < weight_of_kind(kind) {
                break;
            }
            roll -= weight_of_kind(kind);
            kind += 1;
        }
        if m < 2 && kind <= 2 {
            continue;
        }
        let near_index = |rand: &mut Rand, i: usize, reach: usize| -> usize {
            let x = i as f64 + ((rand.next() * 2.0 - 1.0) * reach as f64).floor();
            (x.max(0.0) as usize).min(m - 1)
        };
        if kind == 0 {
            let swaps = 1 + rand.below(3);
            for _ in 0..swaps {
                let i = rand.below(m);
                let reach = if rand.next() < 0.7 { 4 } else { m };
                let j = near_index(rand, i, reach);
                o.swap(i, j);
            }
        } else if kind == 1 {
            let i = rand.below(m);
            let reach = if rand.next() < 0.7 { 6 } else { m };
            let j = near_index(rand, i, reach);
            let v = o.remove(i);
            o.insert(j, v);
        } else if kind == 2 {
            let len = 2 + rand.below(1.max((m / 4) as i64 - 1) as usize);
            let i = rand.below(1.max(m as i64 - len as i64 + 1) as usize);
            let end = (i + len).min(m);
            o[i..end].reverse();
        } else if kind == 3 {
            r = *rule;
            if rand.next() < 0.5 {
                let k = rand.below(RULE_SIZE);
                let step = (if rand.next() < 0.5 { -1 } else { 1 }) * (if rand.next() < 0.7 { 1 } else { 2 });
                r[k] = (r[k] + step).clamp(0, RULE_MAX);
            } else {
                let a = rand.below(RULE_SIZE);
                let b = rand.below(RULE_SIZE);
                r.swap(a, b);
            }
        } else if kind == 4 {
            let big: Vec<usize> = (0..m).filter(|&i| table.units[o[i]].size > 1).collect();
            if big.is_empty() {
                continue;
            }
            let i = big[rand.below(big.len())];
            let u = &table.units[o[i]];
            let dims = [u.a, u.b, u.c];
            let axes: Vec<usize> = (0..3).filter(|&x| dims[x] > 1).collect();
            let ax = axes[rand.below(axes.len())];
            let s = 1 + rand.below((dims[ax] - 1) as usize) as i64;
            let mut p = dims;
            let mut q = dims;
            p[ax] = s;
            q[ax] = dims[ax] - s;
            let ip = table.unit_at(u.group, p[0], p[1], p[2]);
            let iq = table.unit_at(u.group, q[0], q[1], q[2]);
            if let (Some(ip), Some(iq)) = (ip, iq) {
                o.splice(i..i + 1, [ip, iq]);
            } else {
                let single = table.single[u.group];
                let size = u.size as usize;
                o.splice(i..i + 1, std::iter::repeat(single).take(size));
            }
        } else if kind == 5 || other.is_none() {
            let i = rand.below(m);
            let u = &table.units[o[i]];
            let mut done = false;
            let mut t = 0;
            while t < 10 && !done {
                t += 1;
                let j = rand.below(m);
                if j == i {
                    continue;
                }
                let wu = &table.units[o[j]];
                if wu.group != u.group {
                    continue;
                }
                let mut tries: Vec<[i64; 3]> = Vec::new();
                if u.b == wu.b && u.c == wu.c {
                    tries.push([u.a + wu.a, u.b, u.c]);
                }
                if u.a == wu.a && u.c == wu.c {
                    tries.push([u.a, u.b + wu.b, u.c]);
                }
                if u.a == wu.a && u.b == wu.b {
                    tries.push([u.a, u.b, u.c + wu.c]);
                }
                while !tries.is_empty() && !done {
                    let x = tries.remove(rand.below(tries.len()));
                    let Some(id) = table.unit_at(u.group, x[0], x[1], x[2]) else { continue };
                    let lo = i.min(j);
                    let hi = i.max(j);
                    o.remove(hi);
                    o[lo] = id;
                    done = true;
                }
            }
            if !done {
                continue;
            }
        } else {
            let other = other.unwrap();
            let c = 1 + rand.below(1.max(m as i64 - 1) as usize);
            let mut rest: HashMap<usize, i64> = HashMap::new();
            for q in c..m {
                *rest.entry(o[q]).or_insert(0) += 1;
            }
            let mut tail = Vec::new();
            for &id in other {
                if let Some(n) = rest.get_mut(&id) {
                    if *n > 0 {
                        *n -= 1;
                        tail.push(id);
                    }
                }
            }
            for q in c..m {
                if let Some(n) = rest.get_mut(&o[q]) {
                    if *n > 0 {
                        *n -= 1;
                        tail.push(o[q]);
                    }
                }
            }
            o.splice(c.min(m)..m, tail);
        }
        let rule_changed = r != *rule;
        let mut start = 0;
        if !rule_changed {
            let len = o.len().min(ids.len());
            while start < len && o[start] == ids[start] {
                start += 1;
            }
            if start == len && o.len() == ids.len() {
                continue;
            }
        }
        return Mutation { ids: o, rule: r, start, kind: kind as i32 };
    }
    Mutation { ids: ids.to_vec(), rule: *rule, start: ids.len(), kind: -1 }
}

const POLISH_AFTER: u64 = 3000;
pub const RULE_EXPLORE_MS: f64 = 30_000.0;
const FROZEN_RULE_SCALE: f64 = 0.05;

pub fn rules_frozen(input: &PackInput, elapsed_ms: f64) -> bool {
    input.searched_ms.unwrap_or(0.0) + elapsed_ms >= RULE_EXPLORE_MS
}

pub fn with_rule_phase(mut w: [f64; MUTATION_KINDS], frozen: bool) -> [f64; MUTATION_KINDS] {
    if frozen {
        w[3] *= FROZEN_RULE_SCALE;
    }
    w
}

pub fn temperature_at(steps: f64, half_life: f64) -> f64 {
    0.0005f64.max(0.02 * 0.5f64.powf(steps / half_life))
}

pub fn accept_worse(delta: f64, temperature: f64, rand: &mut Rand) -> bool {
    if delta <= 0.0 {
        return true;
    }
    rand.next() < (-delta / temperature).exp()
}

/// 大きく崩す強さの上限（shake_plan の level）
pub const SHAKE_MAX: u64 = 3;

/// 続けて良くならなかった回数（0 から）に応じた、大きく崩す強さ（一巡したら狭い崩し方に戻る）
pub fn shake_level_of(count: u64) -> u64 {
    count % (SHAKE_MAX + 1)
}

/// 並び順の区間 [from, from + len) を混ぜる
fn shuffle_span(o: &mut [usize], from: usize, len: usize, rand: &mut Rand) {
    let mut a = (o.len().min(from + len)) as i64 - 1;
    while a > from as i64 {
        let b = from + rand.below((a as usize) - from + 1);
        o.swap(a as usize, b);
        a -= 1;
    }
}

/// ルールの重みを count か所、でたらめな値にする
fn scramble_rule(rule: &Rule, count: u64, rand: &mut Rand) -> Rule {
    let mut r = *rule;
    for _ in 0..count {
        let k = rand.below(RULE_SIZE);
        r[k] = rand.below((RULE_MAX + 1) as usize) as i32;
    }
    r
}

/// 大きく崩す（TS の shakePlan）。level が上がるほど広く崩す（区間は並び順の 0.2・0.3・0.45・0.675、ルールは 2〜5 か所）
pub fn shake_plan(ids: &[usize], rule: &Rule, rand: &mut Rand, frozen: bool, level: u64) -> Plan {
    let lv = level.min(SHAKE_MAX);
    let mut o = ids.to_vec();
    let len = 3.max((o.len() as f64 * 0.2 * 1.5f64.powi(lv as i32)).floor() as usize);
    let i = rand.below(1.max(o.len() as i64 - len as i64 + 1) as usize);
    shuffle_span(&mut o, i, len, rand);
    let r = if frozen { *rule } else { scramble_rule(rule, 2 + lv, rand) };
    Plan { ids: o, rule: r }
}

/// 新しい並べ方（TS の freshPlan）: 最初に試す並べ方から 1 つ選び、全部か半分を混ぜる
pub fn fresh_plan(input: &PackInput, table: &Table, rand: &mut Rand, rule: Option<&Rule>) -> Plan {
    let mut plain = input.clone();
    plain.start_genome = None;
    plain.start_order = None;
    let bases = start_plans(&plain, table);
    let base = &bases[rand.below(bases.len())];
    let mut o = base.ids.clone();
    let n = o.len();
    if rand.next() < 0.5 {
        shuffle_span(&mut o, 0, n, rand);
    } else {
        let len = 3.max(n / 2);
        let from = rand.below(1.max(n as i64 - len as i64 + 1) as usize);
        shuffle_span(&mut o, from, len, rand);
    }
    let r = match rule {
        Some(r) => *r,
        None => scramble_rule(&base.rule, 3, rand),
    };
    Plan { ids: o, rule: r }
}

/// 別の筋（explore）の出発点（TS の lineStart）
pub fn line_start(input: &PackInput, table: &Table, rand: &mut Rand) -> Plan {
    let frozen = rules_frozen(input, 0.0);
    let Some(from) = decode_start(input, table) else {
        return fresh_plan(input, table, rand, None);
    };
    match input.shake {
        None => from,
        Some(s) => shake_plan(&from.ids, &from.rule, rand, frozen, s.max(0.0).floor() as u64),
    }
}

/// 探し直すとき、何回に 1 回は新しい並べ方から始めるか
pub const FRESH_EVERY: u64 = 3;
const CPU_HALF_LIFE: f64 = 20_000.0;

/// createSearch の移植（CPU 係 1 つ分）
pub struct Search<'a> {
    pub ctx: &'a Ctx<'a>,
    plans: Vec<Plan>,
    started: std::time::Instant,
    pub best: PackResult,
    pub best_ids: Vec<usize>,
    pub best_rule: Rule,
    /// 今の筋（探し直してから次に探し直すまで）でいちばん良い並べ方
    run_ids: Vec<usize>,
    run_rule: Rule,
    run_trace: Trace,
    run_score: f64,
    /// 今歩いている並べ方（焼きなましで、今の筋のいちばんより少し悪いこともある）
    cur_ids: Vec<usize>,
    cur_rule: Rule,
    cur_trace: Trace,
    cur_score: f64,
    pub tried: u64,
    anneal_steps: f64,
    rand: Rand,
    stats: KindStats,
    fails: u64,
    polish: Vec<Plan>,
    polishing: bool,
    /// 続けて何回探し直しても、いちばん良い結果が良くならなかったか
    kicks: u64,
}

impl<'a> Search<'a> {
    pub fn new(ctx: &'a Ctx<'a>, seed: i64) -> Search<'a> {
        let mut rand = Rand::new(seed.wrapping_mul(7919).wrapping_add(ctx.table.box_count as i64));
        let plans = if ctx.input.explore {
            vec![line_start(ctx.input, &ctx.table, &mut rand)]
        } else {
            start_plans(ctx.input, &ctx.table)
        };
        let (trace, best) = evaluate_ids(ctx, &plans[0].ids, &plans[0].rule);
        let ids = plans[0].ids.clone();
        let rule = plans[0].rule;
        let score = best.score;
        Search {
            ctx,
            best_ids: ids.clone(),
            best_rule: rule,
            run_ids: ids.clone(),
            run_rule: rule,
            run_trace: trace.clone(),
            run_score: score,
            cur_ids: ids,
            cur_rule: rule,
            cur_trace: trace,
            cur_score: score,
            best,
            plans,
            started: std::time::Instant::now(),
            tried: 1,
            anneal_steps: 0.0,
            rand,
            stats: KindStats::new(),
            fails: 0,
            polish: vec![],
            polishing: false,
            kicks: 0,
        }
    }

    fn polish_moves(&self, frozen: bool) -> Vec<Plan> {
        let mut moves = Vec::new();
        let ids = &self.run_ids;
        for i in 0..ids.len() {
            let mut d = 1;
            while d <= 3 && i + d < ids.len() {
                if ids[i] != ids[i + d] {
                    let mut o = ids.clone();
                    o.swap(i, i + d);
                    moves.push(Plan { ids: o, rule: self.run_rule });
                }
                d += 1;
            }
        }
        if !frozen {
            for k in 0..RULE_SIZE {
                for step in [-1, 1] {
                    let e = self.run_rule[k] + step;
                    if !(0..=RULE_MAX).contains(&e) {
                        continue;
                    }
                    let mut r = self.run_rule;
                    r[k] = e;
                    moves.push(Plan { ids: ids.clone(), rule: r });
                }
            }
        }
        moves
    }

    fn set_current(&mut self, ids: Vec<usize>, rule: Rule, trace: Trace, score: f64) {
        self.cur_ids = ids;
        self.cur_rule = rule;
        self.cur_trace = trace;
        self.cur_score = score;
    }

    /// 今の筋のいちばんにする。いちばん良い結果より良ければ、それも更新して true
    fn set_run(&mut self, ids: Vec<usize>, rule: Rule, trace: Trace, result: PackResult) -> bool {
        self.run_score = result.score;
        let improved = result.score < self.best.score - 1e-9;
        if improved {
            self.best = result;
            self.best_ids = ids.clone();
            self.best_rule = rule;
            self.kicks = 0;
        }
        self.run_ids = ids;
        self.run_rule = rule;
        self.run_trace = trace;
        improved
    }

    fn start_from(&self, ids: &[usize], rule: &Rule) -> Option<usize> {
        if *rule != self.cur_rule {
            return Some(0);
        }
        let len = ids.len().min(self.cur_ids.len());
        let mut start = 0;
        while start < len && ids[start] == self.cur_ids[start] {
            start += 1;
        }
        if start == len && ids.len() == self.cur_ids.len() {
            None
        } else {
            Some(start)
        }
    }

    /// ほかの係の良い並べ方を受け取る（今より良ければ乗り換える）
    pub fn adopt(&mut self, ids: Vec<usize>, rule: Rule) -> bool {
        let (trace, result) = evaluate_ids(self.ctx, &ids, &rule);
        self.tried += 1;
        if result.score < self.best.score - 1e-9 {
            self.polish.clear();
            self.polishing = false;
            self.fails = 0;
            self.set_current(ids.clone(), rule, trace.clone(), result.score);
            return self.set_run(ids, rule, trace, result);
        }
        false
    }

    /// 仕上げても良くならなかった: 新しい筋を始める（ふだんは大きく崩し、続けて駄目なほど広く。何回かに 1 回は新しい並べ方から）
    fn restart(&mut self, frozen: bool) -> bool {
        let ctx = self.ctx;
        self.polishing = false;
        self.polish.clear();
        self.fails = 0;
        self.anneal_steps = 0.0;
        self.kicks += 1;
        let plan = if self.kicks % FRESH_EVERY == 0 {
            let keep = self.best_rule;
            fresh_plan(ctx.input, &ctx.table, &mut self.rand, if frozen { Some(&keep) } else { None })
        } else {
            shake_plan(&self.best_ids, &self.best_rule, &mut self.rand, frozen, shake_level_of(self.kicks - 1))
        };
        let (trace, result) = evaluate_ids(ctx, &plan.ids, &plan.rule);
        self.tried += 1;
        self.set_current(plan.ids.clone(), plan.rule, trace.clone(), result.score);
        self.set_run(plan.ids, plan.rule, trace, result)
    }

    pub fn step(&mut self) -> bool {
        let ctx = self.ctx;
        let frozen = rules_frozen(ctx.input, self.started.elapsed().as_secs_f64() * 1000.0);
        let mut kind = -1;
        let tried = self.tried as usize;
        let (ids, rule) = if tried < self.plans.len() {
            (self.plans[tried].ids.clone(), self.plans[tried].rule)
        } else {
            if !self.polishing && self.fails >= POLISH_AFTER {
                self.polish = self.polish_moves(frozen);
                self.polishing = true;
                let (ids, rule, trace, score) =
                    (self.run_ids.clone(), self.run_rule, self.run_trace.clone(), self.run_score);
                self.set_current(ids, rule, trace, score);
            }
            let mv = if self.polishing { self.polish.pop() } else { None };
            if self.polishing && mv.is_none() {
                return self.restart(frozen);
            }
            match mv {
                Some(p) => (p.ids, p.rule),
                None => {
                    let w = with_rule_phase(self.stats.weights(), frozen);
                    let next = mutate(&self.cur_ids, &self.cur_rule, &mut self.rand, &ctx.table, None, &w);
                    kind = next.kind;
                    (next.ids, next.rule)
                }
            }
        };
        let start = if tried < self.plans.len() { Some(0) } else { self.start_from(&ids, &rule) };
        self.tried += 1;
        let Some(start) = start else {
            self.fails += 1;
            return false;
        };
        let wts = weights_of(&rule);
        let trace = if start > 0 {
            pack_in_order(&ids, &wts, ctx.input, &ctx.table, Some(&self.cur_trace), start)
        } else {
            pack_in_order(&ids, &wts, ctx.input, &ctx.table, None, 0)
        };
        let result = finish(&trace, ctx, Some(genome_of(&ids, &rule, &ctx.table)));
        self.anneal_steps += 1.0;
        self.stats.record(kind, 1.0, if result.score < self.cur_score - 1e-9 { 1.0 } else { 0.0 });
        if result.score < self.run_score - 1e-9 {
            // 今の筋のいちばんが良くなった
            self.set_current(ids.clone(), rule, trace.clone(), result.score);
            self.fails = 0;
            self.polish.clear();
            self.polishing = false;
            return self.set_run(ids, rule, trace, result);
        }
        self.fails += 1;
        if !self.polishing {
            let t = temperature_at(self.anneal_steps, CPU_HALF_LIFE);
            if accept_worse(result.score - self.cur_score, t, &mut self.rand) {
                self.set_current(ids, rule, trace, result.score);
            }
        }
        false
    }
}

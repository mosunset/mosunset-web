//! 「柱で積む」方式（TS の columns.ts の移植。仕様はサイトの spec.tsx の 5-2）。
//! 底面が近い箱を縦に積んだ柱を作り、柱を奥（壁側）の列から床に並べる。高さの目標 H を決め、
//! すべての柱を H 以下にして床に収まれば成功。収まる H をできるだけ低く探しつつ、
//! 柱の組み方・列の分け方を少しずつ変えた結果をたくさん出す（点数の付け方は並べ順の方式と同じ）。
//!
//! TS は並べ替えの比べ方の中で乱数を引いてゆらぎを入れているが、Rust の並べ替えは比べ方が食い違うと止まるので、
//! 先に箱ごとのゆらぎ（0.9〜1.1 倍）を決めてから並べ替える。乱数の引き方が違うので、TS と同じ種でも同じ形にはならない
//! （置いた形の点数は、TS の evaluatePlacements と同じ）。

use crate::model::*;
use crate::solver::*;

/// 底面が近いとみなす幅（縦・横それぞれ、mm）
const FOOT_TOL: i64 = 10;
/// 収まらなかったときに、高さの目標を上げる幅（mm）
const H_STEP: i64 = 10;
/// 1 つの高さの目標で、何回試してだめなら上げるか
const TRIES_PER_H: u32 = 40;

#[derive(Clone, Copy)]
struct Opt {
    w: i64,
    d: i64,
    h: i64,
    faces: [Face; 6],
    laid: bool,
}

struct BoxItem {
    ty: usize,
    rank: f64,
}

#[derive(Clone, Copy)]
struct Item {
    b: usize,
    o: Opt,
}

struct Column {
    items: Vec<Item>,
    w: i64,
    d: i64,
    h: i64,
    rank: f64,
}

/// 箱の置き方の一覧（寸法と横倒しが同じものは 1 つ。正面が手前を向く向きを優先）
fn options_of(b: &BoxSpec) -> Vec<Opt> {
    let mut out: Vec<Opt> = Vec::new();
    for o in orientations_of(b, true) {
        let opt = Opt { w: o.w, d: o.d, h: o.h, faces: o.faces, laid: o.laid };
        match out.iter_mut().find(|p| p.w == o.w && p.d == o.d && p.h == o.h && p.laid == o.laid) {
            Some(prev) => {
                if prev.faces[3] != FRONT && o.faces[3] == FRONT {
                    *prev = opt;
                }
            }
            None => out.push(opt),
        }
    }
    out
}

/// 上の箱が、下の箱にどれだけ支えられるか（手前と左をそろえて積むとき）が足りるか
fn supported(lower: &Opt, upper: &Opt, percent: i64) -> bool {
    let area = lower.w.min(upper.w) * lower.d.min(upper.d);
    area * 100 >= percent * upper.w * upper.d
}

/// 柱の中を下から大きい順に並べ、支えが足りない箱を外す（残した箱を返す）
fn settle(items: &[Item], percent: i64) -> Vec<Item> {
    let mut sorted = items.to_vec();
    sorted.sort_by(|a, b| (b.o.w * b.o.d).cmp(&(a.o.w * a.o.d)).then(b.o.h.cmp(&a.o.h)));
    let mut kept: Vec<Item> = Vec::new();
    for it in sorted {
        match kept.last() {
            Some(top) if !supported(&top.o, &it.o, percent) => {}
            _ => kept.push(it),
        }
    }
    kept
}

fn column_of(items: Vec<Item>, boxes: &[BoxItem]) -> Column {
    let w = items.iter().map(|it| it.o.w).max().unwrap_or(0);
    let d = items.iter().map(|it| it.o.d).max().unwrap_or(0);
    let h = items.iter().map(|it| it.o.h).sum();
    let rank = items.iter().map(|it| boxes[it.b].rank).sum::<f64>() / items.len().max(1) as f64;
    Column { items, w, d, h, rank }
}

/// 高さの合計が cap 以下で、できるだけ cap に近くなる組み合わせ（部分和問題を動的計画法で解く）。選んだ番号を返す
fn best_subset(heights: &[i64], cap: i64) -> Vec<usize> {
    if cap <= 0 || heights.is_empty() {
        return vec![];
    }
    let cap = cap as usize;
    let mut from = vec![-2i32; cap + 1];
    from[0] = -1;
    for (i, &h) in heights.iter().enumerate() {
        let h = h as usize;
        if h > cap {
            continue;
        }
        let mut s = cap;
        while s >= h {
            if from[s] == -2 && from[s - h] != -2 && from[s - h] != i as i32 {
                from[s] = i as i32;
            }
            if s == 0 {
                break;
            }
            s -= 1;
        }
    }
    let mut s = cap;
    while s > 0 && from[s] == -2 {
        s -= 1;
    }
    let mut picked = Vec::new();
    // 同じ番号を 2 度使わないよう、たどりながら確かめる
    let mut used = vec![false; heights.len()];
    while s > 0 {
        let i = from[s];
        if i < 0 || used[i as usize] {
            break;
        }
        used[i as usize] = true;
        picked.push(i as usize);
        s -= heights[i as usize] as usize;
    }
    picked
}

/// 柱で積む探し方（TS の createColumnSearch）
pub struct ColumnSearch<'a> {
    ctx: &'a Ctx<'a>,
    rand: Rand,
    boxes: Vec<BoxItem>,
    /// 種類ごとの置き方（床に収まるものだけ）
    opts: Vec<Vec<Opt>>,
    too_big: Vec<Unplaced>,
    min_h: i64,
    prefer_upright: bool,
    h: i64,
    feasible_h: Option<i64>,
    tries_at_h: u32,
    pub tried: u64,
    pub best: Option<PackResult>,
    /// 試したすべての結果からの、部門別のいちばん
    pub metrics: MetricBests,
}

impl<'a> ColumnSearch<'a> {
    pub fn new(ctx: &'a Ctx<'a>, seed: i64) -> ColumnSearch<'a> {
        let input = ctx.input;
        let u = input.floor_x - 2 * input.edge_gap;
        let v = input.floor_y - 2 * input.edge_gap;
        let present: Vec<usize> = (0..input.boxes.len())
            .filter(|&t| input.boxes[t].count > 0 && fits_floor(&input.boxes[t], input))
            .collect();
        let rank_of = |t: usize| -> f64 {
            present
                .iter()
                .position(|&p| p == t)
                .map(|i| i as f64 / (present.len().max(2) - 1) as f64)
                .unwrap_or(0.0)
        };
        let mut too_big = Vec::new();
        let mut boxes = Vec::new();
        let mut opts = vec![Vec::new(); input.boxes.len()];
        for (ty, b) in input.boxes.iter().enumerate() {
            if b.count <= 0 {
                continue;
            }
            if !fits_floor(b, input) {
                too_big.push(Unplaced { ty, count: b.count, reason: "too-big" });
                continue;
            }
            opts[ty] = options_of(b).into_iter().filter(|o| o.w <= u && o.d <= v).collect();
            for _ in 0..b.count {
                boxes.push(BoxItem { ty, rank: rank_of(ty) });
            }
        }
        // 高さの目標の下限: いちばん低く置ける向きでも、いちばん背の高い箱の高さ。全部を床に流したときの高さ
        let tallest = boxes.iter().map(|b| opts[b.ty].iter().map(|o| o.h).min().unwrap_or(0)).max().unwrap_or(0);
        let volume: i64 = boxes.iter().map(|b| opts[b.ty].first().map(|o| o.w * o.d * o.h).unwrap_or(0)).sum();
        let flat = (volume as f64 / (u * v).max(1) as f64).ceil() as i64;
        let min_h = 1.max(tallest).max(flat);
        let mut s = ColumnSearch {
            ctx,
            rand: Rand::new(seed.wrapping_mul(104_729).wrapping_add(17)),
            boxes,
            opts,
            too_big,
            min_h,
            prefer_upright: input.tidy.weight > 0.0 && input.tidy.upright,
            h: min_h,
            feasible_h: None,
            tries_at_h: 0,
            tried: 0,
            best: None,
            metrics: MetricBests::default(),
        };
        s.step();
        s
    }

    pub fn exhausted(&self) -> bool {
        self.boxes.is_empty()
    }

    /// ゆらぎ（0.9〜1.1 倍）
    fn jitter(&mut self) -> f64 {
        0.9 + self.rand.next() * 0.2
    }

    /// 高さの目標 H で、柱を作って床に並べる（1 回分。ゆらぎを入れて毎回少し違う形にする）。
    /// どの向きでも H を超える箱があれば None。返すのは結果と、全部収まったか
    fn build(&mut self, hh: i64) -> Option<(PackResult, bool)> {
        let input = self.ctx.input;
        let (gap, percent, tidy) = (input.gap, input.support_percent, input.tidy);
        let u_max = input.floor_x - 2 * input.edge_gap;
        let v_max = input.floor_y - 2 * input.edge_gap;
        let anchor = anchor_of(&input.walls);
        let (xx, yy, e) = (input.floor_x, input.floor_y, input.edge_gap);

        // 1. 向き: そのままを優先し、ときどき横倒し（背が低くなる向き）も選ぶ
        let lay_chance = if self.prefer_upright { self.rand.next() * 0.15 } else { self.rand.next() * 0.6 };
        let mut items: Vec<Item> = Vec::with_capacity(self.boxes.len());
        for bi in 0..self.boxes.len() {
            let ty = self.boxes[bi].ty;
            let ok: Vec<Opt> = self.opts[ty].iter().copied().filter(|o| o.h <= hh).collect();
            if ok.is_empty() {
                return None;
            }
            let upright: Vec<Opt> = ok.iter().copied().filter(|o| !o.laid).collect();
            let pool = if !upright.is_empty() && self.rand.next() >= lay_chance { upright } else { ok };
            let o = pool[(self.rand.next() * pool.len() as f64) as usize];
            items.push(Item { b: bi, o });
        }

        // 2. 底面が近い箱のまとまり（大きい順。少しゆらぎを入れる）
        let keys: Vec<f64> = items.iter().map(|it| (it.o.w * it.o.d) as f64 * self.jitter()).collect();
        let mut idx: Vec<usize> = (0..items.len()).collect();
        idx.sort_by(|&a, &b| keys[b].partial_cmp(&keys[a]).unwrap());
        let near = |c: &[Item], o: &Opt| (c[0].o.w - o.w).abs() <= FOOT_TOL && (c[0].o.d - o.d).abs() <= FOOT_TOL;
        let mut classes: Vec<Vec<Item>> = Vec::new();
        for &i in &idx {
            let it = items[i];
            if let Some(c) = classes.iter_mut().find(|c| near(c, &it.o)) {
                c.push(it);
                continue;
            }
            // 床の上で 90° 回すと近いまとまりがあれば、回した向きで入れる
            let turned = self.opts[self.boxes[it.b].ty]
                .iter()
                .copied()
                .find(|o| o.w == it.o.d && o.d == it.o.w && o.h == it.o.h && o.laid == it.o.laid);
            if let Some(t) = turned {
                if let Some(c) = classes.iter_mut().find(|c| near(c, &t)) {
                    c.push(Item { b: it.b, o: t });
                    continue;
                }
            }
            classes.push(vec![it]);
        }

        // 3. まとまりごとに、高さの合計が H に近くなるよう柱を組む
        let mut columns: Vec<Column> = Vec::new();
        for cls in &classes {
            let mut rest = cls.clone();
            let boxes = &self.boxes;
            rest.sort_by(|a, b| {
                b.o.h.cmp(&a.o.h).then_with(|| {
                    if tidy.near {
                        boxes[a.b].rank.partial_cmp(&boxes[b.b].rank).unwrap()
                    } else {
                        std::cmp::Ordering::Equal
                    }
                })
            });
            while !rest.is_empty() {
                let first = rest[0];
                // ときどき候補から外して、違う組み方も試す
                let mut pool: Vec<(usize, Item)> = Vec::new();
                for (k, it) in rest.iter().enumerate().skip(1) {
                    if self.rand.next() > 0.08 {
                        pool.push((k, *it));
                    }
                }
                let heights: Vec<i64> = pool.iter().map(|(_, it)| it.o.h).collect();
                let picked = best_subset(&heights, hh - first.o.h);
                let mut group = vec![first];
                let mut group_idx = vec![0usize];
                for p in picked {
                    group.push(pool[p].1);
                    group_idx.push(pool[p].0);
                }
                let kept = settle(&group, percent);
                // 柱に入れた箱を除く（支えが足りずに外した箱は、残りに戻って次の柱に入る）
                let mut remove = vec![false; rest.len()];
                for k in &kept {
                    // 同じ箱（b）は 1 つしかないので、b で見分ける
                    if let Some(pos) = group_idx.iter().position(|&gi| rest[gi].b == k.b) {
                        remove[group_idx[pos]] = true;
                    }
                }
                columns.push(column_of(kept, &self.boxes));
                let mut next = Vec::with_capacity(rest.len());
                for (k, it) in rest.iter().enumerate() {
                    if !remove[k] {
                        next.push(*it);
                    }
                }
                rest = next;
            }
        }

        // 4. 箱 1 個だけの柱は、ほかの柱の上に載せられれば載せる（高さの合計が H に近くなるところへ）
        let mut singles: Vec<usize> = (0..columns.len()).filter(|&i| columns[i].items.len() == 1).collect();
        singles.sort_by(|&a, &b| columns[a].h.cmp(&columns[b].h));
        for si in singles {
            // ほかの箱が載って 1 個でなくなった柱は、そのまま
            if columns[si].items.len() != 1 {
                continue;
            }
            let it = columns[si].items[0];
            let mut target: Option<usize> = None;
            for (ci, c) in columns.iter().enumerate() {
                if ci == si || c.items.is_empty() || c.h + it.o.h > hh {
                    continue;
                }
                if !supported(&c.items[c.items.len() - 1].o, &it.o, percent) {
                    continue;
                }
                if target.is_none_or(|t| c.h > columns[t].h) {
                    target = Some(ci);
                }
            }
            if let Some(t) = target {
                columns[t].items.push(it);
                columns[t].h += it.o.h;
                let n = columns[t].items.len() as f64;
                columns[t].rank = columns[t].items.iter().map(|x| self.boxes[x.b].rank).sum::<f64>() / n;
                columns[si].items.clear();
            }
        }
        columns.retain(|c| !c.items.is_empty());

        // 5. 列に分ける: 背の高い柱から順に、奥行きの増え方がいちばん小さい列へ（入らなければ新しい列）
        let keys: Vec<f64> = columns.iter().map(|c| c.h as f64 * self.jitter()).collect();
        let mut order: Vec<usize> = (0..columns.len()).collect();
        order.sort_by(|&a, &b| keys[b].partial_cmp(&keys[a]).unwrap());
        struct Row {
            cols: Vec<usize>,
            width: i64,
            depth: i64,
        }
        let mut rows: Vec<Row> = Vec::new();
        for &ci in &order {
            let c = &columns[ci];
            let mut best: Option<usize> = None;
            let mut best_grow = i64::MAX;
            for (ri, r) in rows.iter().enumerate() {
                if r.width + gap + c.w > u_max {
                    continue;
                }
                let grow = r.depth.max(c.d) - r.depth;
                if grow < best_grow {
                    best_grow = grow;
                    best = Some(ri);
                }
            }
            match best {
                Some(ri) if (best_grow as f64) <= c.d as f64 * 0.3 => {
                    let r = &mut rows[ri];
                    r.cols.push(ci);
                    r.width += gap + c.w;
                    r.depth = r.depth.max(c.d);
                }
                _ => rows.push(Row { cols: vec![ci], width: c.w, depth: c.d }),
            }
        }

        // 6. 列の中の順番: 横の壁が片側だけなら背の高い柱を壁側から、そうでなければ真ん中を高く（左右の釣り合い）。
        //    リストで近い箱を近くにするときは、並び順でそろえる
        let side_wall = input.walls.left != input.walls.right;
        for r in rows.iter_mut() {
            if tidy.weight > 0.0 && tidy.near && self.rand.next() < 0.5 {
                r.cols.sort_by(|&a, &b| columns[a].rank.partial_cmp(&columns[b].rank).unwrap());
            } else if side_wall {
                r.cols.sort_by(|&a, &b| columns[b].h.cmp(&columns[a].h));
            } else {
                let mut desc = r.cols.clone();
                desc.sort_by(|&a, &b| columns[b].h.cmp(&columns[a].h));
                let mut arranged: std::collections::VecDeque<usize> = std::collections::VecDeque::new();
                for (i, c) in desc.into_iter().enumerate() {
                    if i % 2 == 0 {
                        arranged.push_back(c);
                    } else {
                        arranged.push_front(c);
                    }
                }
                r.cols = arranged.into_iter().collect();
            }
        }

        // 7. 置く: 奥の列から。柱は列の手前の面にそろえ、柱の中の箱も手前と左をそろえる
        let mut placements: Vec<Placement> = Vec::with_capacity(self.boxes.len());
        let mut unplaced_types: Vec<usize> = Vec::new();
        let mut v = 0i64;
        let mut height = 0i64;
        for r in &rows {
            let fits = v + r.depth <= v_max;
            let mut u = 0i64;
            for &ci in &r.cols {
                let c = &columns[ci];
                if !fits {
                    for it in &c.items {
                        unplaced_types.push(self.boxes[it.b].ty);
                    }
                    continue;
                }
                let mut z = 0i64;
                // 奥に壁があるとき（v を奥から数える）は、v の大きい側が手前
                let col_v = if anchor.from_back { v + r.depth - c.d } else { v };
                for it in &c.items {
                    let o = it.o;
                    let bu = u;
                    let bv = if anchor.from_back { col_v + c.d - o.d } else { col_v };
                    placements.push(Placement {
                        ty: self.boxes[it.b].ty,
                        x: if anchor.from_right { xx - e - bu - o.w } else { e + bu },
                        y: if anchor.from_back { yy - e - bv - o.d } else { e + bv },
                        z,
                        w: o.w,
                        d: o.d,
                        h: o.h,
                        faces: o.faces,
                        laid_down: o.laid,
                    });
                    z += o.h;
                }
                height = height.max(z);
                u += c.w + gap;
            }
            if fits {
                v += r.depth + gap;
            }
        }
        let fits = unplaced_types.is_empty();
        let result = evaluate_placements(placements, unplaced_types, height, self.ctx, &self.too_big, None);
        Some((result, fits))
    }

    /// 1 回試す。いちばん良い結果が良くなったら true
    pub fn step(&mut self) -> bool {
        // 収まる高さが見つかるまでは、H を少しずつ上げる。見つかったあとは、その前後の高さでいろいろな形を出す
        let target = match self.feasible_h {
            None => self.h,
            Some(f) => {
                let r = self.rand.next();
                if r < 0.35 {
                    f - H_STEP
                } else if r < 0.7 {
                    f
                } else {
                    f + H_STEP * (1 + (self.rand.next() * 4.0) as i64)
                }
            }
        };
        self.tried += 1;
        let Some((result, fits)) = self.build(self.min_h.max(target)) else {
            self.h += H_STEP;
            return false;
        };
        self.metrics.see(&result);
        if fits {
            self.feasible_h = Some(self.feasible_h.map_or(result.height, |f| f.min(result.height)));
        } else if self.feasible_h.is_none() {
            self.tries_at_h += 1;
            if self.tries_at_h >= TRIES_PER_H {
                self.h += H_STEP;
                self.tries_at_h = 0;
            }
        }
        if self.best.as_ref().is_none_or(|b| result.score < b.score - 1e-9) {
            self.best = Some(result);
            return true;
        }
        false
    }
}

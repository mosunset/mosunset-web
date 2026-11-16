// 並べ順どおりに 1 つずつ置いていく計算（solver.rs の pack_in_order と同じ決め方）を、
// 1 スレッドで 1 通りずつ GPU で動かす。NVRTC で実行時にコンパイルする（MAXM は置く単位の数の上限）。
// 近くの箱は全部の箱を調べる（CPU のマス目は速くするためだけのもので、結果は同じ）。
//
// 置いた単位は、スレッドどうしで読み書きがまとまるよう [k][項目][スレッド] の順に並べる。

#ifndef MAXM
#define MAXM 64
#endif
#define NF 10
#define MAXP (5 * MAXM + 1)
// 単位の表: [向きの数, まとまり, 並び順, (w, d, h, 横倒し, 正面OK) × 6]
#define UNIT_STRIDE 33

enum { F_U, F_V, F_Z, F_W, F_D, F_H, F_GROUP, F_RANK, F_UNIT, F_OI };

extern "C" __global__ void pack(
    const int* __restrict__ units,
    int U, int V, int gap, int supportPercent, int alongSideFirst,
    const int* __restrict__ candIds, const int* __restrict__ candLen,
    const int* __restrict__ candW, const int* __restrict__ candParent,
    const int* __restrict__ candStart,
    const int* __restrict__ parPlaced, const int* __restrict__ parPlacedAfter,
    const int* __restrict__ parHeightAfter, const int* __restrict__ parUnplaced,
    const int* __restrict__ parUnplacedAfter,
    int* __restrict__ outPlaced, int* __restrict__ outNp,
    int* __restrict__ outUnplaced, int* __restrict__ outNu,
    int* __restrict__ outHeight, int B)
{
    const int c = blockIdx.x * blockDim.x + threadIdx.x;
    if (c >= B) return;
#define PL(k, f) outPlaced[((size_t)(k) * NF + (f)) * B + c]

    const int m = candLen[c];
    const int* order = candIds + (size_t)c * MAXM;
    long long W[12];
    for (int i = 0; i < 12; i++) {
        int e = candW[c * 12 + i];
        W[i] = e <= 0 ? 0 : (1LL << (e - 1));
    }
    int start = candStart[c];
    const int par = candParent[c];
    int np = 0, nu = 0;
    long long height = 0;
    if (par >= 0 && start > 0) {
        np = parPlacedAfter[par * MAXM + start - 1];
        nu = parUnplacedAfter[par * MAXM + start - 1];
        height = parHeightAfter[par * MAXM + start - 1];
        for (int k = 0; k < np; k++)
            for (int f = 0; f < NF; f++) PL(k, f) = parPlaced[((size_t)par * MAXM + k) * NF + f];
        for (int k = 0; k < nu; k++) outUnplaced[(size_t)c * MAXM + k] = parUnplaced[par * MAXM + k];
    } else {
        start = 0;
    }

    // 置く場所の候補（TS の Set と同じく、入れた順に並べる）
    int us[MAXM + 1], vs[MAXM + 1];
    int pu[MAXP], pv[MAXP];
    int nus = 1, nvs = 1, npts = 1;
    us[0] = 0; vs[0] = 0; pu[0] = 0; pv[0] = 0;

    auto addU = [&](int u) {
        for (int i = 0; i < nus; i++) if (us[i] == u) return;
        us[nus++] = u;
    };
    auto addV = [&](int v) {
        for (int i = 0; i < nvs; i++) if (vs[i] == v) return;
        vs[nvs++] = v;
    };
    auto addPoint = [&](int u, int v) {
        if (u >= U || v >= V) return;
        for (int i = 0; i < npts; i++) if (pu[i] == u && pv[i] == v) return;
        pu[npts] = u; pv[npts] = v; npts++;
    };
    auto reg = [&](int k) {
        int u = PL(k, F_U), v = PL(k, F_V), w = PL(k, F_W), d = PL(k, F_D);
        addU(u + w + gap);
        addV(v + d + gap);
        addPoint(u + w + gap, v);
        addPoint(u, v + d + gap);
        addPoint(u, v);
        addPoint(u + w + gap, 0);
        addPoint(0, v + d + gap);
    };
    for (int k = 0; k < np; k++) reg(k);

    for (int index = start; index < m; index++) {
        const int unitId = order[index];
        const int* ut = units + unitId * UNIT_STRIDE;
        const int nori = ut[0], group = ut[1], rank = ut[2];
        bool have = false;
        long long bestScore = 0;
        int bu = 0, bv = 0, bz = 0, boi = 0;
        const bool grid = nus * nvs <= 2500;
        const int ncand = grid ? nus * nvs : npts;
        for (int ci = 0; ci < ncand; ci++) {
            int u, v;
            if (grid) { u = us[ci / nvs]; v = vs[ci % nvs]; }
            else { u = pu[ci]; v = pv[ci]; }
            const long long a1 = alongSideFirst ? u : v;
            const long long a2 = alongSideFirst ? v : u;
            for (int oi = 0; oi < nori; oi++) {
                const int* o = ut + 3 + oi * 5;
                const int ow = o[0], od = o[1], oh = o[2], laid = o[3], frontOK = o[4];
                if (u + ow > U || v + od > V) continue;
                const long long fixed = W[3] * (laid ? 100 : 0) + W[5] * a1 + W[6] * a2 + W[10] * (frontOK ? 0 : 100);
                #define AT(zz) (W[0] * ((height > (long long)(zz) + oh ? height : (long long)(zz) + oh) - height) + W[1] * ((long long)(zz) + oh) + W[2] * (long long)(zz) + fixed)
                if (have && AT(0) >= bestScore) continue;
                int z = 0;
                for (int k = 0; k < np; k++) {
                    int pu_ = PL(k, F_U), pw = PL(k, F_W);
                    if (!(u < pu_ + pw && pu_ < u + ow)) continue;
                    int pv_ = PL(k, F_V), pd = PL(k, F_D);
                    if (!(v < pv_ + pd && pv_ < v + od)) continue;
                    int top = PL(k, F_Z) + PL(k, F_H);
                    if (top > z) z = top;
                }
                if (have && AT(z) >= bestScore) continue;
                bool blocked = false;
                for (int k = 0; k < np && !blocked; k++) {
                    int bz_ = PL(k, F_Z), bh = PL(k, F_H);
                    if (bz_ >= z + oh || bz_ + bh <= z) continue;
                    int bu_ = PL(k, F_U), bw = PL(k, F_W), bv_ = PL(k, F_V), bd = PL(k, F_D);
                    if (u < bu_ + bw + gap && bu_ < u + ow + gap && v < bv_ + bd + gap && bv_ < v + od + gap) blocked = true;
                }
                if (blocked) continue;
                long long align = 0;
                if (z > 0) {
                    long long supported = 0;
                    for (int k = 0; k < np; k++) {
                        if (PL(k, F_Z) + PL(k, F_H) != z) continue;
                        int bu_ = PL(k, F_U), bw = PL(k, F_W), bv_ = PL(k, F_V), bd = PL(k, F_D);
                        int ou = min(u + ow, bu_ + bw) - max(u, bu_);
                        int ov = min(v + od, bv_ + bd) - max(v, bv_);
                        if (ou > 0 && ov > 0) {
                            supported += (long long)ou * ov;
                            if (bu_ == u) align++;
                            if (bu_ + bw == u + ow) align++;
                            if (bv_ == v) align++;
                            if (bv_ + bd == v + od) align++;
                        }
                    }
                    if (supported * 100 < (long long)supportPercent * ow * od) continue;
                }
                long long contact = 0;
                if (u == 0) contact += (long long)od * oh;
                if (u + ow == U) contact += (long long)od * oh;
                if (v == 0) contact += (long long)ow * oh;
                if (v + od == V) contact += (long long)ow * oh;
                long long boxContact = 0, same = 0, flush = 0, sideLen = 0, farSum = 0;
                for (int k = 0; k < np; k++) {
                    int bz_ = PL(k, F_Z), bh = PL(k, F_H);
                    int oz = min(z + oh, bz_ + bh) - max(z, bz_);
                    if (oz <= 0) continue;
                    int bu_ = PL(k, F_U), bw = PL(k, F_W), bv_ = PL(k, F_V), bd = PL(k, F_D);
                    bool isSame = PL(k, F_GROUP) == group;
                    bool flat = bz_ + bh == z + oh;
                    int brank = PL(k, F_RANK);
                    int ov = min(v + od, bv_ + bd) - max(v, bv_);
                    if (ov > 0 && (bu_ + bw + gap == u || u + ow + gap == bu_)) {
                        long long a = (long long)ov * oz;
                        contact += a; boxContact += a;
                        if (isSame) same += a;
                        if (flat) flush += ov;
                        sideLen += ov;
                        farSum += (long long)ov * abs(brank - rank);
                        if (bv_ == v) align++;
                        if (bv_ + bd == v + od) align++;
                    }
                    int ou = min(u + ow, bu_ + bw) - max(u, bu_);
                    if (ou > 0 && (bv_ + bd + gap == v || v + od + gap == bv_)) {
                        long long a = (long long)ou * oz;
                        contact += a; boxContact += a;
                        if (isSame) same += a;
                        if (flat) flush += ou;
                        sideLen += ou;
                        farSum += (long long)ou * abs(brank - rank);
                        if (bu_ == u) align++;
                        if (bu_ + bw == u + ow) align++;
                    }
                }
                long long dOpen = (2LL * (ow + od) * oh) / 1000; if (dOpen < 1) dOpen = 1;
                long long q = contact / dOpen; if (q > 1000) q = 1000;
                const long long open = 1000 - q;
                long long fq = (flush * 1000) / (2LL * (ow + od)); if (fq > 1000) fq = 1000;
                const long long unflush = 1000 - fq;
                const long long unaligned = 1000 - (align < 8 ? align : 8) * 125;
                long long notSame = 1000;
                if (boxContact > 0) {
                    long long dd = boxContact / 1000; if (dd < 1) dd = 1;
                    long long s = same / dd; if (s > 1000) s = 1000;
                    notSame = 1000 - s;
                }
                const long long farOrder = sideLen > 0 ? farSum / sideLen : 1000;
                const long long score = AT(z) + W[4] * open + W[7] * unflush + W[8] * unaligned + W[9] * notSame + W[11] * farOrder;
                #undef AT
                if (have && score >= bestScore) continue;
                have = true;
                bestScore = score;
                bu = u; bv = v; bz = z; boi = oi;
            }
        }
        if (have) {
            const int* o = ut + 3 + boi * 5;
            PL(np, F_U) = bu; PL(np, F_V) = bv; PL(np, F_Z) = bz;
            PL(np, F_W) = o[0]; PL(np, F_D) = o[1]; PL(np, F_H) = o[2];
            PL(np, F_GROUP) = group; PL(np, F_RANK) = rank; PL(np, F_UNIT) = unitId; PL(np, F_OI) = boi;
            reg(np);
            np++;
            if (bz + o[2] > height) height = bz + o[2];
        } else {
            outUnplaced[(size_t)c * MAXM + nu] = unitId;
            nu++;
        }
    }
    outNp[c] = np;
    outNu[c] = nu;
    outHeight[c] = (int)height;
#undef PL
}

// ---- 1 ワープ（32 スレッド）で 1 通り ----
// 置く場所の候補（場所 × 向き）を 32 本で分けて調べ、いちばん良いもの（点数が同じなら候補の順番が先のもの）を選ぶ。
// 候補を順に調べて「より小さければ入れ替える」のと同じ結果になる。置いた単位は共有メモリに置く。
// 候補の座標の一覧は、ワープごとのグローバルメモリ（scratch）に置く。

#ifndef WARPS
#define WARPS 4
#endif
#define SCR (2 * (MAXM + 1) + 2 * MAXP)

__device__ __forceinline__ void warpMin(long long& s, int& idx)
{
    for (int off = 16; off > 0; off >>= 1) {
        long long os = __shfl_xor_sync(0xffffffffu, s, off);
        int oi = __shfl_xor_sync(0xffffffffu, idx, off);
        if (os < s || (os == s && oi < idx)) { s = os; idx = oi; }
    }
}

extern "C" __global__ void __launch_bounds__(WARPS * 32) packWarp(
    const int* __restrict__ units,
    int U, int V, int gap, int supportPercent, int alongSideFirst,
    const int* __restrict__ candIds, const int* __restrict__ candLen,
    const int* __restrict__ candW, const int* __restrict__ candParent,
    const int* __restrict__ candStart,
    const int* __restrict__ parPlaced, const int* __restrict__ parPlacedAfter,
    const int* __restrict__ parHeightAfter, const int* __restrict__ parUnplaced,
    const int* __restrict__ parUnplacedAfter,
    int* __restrict__ outPlaced, int* __restrict__ outNp,
    int* __restrict__ outUnplaced, int* __restrict__ outNu,
    int* __restrict__ outHeight, int B, int* __restrict__ scratch)
{
    __shared__ int sp[WARPS][MAXM * NF];
    const int lane = threadIdx.x & 31;
    const int wi = threadIdx.x >> 5;
    const int c = blockIdx.x * WARPS + wi;
    if (c >= B) return;
    int* P = sp[wi];
#define S(k, f) P[(k) * NF + (f)]
    int* us = scratch + (size_t)c * SCR;
    int* vs = us + (MAXM + 1);
    int* pu = vs + (MAXM + 1);
    int* pv = pu + MAXP;

    const int m = candLen[c];
    const int* order = candIds + (size_t)c * MAXM;
    long long W[12];
    for (int i = 0; i < 12; i++) {
        int e = candW[c * 12 + i];
        W[i] = e <= 0 ? 0 : (1LL << (e - 1));
    }
    int start = candStart[c];
    const int par = candParent[c];
    int np = 0, nu = 0;
    long long height = 0;
    if (par >= 0 && start > 0) {
        np = parPlacedAfter[par * MAXM + start - 1];
        nu = parUnplacedAfter[par * MAXM + start - 1];
        height = parHeightAfter[par * MAXM + start - 1];
        for (int i = lane; i < np * NF; i += 32) P[i] = parPlaced[(size_t)par * MAXM * NF + i];
        for (int i = lane; i < nu; i += 32) outUnplaced[(size_t)c * MAXM + i] = parUnplaced[par * MAXM + i];
    } else {
        start = 0;
    }
    __syncwarp();

    int nus = 1, nvs = 1, npts = 1;
    if (lane == 0) { us[0] = 0; vs[0] = 0; pu[0] = 0; pv[0] = 0; }
    __syncwarp();

    // 一覧に無ければ後ろに足す（32 本で探して、0 番が足す）
    auto addTo = [&](int* list, int& n, int x) {
        bool f = false;
        for (int i = lane; i < n; i += 32) if (list[i] == x) f = true;
        if (__any_sync(0xffffffffu, f)) return;
        if (lane == 0) list[n] = x;
        n++;
        __syncwarp();
    };
    auto addPoint = [&](int u, int v) {
        if (u >= U || v >= V) return;
        bool f = false;
        for (int i = lane; i < npts; i += 32) if (pu[i] == u && pv[i] == v) f = true;
        if (__any_sync(0xffffffffu, f)) return;
        if (lane == 0) { pu[npts] = u; pv[npts] = v; }
        npts++;
        __syncwarp();
    };
    auto reg = [&](int k) {
        int u = S(k, F_U), v = S(k, F_V), w = S(k, F_W), d = S(k, F_D);
        addTo(us, nus, u + w + gap);
        addTo(vs, nvs, v + d + gap);
        addPoint(u + w + gap, v);
        addPoint(u, v + d + gap);
        addPoint(u, v);
        addPoint(u + w + gap, 0);
        addPoint(0, v + d + gap);
    };
    for (int k = 0; k < np; k++) reg(k);

    const long long INF = 0x7fffffffffffffffLL;
    for (int index = start; index < m; index++) {
        const int unitId = order[index];
        const int* ut = units + unitId * UNIT_STRIDE;
        const int nori = ut[0], group = ut[1], rank = ut[2];
        const bool grid = nus * nvs <= 2500;
        const int ncand = grid ? nus * nvs : npts;
        const int total = ncand * nori;
        long long best = INF;   // このスレッドが見つけたいちばん良い点数
        int bestIdx = 0x7fffffff;
        int bestZ = 0;
        long long wBest = INF;  // ワープ全体のいちばん良い点数（前の回まで）
        int wIdx = 0x7fffffff;
        for (int base = 0; base < total; base += 32) {
            const int item = base + lane;
            if (item < total) {
                const int ci = item / nori, oi = item - ci * nori;
                int u, v;
                if (grid) { u = us[ci / nvs]; v = vs[ci % nvs]; }
                else { u = pu[ci]; v = pv[ci]; }
                const int* o = ut + 3 + oi * 5;
                const int ow = o[0], od = o[1], oh = o[2], laid = o[3], frontOK = o[4];
                // 先の候補が同じ点数なら先の候補が勝つので、後の候補は「より小さい」ときだけ残す
                #define BEATS(sc) ((sc) < best && ((sc) < wBest || ((sc) == wBest && item < wIdx)))
                if (u + ow <= U && v + od <= V) {
                    const long long a1 = alongSideFirst ? u : v;
                    const long long a2 = alongSideFirst ? v : u;
                    const long long fixed = W[3] * (laid ? 100 : 0) + W[5] * a1 + W[6] * a2 + W[10] * (frontOK ? 0 : 100);
                    #define AT(zz) (W[0] * ((height > (long long)(zz) + oh ? height : (long long)(zz) + oh) - height) + W[1] * ((long long)(zz) + oh) + W[2] * (long long)(zz) + fixed)
                    bool ok = BEATS(AT(0));
                    int z = 0;
                    if (ok) {
                        for (int k = 0; k < np; k++) {
                            int pu_ = S(k, F_U), pw = S(k, F_W);
                            if (!(u < pu_ + pw && pu_ < u + ow)) continue;
                            int pv_ = S(k, F_V), pd = S(k, F_D);
                            if (!(v < pv_ + pd && pv_ < v + od)) continue;
                            int top = S(k, F_Z) + S(k, F_H);
                            if (top > z) z = top;
                        }
                        ok = BEATS(AT(z));
                    }
                    if (ok) {
                        for (int k = 0; k < np; k++) {
                            int bz_ = S(k, F_Z), bh = S(k, F_H);
                            if (bz_ >= z + oh || bz_ + bh <= z) continue;
                            int bu_ = S(k, F_U), bw = S(k, F_W), bv_ = S(k, F_V), bd = S(k, F_D);
                            if (u < bu_ + bw + gap && bu_ < u + ow + gap && v < bv_ + bd + gap && bv_ < v + od + gap) { ok = false; break; }
                        }
                    }
                    long long align = 0;
                    if (ok && z > 0) {
                        long long supported = 0;
                        for (int k = 0; k < np; k++) {
                            if (S(k, F_Z) + S(k, F_H) != z) continue;
                            int bu_ = S(k, F_U), bw = S(k, F_W), bv_ = S(k, F_V), bd = S(k, F_D);
                            int ou = min(u + ow, bu_ + bw) - max(u, bu_);
                            int ov = min(v + od, bv_ + bd) - max(v, bv_);
                            if (ou > 0 && ov > 0) {
                                supported += (long long)ou * ov;
                                if (bu_ == u) align++;
                                if (bu_ + bw == u + ow) align++;
                                if (bv_ == v) align++;
                                if (bv_ + bd == v + od) align++;
                            }
                        }
                        if (supported * 100 < (long long)supportPercent * ow * od) ok = false;
                    }
                    if (ok) {
                        long long contact = 0;
                        if (u == 0) contact += (long long)od * oh;
                        if (u + ow == U) contact += (long long)od * oh;
                        if (v == 0) contact += (long long)ow * oh;
                        if (v + od == V) contact += (long long)ow * oh;
                        long long boxContact = 0, same = 0, flush = 0, sideLen = 0, farSum = 0;
                        for (int k = 0; k < np; k++) {
                            int bz_ = S(k, F_Z), bh = S(k, F_H);
                            int oz = min(z + oh, bz_ + bh) - max(z, bz_);
                            if (oz <= 0) continue;
                            int bu_ = S(k, F_U), bw = S(k, F_W), bv_ = S(k, F_V), bd = S(k, F_D);
                            bool isSame = S(k, F_GROUP) == group;
                            bool flat = bz_ + bh == z + oh;
                            int brank = S(k, F_RANK);
                            int ov = min(v + od, bv_ + bd) - max(v, bv_);
                            if (ov > 0 && (bu_ + bw + gap == u || u + ow + gap == bu_)) {
                                long long a = (long long)ov * oz;
                                contact += a; boxContact += a;
                                if (isSame) same += a;
                                if (flat) flush += ov;
                                sideLen += ov;
                                farSum += (long long)ov * abs(brank - rank);
                                if (bv_ == v) align++;
                                if (bv_ + bd == v + od) align++;
                            }
                            int ou = min(u + ow, bu_ + bw) - max(u, bu_);
                            if (ou > 0 && (bv_ + bd + gap == v || v + od + gap == bv_)) {
                                long long a = (long long)ou * oz;
                                contact += a; boxContact += a;
                                if (isSame) same += a;
                                if (flat) flush += ou;
                                sideLen += ou;
                                farSum += (long long)ou * abs(brank - rank);
                                if (bu_ == u) align++;
                                if (bu_ + bw == u + ow) align++;
                            }
                        }
                        long long dOpen = (2LL * (ow + od) * oh) / 1000; if (dOpen < 1) dOpen = 1;
                        long long q = contact / dOpen; if (q > 1000) q = 1000;
                        long long fq = (flush * 1000) / (2LL * (ow + od)); if (fq > 1000) fq = 1000;
                        long long notSame = 1000;
                        if (boxContact > 0) {
                            long long dd = boxContact / 1000; if (dd < 1) dd = 1;
                            long long s = same / dd; if (s > 1000) s = 1000;
                            notSame = 1000 - s;
                        }
                        const long long farOrder = sideLen > 0 ? farSum / sideLen : 1000;
                        const long long score = AT(z) + W[4] * (1000 - q) + W[7] * (1000 - fq)
                            + W[8] * (1000 - (align < 8 ? align : 8) * 125) + W[9] * notSame + W[11] * farOrder;
                        if (BEATS(score)) { best = score; bestIdx = item; bestZ = z; }
                    }
                    #undef AT
                }
                #undef BEATS
            }
            // ワープ全体のいちばん良いものを、次の回の足切りに使う
            long long s = best; int ix = bestIdx;
            warpMin(s, ix);
            wBest = s; wIdx = ix;
        }
        if (wBest != INF) {
            const int owner = wIdx & 31;
            const int bz = __shfl_sync(0xffffffffu, bestZ, owner);
            const int ci = wIdx / nori, boi = wIdx - ci * nori;
            int bu, bv;
            if (grid) { bu = us[ci / nvs]; bv = vs[ci % nvs]; }
            else { bu = pu[ci]; bv = pv[ci]; }
            const int* o = ut + 3 + boi * 5;
            if (lane == 0) {
                S(np, F_U) = bu; S(np, F_V) = bv; S(np, F_Z) = bz;
                S(np, F_W) = o[0]; S(np, F_D) = o[1]; S(np, F_H) = o[2];
                S(np, F_GROUP) = group; S(np, F_RANK) = rank; S(np, F_UNIT) = unitId; S(np, F_OI) = boi;
            }
            __syncwarp();
            reg(np);
            np++;
            if (bz + o[2] > height) height = bz + o[2];
        } else {
            if (lane == 0) outUnplaced[(size_t)c * MAXM + nu] = unitId;
            nu++;
        }
        __syncwarp();
    }
    // 結果は [k][項目][候補] の順（1 スレッド版と同じ並び）
    for (int i = lane; i < np * NF; i += 32) {
        const int k = i / NF, f = i - k * NF;
        outPlaced[((size_t)k * NF + f) * B + c] = P[i];
    }
    if (lane == 0) {
        outNp[c] = np;
        outNu[c] = nu;
        outHeight[c] = (int)height;
    }
#undef S
}

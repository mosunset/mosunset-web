//! 箱詰めの計算を Windows のネイティブ（Rust・CPU の全コア・CUDA）で動かしてみる試作。
//!
//!   box-packing eval  <input.json> <genomes.json> [--gpu]   並べ方を評価して点数を出す（TS と比べる用）
//!   box-packing genomes <input.json> <count> [seed]          確かめ用の並べ方を作る
//!   box-packing bench <input.json> [--seconds S]             1 秒あたりに試せる数を測る
//!   box-packing solve <input.json> [--seconds S] [--threads N] [--gpu] [--out result.json]
//!   box-packing serve [ポート]                               使う人のための画面（ブラウザーで開く）

mod cuda;
mod gpu;
mod model;
mod server;
mod solver;

use model::*;
use rayon::prelude::*;
use solver::*;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

fn read_input(path: &str) -> PackInput {
    let s = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("{path} を読めません: {e}"));
    let mut v: serde_json::Value =
        serde_json::from_str(&s).unwrap_or_else(|e| panic!("{path} は JSON ではありません: {e}"));
    // サイト・画面の書き出し（{ tool, settings: { ..., boxes }, result }）なら settings を使い、外した箱（enabled: false）は除く
    if let Some(settings) = v.get("settings").filter(|s| s.is_object()).cloned() {
        v = settings;
        if let Some(boxes) = v.get_mut("boxes").and_then(|b| b.as_array_mut()) {
            boxes.retain(|b| b.get("enabled").and_then(|e| e.as_bool()) != Some(false));
        }
    }
    serde_json::from_value(v).unwrap_or_else(|e| panic!("{path} の形が違います: {e}"))
}

pub struct Args {
    pub pos: Vec<String>,
    pub seconds: f64,
    pub threads: usize,
    pub gpu: bool,
    pub out: Option<String>,
    pub batch: usize,
    /// いつもの筋の CPU の係の数（--main）
    pub main_threads: Option<usize>,
    /// 1 スレッドで 1 通りの GPU の計算を使う
    thread_kernel: bool,
}

fn parse_args() -> Args {
    let mut a = Args {
        pos: vec![],
        seconds: 10.0,
        threads: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4),
        gpu: false,
        out: None,
        batch: 16384,
        main_threads: None,
        thread_kernel: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(x) = it.next() {
        match x.as_str() {
            "--seconds" => a.seconds = it.next().unwrap().parse().unwrap(),
            "--threads" => a.threads = it.next().unwrap().parse().unwrap(),
            "--main" => a.main_threads = Some(it.next().unwrap().parse().unwrap()),
            "--batch" => a.batch = it.next().unwrap().parse().unwrap(),
            "--gpu" => a.gpu = true,
            "--thread-kernel" => a.thread_kernel = true,
            "--out" => a.out = it.next(),
            _ => a.pos.push(x),
        }
    }
    a
}

fn main() {
    let args = parse_args();
    let cmd = args.pos.first().map(String::as_str).unwrap_or("");
    match cmd {
        "eval" => cmd_eval(&args),
        "genomes" => cmd_genomes(&args),
        "bench" => cmd_bench(&args),
        "solve" => cmd_solve(&args),
        "serve" => server::serve(&args),
        "install" => cmd_install(),
        "uninstall" => cmd_uninstall(),
        // 引数なし（exe をダブルクリック）なら、画面を開く
        "" => {
            let mut a = args;
            a.pos = vec!["serve".into()];
            server::serve(&a)
        }
        _ => {
            eprintln!("使い方: box-packing (eval|genomes|bench|solve) <input.json> ... / serve / install / uninstall");
            std::process::exit(2);
        }
    }
}

// ---- 確かめ用 ----

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct Summary {
    score: f64,
    height: i64,
    tidiness: f64,
    fill_rate: f64,
    placements: usize,
    unplaced: i64,
}

fn summary(r: &PackResult) -> Summary {
    Summary {
        score: r.score,
        height: r.height,
        tidiness: r.tidiness,
        fill_rate: r.fill_rate,
        placements: r.placements.len(),
        unplaced: r.unplaced.iter().map(|u| u.count).sum(),
    }
}

fn cmd_genomes(args: &Args) {
    let input = read_input(&args.pos[1]);
    let count: usize = args.pos.get(2).map(|s| s.parse().unwrap()).unwrap_or(200);
    let seed: i64 = args.pos.get(3).map(|s| s.parse().unwrap()).unwrap_or(1);
    let ctx = Ctx::new(&input);
    let plans = start_plans(&input, &ctx.table);
    let mut rand = Rand::new(seed);
    let w = KindStats::new().weights();
    let mut out: Vec<Genome> = plans.iter().map(|p| genome_of(&p.ids, &p.rule, &ctx.table)).collect();
    let mut cur = plans[0].clone();
    while out.len() < count {
        let other = plans[rand.below_pub(plans.len())].ids.clone();
        let m = mutate(&cur.ids, &cur.rule, &mut rand, &ctx.table, Some(&other), &w);
        cur = Plan { ids: m.ids, rule: m.rule };
        out.push(genome_of(&cur.ids, &cur.rule, &ctx.table));
        if rand.next() < 0.05 {
            cur = plans[rand.below_pub(plans.len())].clone();
        }
    }
    println!("{}", serde_json::to_string(&out).unwrap());
}

fn cmd_eval(args: &Args) {
    let input = read_input(&args.pos[1]);
    let genomes: Vec<Genome> = serde_json::from_str(&std::fs::read_to_string(&args.pos[2]).unwrap()).unwrap();
    let ctx = Ctx::new(&input);
    let t = Instant::now();
    let results: Vec<PackResult> = genomes.iter().map(|g| evaluate_genome(&ctx, g)).collect();
    eprintln!("CPU: {} 通りを {:.1} ms", genomes.len(), t.elapsed().as_secs_f64() * 1000.0);
    if args.gpu {
        let mut packer = gpu::GpuPacker::new(&ctx, genomes.len().max(1)).expect("GPU を使えません");
        packer.warp = !args.thread_kernel;
        let cands: Vec<gpu::Cand> = genomes
            .iter()
            .map(|g| gpu::Cand {
                ids: unit_ids_of(&g.seq, &ctx.table),
                rule: normalize_rule(Some(&g.rule), &input),
                parent: -1,
                start: 0,
            })
            .collect();
        let t = Instant::now();
        let packed = packer.run(&cands, &ctx.table).expect("GPU の計算に失敗");
        eprintln!("GPU: {} 通りを {:.1} ms", cands.len(), t.elapsed().as_secs_f64() * 1000.0);
        let mut mismatch = 0;
        for (i, p) in packed.iter().enumerate() {
            let cpu = pack_in_order(&cands[i].ids, &weights_of(&cands[i].rule), &input, &ctx.table, None, 0);
            let r = finish(&p.trace, &ctx, None);
            if cpu.placed != p.trace.placed || cpu.unplaced != p.trace.unplaced || (r.score - results[i].score).abs() > 1e-9 {
                mismatch += 1;
                if mismatch <= 3 {
                    eprintln!("  食い違い #{i}: CPU {} 個 / GPU {} 個, 点数 {} / {}", cpu.placed.len(), p.trace.placed.len(), results[i].score, r.score);
                }
            }
        }
        eprintln!("GPU と CPU の食い違い: {mismatch} / {}", packed.len());
    }
    let sums: Vec<Summary> = results.iter().map(summary).collect();
    println!("{}", serde_json::to_string(&sums).unwrap());
}

// ---- 速さを測る ----

fn cmd_bench(args: &Args) {
    let input = read_input(&args.pos[1]);
    let ctx = Ctx::new(&input);
    let secs = args.seconds;
    println!(
        "箱 {} 個・まとまり {}・置く単位の形 {} 通り",
        ctx.table.box_count,
        ctx.table.groups.len(),
        ctx.table.units.len()
    );

    // 1 スレッド
    let mut s = Search::new(&ctx, input.seed);
    let t = Instant::now();
    while t.elapsed().as_secs_f64() < secs {
        for _ in 0..16 {
            s.step();
        }
    }
    let one = s.tried as f64 / t.elapsed().as_secs_f64();
    println!("Rust CPU 1 スレッド: {:>10.0} 通り/秒（いちばん良い点数 {:.4}・高さ {}）", one, s.best.score, s.best.height);

    // 全スレッド（それぞれ別の種で探す）
    let n = args.threads;
    let total = AtomicU64::new(0);
    let t = Instant::now();
    std::thread::scope(|sc| {
        for i in 0..n {
            let ctx = &ctx;
            let total = &total;
            sc.spawn(move || {
                let mut s = Search::new(ctx, ctx.input.seed + i as i64);
                while t.elapsed().as_secs_f64() < secs {
                    for _ in 0..16 {
                        s.step();
                    }
                }
                total.fetch_add(s.tried, Ordering::Relaxed);
            });
        }
    });
    let all = total.load(Ordering::Relaxed) as f64 / t.elapsed().as_secs_f64();
    println!("Rust CPU {n} スレッド: {:>10.0} 通り/秒（1 スレッドの {:.1} 倍）", all, all / one);

    // GPU（置くのは GPU、正式な評価は CPU の全コア）
    match gpu::GpuPacker::new(&ctx, args.batch) {
        Err(e) => println!("GPU: 使えません（{e}）"),
        Ok(mut packer) => {
            packer.warp = !args.thread_kernel;
            let plans = start_plans(&input, &ctx.table);
            let (trace, _) = evaluate_ids(&ctx, &plans[0].ids, &plans[0].rule);
            packer.set_parents(&[&trace]).unwrap();
            let mut rand = Rand::new(7);
            let w = KindStats::new().weights();
            let make = |rand: &mut Rand, b: usize, with_parent: bool| -> Vec<gpu::Cand> {
                (0..b)
                    .map(|_| {
                        let m = mutate(&plans[0].ids, &plans[0].rule, rand, &ctx.table, None, &w);
                        let start = if with_parent { m.start } else { 0 };
                        gpu::Cand { ids: m.ids, rule: m.rule, parent: if with_parent { 0 } else { -1 }, start }
                    })
                    .collect()
            };
            for with_parent in [false, true] {
                let mut done = 0usize;
                let (mut gpu_s, mut fin_s) = (0f64, 0f64);
                let t = Instant::now();
                let mut b = 1024usize;
                while t.elapsed().as_secs_f64() < secs {
                    let cands = make(&mut rand, b, with_parent);
                    let t1 = Instant::now();
                    let packed = packer.run(&cands, &ctx.table).unwrap();
                    let g = t1.elapsed().as_secs_f64();
                    gpu_s += g;
                    let t2 = Instant::now();
                    let _scores: Vec<f64> = packed.par_iter().map(|p| finish(&p.trace, &ctx, None).score).collect();
                    fin_s += t2.elapsed().as_secs_f64();
                    done += b;
                    // 1 回が 1 秒ほどになるようにまとめる数を変える
                    b = ((b as f64 * 1.0 / g.max(1e-3)) as usize).clamp(256, packer.capacity());
                }
                let el = t.elapsed().as_secs_f64();
                println!(
                    "GPU（{}）: {:>10.0} 通り/秒（GPU で置く {:.0}% ・ CPU で評価 {:.0}%・最後のまとめ数 {}）",
                    if with_parent { "入れ替えた位置から先だけ置き直す" } else { "毎回最初から置く" },
                    done as f64 / el,
                    gpu_s / el * 100.0,
                    fin_s / el * 100.0,
                    b
                );
            }
        }
    }
}

// ---- サイトから立ち上げられるようにする ----

/// 入れる場所（%LOCALAPPDATA%\box-packing）。target の exe を直接登録すると、動いているあいだビルドで上書きできないので、写して使う
fn install_dir() -> std::path::PathBuf {
    let base = std::env::var_os("LOCALAPPDATA").expect("LOCALAPPDATA がありません");
    std::path::PathBuf::from(base).join("box-packing")
}

/// 動いているネイティブ版に終わってもらう（写す前に。動いていなければ何もしない）
fn quit_running() {
    use std::io::{Read, Write};
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], 8787));
    if let Ok(mut s) = std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(300)) {
        let _ = s.write_all(b"POST /api/quit HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        let mut sink = Vec::new();
        let _ = s.read_to_end(&mut sink);
        std::thread::sleep(Duration::from_millis(800));
    }
}

fn reg(args: &[&str]) {
    // reg の「この操作を正しく終了しました。」（シフト JIS で文字化けする）は出さない
    let ok = std::process::Command::new("reg")
        .args(args)
        .stdout(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !ok {
        eprintln!("レジストリに書けませんでした: reg {}", args.join(" "));
        std::process::exit(1);
    }
}

/// box-packing.exe と起動役を %LOCALAPPDATA%\box-packing に写し、box-packing:// を自分のユーザーにだけ登録する
/// （HKCU。管理者の権限は要らない）。ビルドし直したら、もう一度 install する
fn cmd_install() {
    let me = std::env::current_exe().expect("自分の場所が分かりません");
    let from = me.parent().unwrap();
    let to = install_dir();
    quit_running();
    std::fs::create_dir_all(&to).expect("入れる場所を作れません");
    for name in ["box-packing.exe", "box-packing-launch.exe"] {
        std::fs::copy(from.join(name), to.join(name))
            .unwrap_or_else(|e| panic!("{name} を写せません（target/release に両方ありますか）: {e}"));
    }
    let launcher = to.join("box-packing-launch.exe");
    let key = r"HKCU\Software\Classes\box-packing";
    reg(&["add", key, "/ve", "/d", "URL:box-packing", "/f"]);
    reg(&["add", key, "/v", "URL Protocol", "/d", "", "/f"]);
    let command = format!("\"{}\" \"%1\"", launcher.display());
    reg(&["add", &format!(r"{key}\shell\open\command"), "/ve", "/d", &command, "/f"]);
    println!("{} に入れて、box-packing:// を登録しました。", to.display());
    println!("サイトの箱詰めのページの「ネイティブ版を起動」から立ち上げられます（初回はブラウザーが開いてよいか聞きます）。");
}

/// install で入れたものと登録を消す
fn cmd_uninstall() {
    quit_running();
    let _ = std::process::Command::new("reg")
        .args(["delete", r"HKCU\Software\Classes\box-packing", "/f"])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
    let _ = std::fs::remove_dir_all(install_dir());
    println!("box-packing:// の登録と {} を消しました。", install_dir().display());
}

// ---- 探す ----

#[derive(Default)]
pub struct Shared {
    pub score: f64,
    ids: Vec<usize>,
    rule: Rule,
    pub version: u64,
    pub by: String,
    pub result: Option<PackResult>,
    /// 部門別のいちばん（全部の係から集める）
    pub metrics: MetricBests,
}

/// 1 回の「探す」の状態（コマンドと画面の両方から使う）
pub struct Job {
    pub shared: Mutex<Shared>,
    pub cpu_evals: AtomicU64,
    pub gpu_evals: AtomicU64,
    /// 止める（時間になったときと、画面で止めたとき）
    pub stop: AtomicBool,
    pub done: AtomicBool,
    pub started: Instant,
    pub seconds: f64,
    pub cpu_threads: AtomicU64,
    /// GPU の名前（使えないときは理由）
    pub gpu: Mutex<Option<String>>,
    /// 良くなるたびに端末に出す
    pub log: bool,
    /// この時間（秒）、いちばん良い結果も部門別のいちばんも良くならなければ止める（ブラウザーの計算係と同じ）
    pub stall: Option<f64>,
    /// 画面から最後に様子を聞かれた時刻。watch のとき、WATCH_SECS 聞かれなければ止める（ページを閉じた）
    pub last_seen: Mutex<Instant>,
    pub watch: bool,
}

/// 画面から様子を聞かれなくなってから止めるまでの秒数
pub const WATCH_SECS: f64 = 20.0;

impl Job {
    pub fn new(seconds: f64, log: bool) -> Job {
        Job {
            shared: Mutex::new(Shared { score: f64::INFINITY, ..Default::default() }),
            cpu_evals: AtomicU64::new(0),
            gpu_evals: AtomicU64::new(0),
            stop: AtomicBool::new(false),
            done: AtomicBool::new(false),
            started: Instant::now(),
            seconds,
            cpu_threads: AtomicU64::new(0),
            gpu: Mutex::new(None),
            log,
            stall: None,
            last_seen: Mutex::new(Instant::now()),
            watch: false,
        }
    }
}

pub struct SolveOptions {
    pub seconds: f64,
    pub threads: usize,
    pub gpu: bool,
    pub batch: usize,
    /// いつもの筋（いちばん良い並べ方を取り込む CPU の係）の数。None なら全部（別の筋は使わない）。
    /// 2026-11-16 に 49 個・30 秒・種 4 つで比べたら、別の筋を混ぜると平均で悪くなった（全部 1.864・4 分の 1 1.928・1 本 1.928）
    pub main_threads: Option<usize>,
}

/// 別の筋 1 本を、良くならなくなるまで（EXPLORE_STALL 秒）続ける。終わったら次の筋を始める。
/// 出発点は、いちばん良い並べ方を大きく崩したもの（強さはでたらめ）か、FRESH_EVERY 回に 1 回は新しい並べ方
const EXPLORE_STALL: f64 = 4.0;
/// 別の筋 1 本の長さの上限（秒）
const EXPLORE_MAX: f64 = 30.0;

fn explore_line(
    ctx: &Ctx,
    slot: usize,
    started: Instant,
    shared: &Mutex<Shared>,
    cpu_evals: &AtomicU64,
    stop: &AtomicBool,
    publish: &(dyn Fn(f64, &[usize], &Rule, &str, &PackResult) + Sync),
) {
    let mut rand = Rand::new(ctx.input.seed.wrapping_mul(131).wrapping_add(slot as i64 * 7919));
    let by = format!("CPU {slot}・別の筋");
    let mut n: u64 = 0;
    while !stop.load(Ordering::Relaxed) {
        n += 1;
        let mut input = ctx.input.clone();
        input.explore = true;
        input.searched_ms = Some(input.searched_ms.unwrap_or(0.0) + started.elapsed().as_secs_f64() * 1000.0);
        let best = {
            let sh = shared.lock().unwrap();
            (sh.ids.clone(), sh.rule)
        };
        if n % FRESH_EVERY == 0 || best.0.is_empty() {
            input.start_genome = None;
            input.start_order = None;
            input.shake = None;
        } else {
            input.start_genome = Some(genome_of(&best.0, &best.1, &ctx.table));
            input.shake = Some(rand.below_pub((SHAKE_MAX + 1) as usize) as f64);
        }
        let line_ctx = Ctx::new(&input);
        let mut s = Search::new(&line_ctx, input.seed + slot as i64 * 1009 + n as i64 * 104_729);
        let line_started = Instant::now();
        let mut last_gain = Instant::now();
        let mut last = 0u64;
        let mut metric_seen = 0u64;
        while !stop.load(Ordering::Relaxed) {
            if s.step() {
                last_gain = Instant::now();
                publish(s.best.score, &s.best_ids, &s.best_rule, &by, &s.best);
            }
            if s.tried - last >= 64 {
                cpu_evals.fetch_add(s.tried - last, Ordering::Relaxed);
                last = s.tried;
                if s.metrics.total_version() != metric_seen {
                    metric_seen = s.metrics.total_version();
                    shared.lock().unwrap().metrics.merge(&s.metrics);
                }
                if last_gain.elapsed().as_secs_f64() >= EXPLORE_STALL
                    || line_started.elapsed().as_secs_f64() >= EXPLORE_MAX
                {
                    break;
                }
            }
        }
    }
}

/// CPU の係（と GPU の係）で、時間まで（または止められるまで）探す
pub fn run_solve(input: &PackInput, opt: &SolveOptions, job: &Job) {
    let ctx = Ctx::new(input);
    let deadline = job.started + Duration::from_secs_f64(opt.seconds);
    let started = job.started;
    let plans = start_plans(input, &ctx.table);
    let (_, first) = evaluate_ids(&ctx, &plans[0].ids, &plans[0].rule);
    {
        let mut s = job.shared.lock().unwrap();
        s.score = first.score;
        s.ids = plans[0].ids.clone();
        s.rule = plans[0].rule;
        s.version += 1;
        s.by = "最初".into();
        s.metrics.see(&first);
        s.result = Some(first);
    }
    let shared = &job.shared;
    let cpu_evals = &job.cpu_evals;
    let gpu_evals = &job.gpu_evals;
    let stop = &job.stop;
    let cpu_threads = if opt.gpu { opt.threads.saturating_sub(2).max(1) } else { opt.threads };
    job.cpu_threads.store(cpu_threads as u64, Ordering::Relaxed);
    let main_threads = opt.main_threads.unwrap_or(cpu_threads).clamp(1, cpu_threads);
    if job.log {
        println!(
            "箱 {} 個・CPU の係 {} スレッド（いつもの筋 {}・別の筋 {}）{}・{} 秒",
            ctx.table.box_count,
            cpu_threads,
            main_threads,
            cpu_threads - main_threads,
            if opt.gpu { "・GPU の係 1 つ" } else { "" },
            opt.seconds
        );
    }

    let publish = |score: f64, ids: &[usize], rule: &Rule, by: &str, result: &PackResult| {
        let mut s = shared.lock().unwrap();
        if score < s.score - 1e-9 {
            s.score = score;
            s.ids = ids.to_vec();
            s.rule = *rule;
            s.version += 1;
            s.by = by.to_string();
            s.result = Some(result.clone());
            if job.log {
                println!(
                    "{:>6.1} 秒  点数 {:.4}  高さ {} mm  整い {:.3}  充填率 {:.1}%  （{}）",
                    started.elapsed().as_secs_f64(),
                    score,
                    result.height,
                    result.tidiness,
                    result.fill_rate * 100.0,
                    by
                );
            }
        }
    };

    std::thread::scope(|sc| {
        for i in 0..cpu_threads {
            let ctx = &ctx;
            let publish = &publish;
            // 最初の何本かは、いちばん良い並べ方を取り込みながら深く探す「いつもの筋」。
            // 残りは、ほかの係とやり取りせずに別の場所を探す「別の筋」（explore_line）
            if i >= main_threads {
                sc.spawn(move || explore_line(ctx, i, started, shared, cpu_evals, stop, publish));
                continue;
            }
            sc.spawn(move || {
                let mut s = Search::new(ctx, ctx.input.seed + i as i64 * 1009);
                let mut seen = 0u64;
                let mut last = 0u64;
                let mut metric_seen = 0u64;
                let by = format!("CPU {i}");
                while !stop.load(Ordering::Relaxed) {
                    if s.step() {
                        publish(s.best.score, &s.best_ids, &s.best_rule, &by, &s.best);
                    }
                    if s.tried - last >= 64 {
                        cpu_evals.fetch_add(s.tried - last, Ordering::Relaxed);
                        last = s.tried;
                        let take = {
                            let mut sh = shared.lock().unwrap();
                            if s.metrics.total_version() != metric_seen {
                                metric_seen = s.metrics.total_version();
                                sh.metrics.merge(&s.metrics);
                            }
                            if sh.version != seen && sh.score < s.best.score - 1e-9 {
                                seen = sh.version;
                                Some((sh.ids.clone(), sh.rule))
                            } else {
                                None
                            }
                        };
                        if let Some((ids, rule)) = take {
                            s.adopt(ids, rule);
                        }
                    }
                }
            });
        }
        if opt.gpu {
            let ctx = &ctx;
            let publish = &publish;
            let cap = opt.batch;
            sc.spawn(move || {
                if let Err(e) = gpu_search(ctx, cap, shared, gpu_evals, publish, stop, &job.gpu) {
                    eprintln!("GPU の係: {e}");
                    *job.gpu.lock().unwrap() = Some(format!("使えません（{e}）"));
                }
            });
        }
        let mut last_print = Instant::now();
        let mut last_change = Instant::now();
        let mut last_mark = 0u64;
        while Instant::now() < deadline && !stop.load(Ordering::Relaxed) {
            std::thread::sleep(Duration::from_millis(50));
            {
                let sh = shared.lock().unwrap();
                let mark = sh.version + sh.metrics.total_version();
                if mark != last_mark {
                    last_mark = mark;
                    last_change = Instant::now();
                }
            }
            if job.stall.is_some_and(|st| last_change.elapsed().as_secs_f64() > st) {
                break;
            }
            if job.watch && job.last_seen.lock().unwrap().elapsed().as_secs_f64() > WATCH_SECS {
                break;
            }
            if job.log && last_print.elapsed().as_secs_f64() >= 10.0 {
                last_print = Instant::now();
                let el = started.elapsed().as_secs_f64();
                println!(
                    "{:>6.1} 秒  …試した数 CPU {}・GPU {}（{:.0} 通り/秒）",
                    el,
                    cpu_evals.load(Ordering::Relaxed),
                    gpu_evals.load(Ordering::Relaxed),
                    (cpu_evals.load(Ordering::Relaxed) + gpu_evals.load(Ordering::Relaxed)) as f64 / el
                );
            }
        }
        stop.store(true, Ordering::Relaxed);
    });
    job.done.store(true, Ordering::Relaxed);
}

fn cmd_solve(args: &Args) {
    let input = read_input(&args.pos[1]);
    let job = Job::new(args.seconds, true);
    let opt = SolveOptions { seconds: args.seconds, threads: args.threads, gpu: args.gpu, batch: args.batch, main_threads: args.main_threads };
    run_solve(&input, &opt, &job);
    let el = job.started.elapsed().as_secs_f64();
    let (c, g) = (job.cpu_evals.load(Ordering::Relaxed), job.gpu_evals.load(Ordering::Relaxed));
    let s = job.shared.into_inner().unwrap();
    let r = s.result.unwrap();
    println!(
        "終了: 点数 {:.4}・高さ {} mm・整い {:.3}・充填率 {:.1}%（最後に良くしたのは {}）。試した数 CPU {c}・GPU {g}（{:.0} 通り/秒）",
        r.score,
        r.height,
        r.tidiness,
        r.fill_rate * 100.0,
        s.by,
        (c + g) as f64 / el
    );
    if let Some(out) = &args.out {
        std::fs::write(out, serde_json::to_string_pretty(&r).unwrap()).unwrap();
        println!("結果を {out} に書きました");
    }
}

struct Elite {
    ids: Vec<usize>,
    rule: Rule,
    score: f64,
    trace: Trace,
}

const ELITES: usize = 12;

/// GPU の係: 良い並べ方（エリート）を少しずつ崩した数千通りを GPU でまとめて置き、全部を正式に評価する
fn gpu_search(
    ctx: &Ctx,
    cap: usize,
    shared: &Mutex<Shared>,
    evals: &AtomicU64,
    publish: &(dyn Fn(f64, &[usize], &Rule, &str, &PackResult) + Sync),
    stop: &AtomicBool,
    status: &Mutex<Option<String>>,
) -> Result<(), String> {
    let table = &ctx.table;
    let input = ctx.input;
    let packer = gpu::GpuPacker::new(ctx, cap)?;
    *status.lock().unwrap() = Some(packer.gpu.name.clone());
    let started = Instant::now();
    let mut rand = Rand::new(input.seed.wrapping_mul(31).wrapping_add(17));
    let mut stats = KindStats::new();
    let mut elites: Vec<Elite> = start_plans(input, table)
        .into_iter()
        .map(|p| {
            let (trace, r) = evaluate_ids(ctx, &p.ids, &p.rule);
            Elite { ids: p.ids, rule: p.rule, score: r.score, trace }
        })
        .collect();
    let mut best_seen = f64::INFINITY;
    let mut kicks: u64 = 0;
    let insert = |elites: &mut Vec<Elite>, e: Elite| -> bool {
        if elites.iter().any(|x| (x.score - e.score).abs() < 1e-9) {
            return false;
        }
        if elites.len() >= ELITES && e.score >= elites[elites.len() - 1].score {
            return false;
        }
        let pos = elites.iter().position(|x| x.score > e.score).unwrap_or(elites.len());
        elites.insert(pos, e);
        elites.truncate(ELITES);
        pos == 0
    };
    elites.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap());
    let mut dedup: Vec<Elite> = Vec::new();
    for e in elites {
        insert(&mut dedup, e);
    }
    let mut elites = dedup;
    let mut seen = 0u64;
    let mut batch = 2048usize.min(cap);
    let mut batches = 0u64;
    let mut last_improve = 0u64;
    let mut mismatch = 0u64;
    let mut checked = 0u64;
    while !stop.load(Ordering::Relaxed) {
        // ほかの係の良い並べ方を取り込む
        let take = {
            let sh = shared.lock().unwrap();
            if sh.version != seen {
                seen = sh.version;
                Some((sh.ids.clone(), sh.rule))
            } else {
                None
            }
        };
        if let Some((ids, rule)) = take {
            let (trace, r) = evaluate_ids(ctx, &ids, &rule);
            insert(&mut elites, Elite { ids, rule, score: r.score, trace });
        }
        let frozen = rules_frozen(input, started.elapsed().as_secs_f64() * 1000.0);
        let weights = with_rule_phase(stats.weights(), frozen);
        let parents: Vec<&Trace> = elites.iter().map(|e| &e.trace).collect();
        packer.set_parents(&parents)?;
        let n = elites.len();
        let mut kinds = Vec::with_capacity(batch);
        let cands: Vec<gpu::Cand> = (0..batch)
            .map(|_| {
                // 半分はいちばん良い並べ方から、残りはほかのエリートから
                let pi = if rand.next() < 0.5 { 0 } else { rand.below_pub(n) };
                let e = &elites[pi];
                let other = if n > 1 && rand.next() < 0.3 { Some(elites[rand.below_pub(n)].ids.as_slice()) } else { None };
                let m = mutate(&e.ids, &e.rule, &mut rand, table, other, &weights);
                kinds.push((m.kind, pi));
                let start = if m.rule != e.rule { 0 } else { m.start };
                gpu::Cand { ids: m.ids, rule: m.rule, parent: pi as i32, start }
            })
            .collect();
        let t = Instant::now();
        let packed = packer.run(&cands, table)?;
        let g = t.elapsed().as_secs_f64();
        let results: Vec<PackResult> = packed.par_iter().map(|p| finish(&p.trace, ctx, None)).collect();
        let scores: Vec<f64> = results.iter().map(|r| r.score).collect();
        // 部門別のいちばん（GPU の結果には並べ方が付いていないので、良くなったものにだけ付ける）
        let mut gm = { shared.lock().unwrap().metrics.clone() };
        let before = gm.total_version();
        for (i, r) in results.iter().enumerate() {
            if gm.see(r) {
                let g = genome_of(&cands[i].ids, &cands[i].rule, table);
                for m in gm.best.iter_mut().flatten() {
                    if m.genome.is_none() {
                        m.genome = Some(g.clone());
                    }
                }
            }
        }
        drop(results);
        if gm.total_version() != before {
            shared.lock().unwrap().metrics.merge(&gm);
        }
        evals.fetch_add(batch as u64, Ordering::Relaxed);
        batches += 1;
        for (i, &(kind, pi)) in kinds.iter().enumerate() {
            stats.record(kind, 1.0, if scores[i] < elites[pi].score - 1e-9 { 1.0 } else { 0.0 });
        }
        // 上位をエリートに入れる（CPU で置き直して、GPU と同じ置き方かも確かめる）
        let mut order: Vec<usize> = (0..batch).collect();
        order.sort_by(|&a, &b| scores[a].partial_cmp(&scores[b]).unwrap());
        let worst = if elites.len() >= ELITES { elites[elites.len() - 1].score } else { f64::INFINITY };
        for &i in order.iter().take(8) {
            if scores[i] >= worst {
                break;
            }
            let c = &cands[i];
            let (trace, r) = evaluate_ids(ctx, &c.ids, &c.rule);
            checked += 1;
            if trace.placed != packed[i].trace.placed || (r.score - scores[i]).abs() > 1e-9 {
                mismatch += 1;
                eprintln!("GPU と CPU の置き方が食い違いました（{mismatch} / {checked}）");
            }
            let score = r.score;
            if insert(&mut elites, Elite { ids: c.ids.clone(), rule: c.rule, score, trace }) {
                last_improve = batches;
                publish(score, &c.ids, &c.rule, "GPU", &r);
            }
        }
        // いちばん良い点数が良くなったら、崩す強さを最初に戻す
        if elites[0].score < best_seen - 1e-9 {
            best_seen = elites[0].score;
            kicks = 0;
        }
        // しばらく良くならなければ、エリートの後ろ半分を、いちばん良い並べ方を大きく崩したもの
        // （続けて駄目なほど広く崩し、一巡したら狭く戻る）と、新しい並べ方（FRESH_EVERY 個に 1 個）に入れ替える
        if batches - last_improve >= 6 && elites.len() > 2 {
            last_improve = batches;
            let level = shake_level_of(kicks);
            kicks += 1;
            let keep = elites.len() / 2;
            elites.truncate(keep);
            for k in 0..(ELITES - keep) as u64 {
                let p = if (k + 1) % FRESH_EVERY == 0 {
                    fresh_plan(input, table, &mut rand, if frozen { Some(&elites[0].rule) } else { None })
                } else {
                    shake_plan(&elites[0].ids, &elites[0].rule, &mut rand, frozen, level)
                };
                let (trace, r) = evaluate_ids(ctx, &p.ids, &p.rule);
                elites.push(Elite { ids: p.ids, rule: p.rule, score: r.score, trace });
            }
            elites.sort_by(|a, b| a.score.partial_cmp(&b.score).unwrap());
        }
        // 1 回が 1 秒ほどになるようにまとめる数を変える
        batch = ((batch as f64 / g.max(1e-3)) as usize).clamp(256, cap);
    }
    eprintln!("GPU の係: {batches} 回・置き方の確かめ {checked} 回のうち食い違い {mismatch} 回");
    Ok(())
}

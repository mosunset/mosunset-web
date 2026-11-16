//! 入力と結果の形（TS の box-packing-solver.ts の PackInput・PackResult と同じ JSON）

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Deserialize, Serialize, Default)]
pub struct Walls {
    pub back: bool,
    pub left: bool,
    pub right: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BoxSpec {
    pub tag: String,
    pub x: i64,
    pub y: i64,
    pub z: i64,
    pub count: i64,
    pub can_lay_down: bool,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Objective {
    Height,
    Floor,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tidy {
    pub weight: f64,
    pub group: bool,
    pub flat: bool,
    pub big_bottom: bool,
    pub upright: bool,
    pub even: bool,
    pub big_wall: bool,
    pub front: bool,
    pub front_flat: bool,
    pub near: bool,
    pub balance: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct Genome {
    pub seq: Vec<i64>,
    pub rule: Vec<f64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackInput {
    pub floor_x: i64,
    pub floor_y: i64,
    pub walls: Walls,
    pub boxes: Vec<BoxSpec>,
    pub gap: i64,
    pub edge_gap: i64,
    pub support_percent: i64,
    pub objective: Objective,
    pub wall_bias: f64,
    pub tidy: Tidy,
    #[serde(default)]
    pub seed: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_order: Option<Vec<i64>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_genome: Option<Genome>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub searched_ms: Option<f64>,
    /// 別の筋として探す（TS の explore）
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub explore: bool,
    /// explore のとき、start_genome をこの強さで大きく崩してから探す（TS の shake）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shake: Option<f64>,
    /// 計算方法（"order" / "columns"）。いまは並べ順の方式だけ
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
}

/// 面の名前（0: 上 1: 下 2: 左 3: 右 4: 前 5: 後）
pub type Face = u8;
pub const UP: Face = 0;
pub const FRONT: Face = 4;
pub const FACE_NAMES: [&str; 6] = ["上", "下", "左", "右", "前", "後"];

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    #[serde(rename = "type")]
    pub ty: usize,
    pub x: i64,
    pub y: i64,
    pub z: i64,
    pub w: i64,
    pub d: i64,
    pub h: i64,
    #[serde(serialize_with = "faces_ser")]
    pub faces: [Face; 6],
    pub laid_down: bool,
}

fn faces_ser<S: serde::Serializer>(f: &[Face; 6], s: S) -> Result<S::Ok, S::Error> {
    use serde::ser::SerializeSeq;
    let mut seq = s.serialize_seq(Some(6))?;
    for x in f {
        seq.serialize_element(FACE_NAMES[*x as usize])?;
    }
    seq.end()
}

#[derive(Clone, Debug, Serialize)]
pub struct Unplaced {
    #[serde(rename = "type")]
    pub ty: usize,
    pub count: i64,
    pub reason: &'static str,
}

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Cog {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackResult {
    pub placements: Vec<Placement>,
    pub unplaced: Vec<Unplaced>,
    pub height: i64,
    pub fill_rate: f64,
    pub floor_coverage: f64,
    pub cog: Option<Cog>,
    pub tidiness: f64,
    pub score: f64,
    pub genome: Option<Genome>,
}

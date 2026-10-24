use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Anchor {
    pub id: String,
    pub node_type: String,
    pub label: String,
    pub x: f32,
    pub y: f32,
    pub gravity_weight: f32,
    pub competitor_price_cents: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Persona {
    pub id: String,
    pub name: String,
    pub weight: f64,
    pub wallet_min_cents: i64,
    pub wallet_max_cents: i64,
    pub max_wait_sec: u32,
    pub category_affinity: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoothSpec {
    pub booth_id: String,
    pub name: String,
    pub x: f32,
    pub y: f32,
    pub item_price_cents: i64,
    pub unit_cogs_cents: i64,
    pub prep_time_sec: u32,
    pub parallel_servers: u32,
    pub inventory_units: u32,
    pub booth_fee_cents: i64,
    pub staff_and_equipment_cents: i64,
    pub organizer_cut_pct: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct World {
    pub schema_version: String,
    pub config_hash: String,
    pub evidence: serde_json::Value,
    pub map_mode: String,
    pub floorplan_image_url: Option<String>,
    pub total_simulated_attendees: u32,
    pub anchors: Vec<Anchor>,
    pub vendor_booth: BoothSpec,
    pub personas: Vec<Persona>,
}

impl World {
    pub fn parse(json: &str) -> Result<Self, String> {
        if json.len() > 2_000_000 {
            return Err("World exceeds input limit".into());
        }
        let world: Self = serde_json::from_str(json).map_err(|e| e.to_string())?;
        world.validate()?;
        Ok(world)
    }

    pub fn duration_sec(&self) -> u32 {
        (self.evidence["durationHours"].as_f64().unwrap_or(0.0) * 3600.0).round() as u32
    }

    pub fn validate(&self) -> Result<(), String> {
        let b = &self.vendor_booth;
        let money = |v: i64| (0..=100_000_000).contains(&v);
        let point = |x: f32, y: f32| (0.0..=1000.0).contains(&x) && (0.0..=1000.0).contains(&y);
        if self.schema_version != "v1"
            || !(50..=1000).contains(&self.total_simulated_attendees)
            || !(1..=43200).contains(&self.duration_sec())
            || !(1..=3600).contains(&b.prep_time_sec)
            || !(1..=50).contains(&b.parallel_servers)
            || !(1..=100_000).contains(&b.inventory_units)
            || !point(b.x, b.y)
            || !(0.0..=100.0).contains(&b.organizer_cut_pct)
            || ![
                b.item_price_cents,
                b.unit_cogs_cents,
                b.booth_fee_cents,
                b.staff_and_equipment_cents,
            ]
            .into_iter()
            .all(money)
        {
            return Err("Invalid world, timing, inventory or money bounds".into());
        }
        if self.personas.len() != 3
            || (self.personas.iter().map(|p| p.weight).sum::<f64>() - 1.0).abs() > 1e-6
            || self.personas.iter().any(|p| {
                !(0.0..=1.0).contains(&p.weight)
                    || !(0.0..=1.0).contains(&p.category_affinity)
                    || !money(p.wallet_min_cents)
                    || !money(p.wallet_max_cents)
                    || p.wallet_min_cents > p.wallet_max_cents
                    || !(1..=3600).contains(&p.max_wait_sec)
            })
        {
            return Err("Invalid personas".into());
        }
        if self.anchors.len() > 32
            || ["ENTRANCE", "STAGE", "EXIT"]
                .iter()
                .any(|kind| !self.anchors.iter().any(|a| a.node_type == *kind))
            || self
                .anchors
                .iter()
                .any(|a| !point(a.x, a.y) || !(0.0..=10.0).contains(&a.gravity_weight))
        {
            return Err("Invalid anchors".into());
        }
        let ids: Vec<&str> = self
            .anchors
            .iter()
            .map(|a| a.id.as_str())
            .chain(self.personas.iter().map(|p| p.id.as_str()))
            .chain(std::iter::once(b.booth_id.as_str()))
            .collect();
        if ids.iter().any(|id| {
            id.is_empty()
                || id.len() > 80
                || !id
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
        }) || ids.iter().collect::<HashSet<_>>().len() != ids.len()
        {
            return Err("Invalid or duplicate IDs".into());
        }
        Ok(())
    }
}

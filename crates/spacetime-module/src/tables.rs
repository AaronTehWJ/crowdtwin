use crate::engine::{batch, Engine};
use crate::world::World;
use serde::{Deserialize, Serialize};
use spacetimedb::{Identity, ReducerContext, Table};

// The publishing identity alone can mutate. Browser connections are read-only.
#[spacetimedb::table(name = authority)]
pub struct Authority {
    #[primary_key]
    pub id: u8,
    pub identity: Identity,
}

// One private snapshot preserves queue order and sub-tick service progress exactly.
#[spacetimedb::table(name = engine_snapshot)]
pub struct EngineSnapshot {
    #[primary_key]
    pub run_id: String,
    pub json: String,
}

#[spacetimedb::table(name = run_state, public)]
pub struct RunState {
    #[primary_key]
    pub run_id: String,
    pub config_hash: String,
    pub seed: u64,
    pub sim_time_sec: u32,
    pub duration_sec: u32,
    pub status: String,
    pub provenance: String,
}

#[spacetimedb::table(name = anchor_node, public)]
#[derive(Serialize, Deserialize)]
pub struct AnchorNodeData {
    #[primary_key]
    pub id: String,
    #[index(btree)]
    pub run_id: String,
    pub local_id: String,
    pub node_type: String,
    pub label: String,
    pub x: f32,
    pub y: f32,
    pub gravity_weight: f32,
}

#[spacetimedb::table(name = booth, public)]
#[derive(Serialize, Deserialize)]
pub struct BoothData {
    #[primary_key]
    pub booth_id: String,
    #[index(btree)]
    pub run_id: String,
    pub local_booth_id: String,
    pub name: String,
    pub x: f32,
    pub y: f32,
    pub item_price_cents: i64,
    pub unit_cogs_cents: i64,
    pub prep_time_sec: u32,
    pub parallel_servers: u32,
    pub booth_fee_cents: i64,
    pub staff_equipment_cents: i64,
    pub organizer_cut_pct: f64,
    pub initial_inventory_units: u32,
    pub total_inventory_outlay_cents: i64,
    pub remaining_inventory: u32,
    pub current_queue_len: u32,
    pub units_sold: u32,
    pub gross_revenue_cents: i64,
    pub consumed_cogs_cents: i64,
    pub organizer_fee_cents: i64,
    pub net_profit_cents: i64,
    pub cash_balance_cents: i64,
    pub balked_queue_count: u32,
    pub balked_price_count: u32,
    pub abandoned_queue_count: u32,
    pub low_affinity_count: u32,
    pub stockout_count: u32,
}

#[spacetimedb::table(name = customer_agent, public)]
#[derive(Serialize, Deserialize)]
pub struct CustomerAgentData {
    #[primary_key]
    pub row_id: String,
    #[index(btree)]
    pub run_id: String,
    pub agent_id: u32,
    pub archetype: String,
    pub x: f32,
    pub y: f32,
    pub target_x: f32,
    pub target_y: f32,
    pub wallet_cents: i64,
    pub initial_wallet_cents: i64,
    pub hunger: u32,
    pub max_wait_sec: u32,
    pub affinity: f32,
    pub state: String,
    pub arrival_sec: u32,
    pub food_seek_sec: u32,
    pub queue_join_sec: u32,
    pub service_end_sec: u32,
    pub decision_sec: u32,
    pub estimated_wait_sec: u32,
    pub last_decision_id: String,
    pub thought_bubble: String,
}

#[spacetimedb::table(name = decision_event, public)]
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecisionEventData {
    #[primary_key]
    pub event_id: String,
    #[index(btree)]
    pub run_id: String,
    pub sim_time_sec: u32,
    pub agent_id: u32,
    pub archetype_name: String,
    pub booth_id: String,
    pub reason: String,
    pub agent_wallet_cents: i64,
    pub agent_hunger: u32,
    pub agent_patience_sec: u32,
    pub observed_price_cents: i64,
    pub estimated_wait_sec: u32,
    pub remaining_stock: u32,
}

#[spacetimedb::table(name = scenario_result, public)]
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioResultData {
    #[primary_key]
    pub id: String,
    #[index(btree)]
    pub run_id: String,
    pub scenario_name: String,
    pub turnout_count: u32,
    pub seeds_run: u32,
    pub profitable_runs: u32,
    pub median_revenue_cents: i64,
    pub median_profit_cents: i64,
    pub downside_p10_profit_cents: i64,
    pub median_balked_queue: u32,
    pub median_balked_price: u32,
}

#[spacetimedb::reducer(init)]
pub fn bootstrap(ctx: &ReducerContext) {
    ctx.db.authority().insert(Authority {
        id: 0,
        identity: ctx.sender,
    });
}

fn authorize(ctx: &ReducerContext) -> Result<(), String> {
    if ctx
        .db
        .authority()
        .id()
        .find(0)
        .is_some_and(|a| a.identity == ctx.sender)
    {
        Ok(())
    } else {
        Err("Only the local orchestration identity may mutate simulations".into())
    }
}

#[spacetimedb::reducer]
pub fn init_world(
    ctx: &ReducerContext,
    run_id: String,
    world_spec_json: String,
    seed: u64,
) -> Result<(), String> {
    authorize(ctx)?;
    if run_id.is_empty()
        || run_id.len() > 80
        || !run_id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("Invalid run ID".into());
    }
    let world = World::parse(&world_spec_json)?;
    if ctx.db.run_state().run_id().find(&run_id).is_none() && ctx.db.run_state().count() >= 100 {
        return Err("Local limit of 100 runs reached".into());
    }
    ctx.db.anchor_node().run_id().delete(&run_id);
    ctx.db.booth().run_id().delete(&run_id);
    ctx.db.customer_agent().run_id().delete(&run_id);
    ctx.db.decision_event().run_id().delete(&run_id);
    ctx.db.scenario_result().run_id().delete(&run_id);
    ctx.db.run_state().run_id().delete(&run_id);
    ctx.db.engine_snapshot().run_id().delete(&run_id);
    for a in &world.anchors {
        ctx.db.anchor_node().insert(AnchorNodeRow {
            id: format!("{run_id}:{}", a.id),
            run_id: run_id.clone(),
            local_id: a.id.clone(),
            node_type: a.node_type.clone(),
            label: a.label.clone(),
            x: a.x,
            y: a.y,
            gravity_weight: a.gravity_weight,
        });
    }
    persist(ctx, &Engine::new(&run_id, world, seed))
}

fn load(ctx: &ReducerContext, run_id: &String) -> Result<Engine, String> {
    let snapshot = ctx
        .db
        .engine_snapshot()
        .run_id()
        .find(run_id)
        .ok_or("Unknown run")?;
    serde_json::from_str(&snapshot.json).map_err(|e| e.to_string())
}

#[spacetimedb::reducer]
pub fn step_simulation(ctx: &ReducerContext, run_id: String, steps: u32) -> Result<(), String> {
    authorize(ctx)?;
    if !(1..=8640).contains(&steps) {
        return Err("Steps must be 1..8640".into());
    }
    let mut engine = load(ctx, &run_id)?;
    engine.step(steps);
    persist(ctx, &engine)
}

#[spacetimedb::reducer]
pub fn run_batch_scenarios(
    ctx: &ReducerContext,
    run_id: String,
    world_spec_json: String,
) -> Result<(), String> {
    authorize(ctx)?;
    let engine = load(ctx, &run_id)?;
    let world = World::parse(&world_spec_json)?;
    if serde_json::to_value(&world).unwrap() != serde_json::to_value(&engine.world).unwrap() {
        return Err("Scenario world must equal the initialized approved world".into());
    }
    ctx.db.scenario_result().run_id().delete(&run_id);
    for scenario in batch(&world) {
        let mut value = serde_json::to_value(&scenario).unwrap();
        value["id"] = format!("{run_id}:{}", scenario.scenario_name).into();
        value["runId"] = run_id.clone().into();
        ctx.db
            .scenario_result()
            .insert(serde_json::from_value::<ScenarioResultRow>(value).map_err(|e| e.to_string())?);
    }
    Ok(())
}

fn persist(ctx: &ReducerContext, e: &Engine) -> Result<(), String> {
    let run_id = &e.run_id;
    let state = RunState {
        run_id: run_id.clone(),
        config_hash: e.world.config_hash.clone(),
        seed: e.seed,
        sim_time_sec: e.sim_time_sec,
        duration_sec: e.world.duration_sec(),
        status: if e.sim_time_sec >= e.world.duration_sec() {
            "COMPLETED"
        } else if e.sim_time_sec == 0 {
            "READY"
        } else {
            "PAUSED"
        }
        .into(),
        provenance: e.world.evidence["provenance"]
            .as_str()
            .unwrap_or("MANUAL")
            .into(),
    };
    if ctx.db.run_state().run_id().find(run_id).is_some() {
        ctx.db.run_state().run_id().update(state);
    } else {
        ctx.db.run_state().insert(state);
    }
    let b = &e.world.vendor_booth;
    let mut value = serde_json::to_value(&e.accounts).unwrap();
    for (key, v) in serde_json::json!({
        "booth_id": format!("{run_id}:{}", b.booth_id), "run_id": run_id, "local_booth_id": b.booth_id,
        "name": b.name, "x": b.x, "y": b.y, "item_price_cents": b.item_price_cents,
        "unit_cogs_cents": b.unit_cogs_cents, "prep_time_sec": b.prep_time_sec,
        "parallel_servers": b.parallel_servers, "booth_fee_cents": b.booth_fee_cents,
        "staff_equipment_cents": b.staff_and_equipment_cents, "organizer_cut_pct": b.organizer_cut_pct
    }).as_object().unwrap() { value[key] = v.clone(); }
    let booth: BoothRow = serde_json::from_value(value).map_err(|e| e.to_string())?;
    if ctx.db.booth().booth_id().find(&booth.booth_id).is_some() {
        ctx.db.booth().booth_id().update(booth);
    } else {
        ctx.db.booth().insert(booth);
    }
    for a in &e.agents {
        let mut value = serde_json::to_value(a).unwrap();
        value["row_id"] = format!("{run_id}:{}", a.agent_id).into();
        value["run_id"] = run_id.clone().into();
        let agent: CustomerAgentRow = serde_json::from_value(value).map_err(|e| e.to_string())?;
        if ctx
            .db
            .customer_agent()
            .row_id()
            .find(&agent.row_id)
            .is_some()
        {
            ctx.db.customer_agent().row_id().update(agent);
        } else {
            ctx.db.customer_agent().insert(agent);
        }
    }
    for d in &e.decisions {
        if ctx
            .db
            .decision_event()
            .event_id()
            .find(&d.event_id)
            .is_none()
        {
            ctx.db.decision_event().insert(
                serde_json::from_value::<DecisionEventRow>(serde_json::to_value(d).unwrap())
                    .map_err(|e| e.to_string())?,
            );
        }
    }
    let snapshot = EngineSnapshot {
        run_id: run_id.clone(),
        json: serde_json::to_string(e).map_err(|e| e.to_string())?,
    };
    if ctx.db.engine_snapshot().run_id().find(run_id).is_some() {
        ctx.db.engine_snapshot().run_id().update(snapshot);
    } else {
        ctx.db.engine_snapshot().insert(snapshot);
    }
    Ok(())
}

// Keep the specification's Rust names without colliding with generated table-row names.
pub type AnchorNodeRow = AnchorNodeData;
pub type BoothRow = BoothData;
pub type CustomerAgentRow = CustomerAgentData;
pub type DecisionEventRow = DecisionEventData;
pub type ScenarioResultRow = ScenarioResultData;

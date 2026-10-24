use crowdtwin_module::{
    engine::{batch, quantile, Accounts, Engine},
    world::World,
};

fn world() -> World {
    World::parse(include_str!("../../../fixtures/default-world-spec.json")).unwrap()
}

#[test]
fn accounting_identities_and_half_cent_rounding() {
    let mut b = world().vendor_booth;
    b.item_price_cents = 101;
    b.organizer_cut_pct = 50.0;
    let mut a = Accounts {
        units_sold: 1,
        ..Default::default()
    };
    a.update(&b);
    assert_eq!(a.organizer_fee_cents, 51);
    assert_eq!(
        a.net_profit_cents - a.cash_balance_cents,
        a.remaining_inventory as i64 * b.unit_cogs_cents
    );
    assert_eq!(
        a.gross_revenue_cents
            - a.consumed_cogs_cents
            - a.organizer_fee_cents
            - b.booth_fee_cents
            - b.staff_and_equipment_cents,
        a.net_profit_cents
    );
}

#[test]
fn chunking_and_serialized_service_progress_are_deterministic() {
    let mut all = Engine::new("test", world(), 42);
    let mut chunks = all.clone();
    all.step(960);
    for _ in 0..96 {
        chunks.step(10);
        chunks = serde_json::from_str(&serde_json::to_string(&chunks).unwrap()).unwrap();
    }
    assert_eq!(all.agents, chunks.agents);
    assert_eq!(all.accounts, chunks.accounts);
    assert_eq!(all.decisions, chunks.decisions);
    assert!(all.accounts.units_sold > 0);
}

#[test]
fn paired_traits_do_not_depend_on_booth_or_run_id() {
    let a = Engine::new("baseline", world(), 42);
    let mut w = world();
    w.vendor_booth.parallel_servers = 2;
    w.vendor_booth.x = 640.0;
    let b = Engine::new("variant", w, 42);
    assert_eq!(a.agents, b.agents);
}

#[test]
fn queue_service_does_not_round_down_prep_or_exceed_stock() {
    let mut w = world();
    w.vendor_booth.prep_time_sec = 91;
    w.vendor_booth.parallel_servers = 3;
    w.vendor_booth.inventory_units = 2;
    let mut engine = Engine::new("queue", w, 1);
    for a in engine.agents.iter_mut().take(5) {
        a.state = "QUEUING".into();
        a.queue_join_sec = 0;
        a.max_wait_sec = 300;
    }
    engine.queue = vec![0, 1, 2, 3, 4];
    engine.step(3);
    assert_eq!(engine.accounts.units_sold, 0);
    engine.step(1);
    assert_eq!(engine.accounts.units_sold, 2);
    assert_eq!(engine.accounts.remaining_inventory, 0);
    assert!(engine
        .decisions
        .iter()
        .filter(|e| e.reason == "PURCHASED")
        .all(|e| e.sim_time_sec == 92));
    assert_eq!(engine.accounts.stockout_count, 3);
}

#[test]
fn waiting_customers_can_abandon() {
    let mut e = Engine::new("abandon", world(), 1);
    for a in e.agents.iter_mut().take(2) {
        a.state = "QUEUING".into();
        a.max_wait_sec = 10;
    }
    e.queue = vec![0, 1];
    e.step(1);
    assert_eq!(e.accounts.abandoned_queue_count, 1);
    assert_eq!(e.decisions[0].reason, "ABANDONED_QUEUE");
}

#[test]
fn batch_has_three_actual_summaries_and_nearest_rank_quantiles() {
    assert_eq!(quantile((1..=15).collect(), 1, 10), 2);
    assert_eq!(quantile((1..=15).collect(), 1, 2), 8);
    let scenarios = batch(&world());
    assert_eq!(
        scenarios
            .iter()
            .map(|s| s.turnout_count)
            .collect::<Vec<_>>(),
        [200, 400, 560]
    );
    for s in &scenarios {
        assert_eq!(s.seeds_run, 15);
        assert!(s.downside_p10_profit_cents <= s.median_profit_cents);
        assert!(s.profitable_runs <= 15);
    }
    println!("{}", serde_json::to_string_pretty(&scenarios).unwrap());
}

#[test]
fn invalid_inputs_are_rejected() {
    let mut w = world();
    w.vendor_booth.prep_time_sec = 0;
    assert!(w.validate().is_err());
    w = world();
    w.personas[0].wallet_min_cents = -1;
    assert!(w.validate().is_err());
}

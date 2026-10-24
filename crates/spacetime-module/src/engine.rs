use crate::world::{BoothSpec, World};
use serde::{Deserialize, Serialize};

pub fn splitmix64(mut x: u64) -> u64 {
    x = x.wrapping_add(0x9e3779b97f4a7c15);
    x = (x ^ (x >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94d049bb133111eb);
    x ^ (x >> 31)
}

pub fn trait_random(seed: u64, agent: u32, purpose: u64) -> u64 {
    splitmix64(seed ^ splitmix64(agent as u64) ^ splitmix64(purpose))
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Agent {
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

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct Accounts {
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

impl Accounts {
    pub fn update(&mut self, b: &BoothSpec) {
        self.initial_inventory_units = b.inventory_units;
        self.total_inventory_outlay_cents = b.inventory_units as i64 * b.unit_cogs_cents;
        self.remaining_inventory = b.inventory_units - self.units_sold;
        self.gross_revenue_cents = self.units_sold as i64 * b.item_price_cents;
        self.consumed_cogs_cents = self.units_sold as i64 * b.unit_cogs_cents;
        self.organizer_fee_cents =
            (self.gross_revenue_cents as f64 * (b.organizer_cut_pct / 100.0)).round() as i64;
        self.net_profit_cents = self.gross_revenue_cents
            - self.consumed_cogs_cents
            - self.organizer_fee_cents
            - b.booth_fee_cents
            - b.staff_and_equipment_cents;
        self.cash_balance_cents = self.gross_revenue_cents
            - self.organizer_fee_cents
            - self.total_inventory_outlay_cents
            - b.booth_fee_cents
            - b.staff_and_equipment_cents;
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Decision {
    pub event_id: String,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Engine {
    pub run_id: String,
    pub world: World,
    pub seed: u64,
    pub sim_time_sec: u32,
    pub agents: Vec<Agent>,
    pub accounts: Accounts,
    pub queue: Vec<usize>,
    pub decisions: Vec<Decision>,
}

impl Engine {
    pub fn new(run_id: &str, world: World, seed: u64) -> Self {
        let entrance = world
            .anchors
            .iter()
            .find(|a| a.node_type == "ENTRANCE")
            .unwrap();
        let destinations: Vec<_> = world
            .anchors
            .iter()
            .filter(|a| a.node_type == "STAGE" || a.node_type == "COMPETITOR")
            .collect();
        let gravity: f32 = destinations.iter().map(|a| a.gravity_weight).sum();
        let agents = (0..world.total_simulated_attendees)
            .map(|id| {
                let random = |tag| trait_random(seed, id, tag);
                let roll = random(1) as f64 / u64::MAX as f64;
                let mut cumulative = 0.0;
                let persona = world
                    .personas
                    .iter()
                    .find(|p| {
                        cumulative += p.weight;
                        roll < cumulative
                    })
                    .unwrap_or(world.personas.last().unwrap());
                let mut attraction = (random(7) as f64 / u64::MAX as f64) as f32 * gravity;
                let target = destinations
                    .iter()
                    .find(|a| {
                        attraction -= a.gravity_weight;
                        attraction <= 0.0
                    })
                    .unwrap_or(&destinations[0]);
                // Uniform arrivals during the first half of the event; no turnout rescaling.
                let arrival_sec = (random(2) % (world.duration_sec().max(60) as u64 / 2)) as u32;
                let wallet = persona.wallet_min_cents
                    + (random(3) % (persona.wallet_max_cents - persona.wallet_min_cents + 1) as u64)
                        as i64;
                Agent {
                    agent_id: id,
                    archetype: persona.name.clone(),
                    x: entrance.x + (random(8) % 25) as f32,
                    y: entrance.y,
                    target_x: target.x,
                    target_y: target.y,
                    wallet_cents: wallet,
                    initial_wallet_cents: wallet,
                    hunger: 40 + (random(4) % 61) as u32,
                    max_wait_sec: (persona.max_wait_sec * (75 + (random(5) % 51) as u32) / 100)
                        .max(1),
                    affinity: persona.category_affinity,
                    state: "ENTERING".into(),
                    arrival_sec,
                    food_seek_sec: arrival_sec + 300 + (random(6) % 900) as u32,
                    queue_join_sec: 0,
                    service_end_sec: 0,
                    decision_sec: 0,
                    estimated_wait_sec: 0,
                    last_decision_id: String::new(),
                    thought_bubble: String::new(),
                }
            })
            .collect();
        let mut accounts = Accounts::default();
        accounts.update(&world.vendor_booth);
        Self {
            run_id: run_id.into(),
            world,
            seed,
            sim_time_sec: 0,
            agents,
            accounts,
            queue: vec![],
            decisions: vec![],
        }
    }

    pub fn step(&mut self, steps: u32) {
        for _ in 0..steps {
            if self.sim_time_sec >= self.world.duration_sec() {
                break;
            }
            let end = (self.sim_time_sec + 30).min(self.world.duration_sec());
            // Service runs on a one-second clock; unfinished work persists across calls.
            for now in self.sim_time_sec + 1..=end {
                self.service(now);
            }
            self.sim_time_sec = end;
            for i in 0..self.agents.len() {
                if self.agents[i].arrival_sec > end {
                    continue;
                }
                let state = self.agents[i].state.as_str();
                if state == "QUEUING" {
                    continue;
                }
                if state == "BOUGHT" || state == "BALKED" {
                    if end < self.agents[i].decision_sec + 90 {
                        continue;
                    }
                    let exit = self
                        .world
                        .anchors
                        .iter()
                        .find(|a| a.node_type == "EXIT")
                        .unwrap();
                    self.agents[i].target_x = exit.x;
                    self.agents[i].target_y = exit.y;
                    self.agents[i].state = "LEAVING".into();
                } else if state != "LEAVING" && end >= self.agents[i].food_seek_sec {
                    self.agents[i].state = "SEEKING_FOOD".into();
                    self.agents[i].target_x = self.world.vendor_booth.x;
                    self.agents[i].target_y = self.world.vendor_booth.y;
                }
                let arrived = move_toward(&mut self.agents[i], 90.0);
                if arrived && self.agents[i].state == "ENTERING" {
                    self.agents[i].state = "AT_STAGE".into();
                }
                if arrived && self.agents[i].state == "SEEKING_FOOD" {
                    self.consider(i, end);
                }
            }
            self.fill_servers(end);
            self.accounts.current_queue_len = self.queue.len() as u32;
            self.accounts.update(&self.world.vendor_booth);
        }
    }

    fn record(&mut self, i: usize, reason: &str, now: u32) {
        let a = &mut self.agents[i];
        let event_id = format!("{}:decision:{}", self.run_id, a.agent_id);
        a.last_decision_id = event_id.clone();
        a.decision_sec = now;
        a.state = if reason == "PURCHASED" {
            "BOUGHT"
        } else {
            "BALKED"
        }
        .into();
        a.thought_bubble = match reason {
            "PURCHASED" => "Bought!",
            "BALKED_PRICE_EXCEEDS_WALLET" => "Too pricey",
            "BALKED_QUEUE_WAIT" => "Line too long",
            "ABANDONED_QUEUE" => "Waited too long",
            "STOCKOUT" => "Sold out",
            _ => "Not my taste",
        }
        .into();
        self.decisions.push(Decision {
            event_id,
            run_id: self.run_id.clone(),
            sim_time_sec: now,
            agent_id: a.agent_id,
            archetype_name: a.archetype.clone(),
            booth_id: self.world.vendor_booth.booth_id.clone(),
            reason: reason.into(),
            agent_wallet_cents: a.wallet_cents,
            agent_hunger: a.hunger,
            agent_patience_sec: a.max_wait_sec,
            observed_price_cents: self.world.vendor_booth.item_price_cents,
            estimated_wait_sec: a.estimated_wait_sec,
            remaining_stock: self.accounts.remaining_inventory,
        });
        match reason {
            "BALKED_QUEUE_WAIT" => self.accounts.balked_queue_count += 1,
            "BALKED_PRICE_EXCEEDS_WALLET" => self.accounts.balked_price_count += 1,
            "ABANDONED_QUEUE" => self.accounts.abandoned_queue_count += 1,
            "STOCKOUT" => self.accounts.stockout_count += 1,
            "BALKED_LOW_AFFINITY" => self.accounts.low_affinity_count += 1,
            _ => {}
        }
    }

    fn consider(&mut self, i: usize, now: u32) {
        let b = &self.world.vendor_booth;
        self.agents[i].estimated_wait_sec =
            self.queue.len() as u32 * b.prep_time_sec / b.parallel_servers;
        let a = &self.agents[i];
        let reason = if self.accounts.remaining_inventory == 0 {
            Some("STOCKOUT")
        } else if b.item_price_cents > a.wallet_cents {
            Some("BALKED_PRICE_EXCEEDS_WALLET")
        } else if a.estimated_wait_sec > a.max_wait_sec {
            Some("BALKED_QUEUE_WAIT")
        } else if (trait_random(self.seed, a.agent_id, 9) % 1000) as f32
            >= a.affinity * (0.5 + a.hunger as f32 / 200.0) * 1000.0
        {
            Some("BALKED_LOW_AFFINITY")
        } else {
            None
        };
        if let Some(reason) = reason {
            self.record(i, reason, now);
        } else {
            self.agents[i].state = "QUEUING".into();
            self.agents[i].queue_join_sec = now;
            self.queue.push(i);
        }
    }

    fn fill_servers(&mut self, now: u32) {
        let mut serving = self
            .queue
            .iter()
            .filter(|&&i| self.agents[i].service_end_sec != 0)
            .count() as u32;
        for &i in &self.queue {
            if serving >= self.world.vendor_booth.parallel_servers
                || serving >= self.accounts.remaining_inventory
            {
                break;
            }
            if self.agents[i].service_end_sec == 0 {
                self.agents[i].service_end_sec = now + self.world.vendor_booth.prep_time_sec;
                serving += 1;
            }
        }
    }

    fn service(&mut self, now: u32) {
        let queue = self.queue.clone();
        for i in queue {
            if self.agents[i].service_end_sec != 0 && self.agents[i].service_end_sec <= now {
                self.accounts.units_sold += 1;
                self.accounts.update(&self.world.vendor_booth);
                self.record(i, "PURCHASED", now);
                self.agents[i].wallet_cents -= self.world.vendor_booth.item_price_cents;
                self.queue.retain(|&j| i != j);
            } else if self.agents[i].service_end_sec == 0
                && now - self.agents[i].queue_join_sec > self.agents[i].max_wait_sec
            {
                self.record(i, "ABANDONED_QUEUE", now);
                self.queue.retain(|&j| i != j);
            }
        }
        if self.accounts.remaining_inventory == 0 {
            for i in self.queue.clone() {
                self.record(i, "STOCKOUT", now);
            }
            self.queue.clear();
        }
        self.fill_servers(now);
    }
}

fn move_toward(a: &mut Agent, speed: f32) -> bool {
    let dx = a.target_x - a.x;
    let dy = a.target_y - a.y;
    let distance = (dx * dx + dy * dy).sqrt();
    if distance <= speed {
        a.x = a.target_x;
        a.y = a.target_y;
        true
    } else {
        a.x += dx / distance * speed;
        a.y += dy / distance * speed;
        false
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
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

// Nearest-rank quantile: for 15 seeds P10 is the second-lowest observation.
pub fn quantile(mut values: Vec<i64>, numerator: usize, denominator: usize) -> i64 {
    values.sort_unstable();
    values[(values.len() * numerator)
        .div_ceil(denominator)
        .saturating_sub(1)]
}

pub fn batch(world: &World) -> Vec<Scenario> {
    [("LOW", 50), ("BASE", 100), ("HIGH", 140)]
        .into_iter()
        .map(|(name, pct)| {
            let mut variant = world.clone();
            variant.total_simulated_attendees = world.total_simulated_attendees * pct / 100;
            let results: Vec<_> = (0..15)
                .map(|seed| {
                    let mut engine = Engine::new("batch", variant.clone(), seed);
                    engine.step(world.duration_sec().div_ceil(30));
                    engine.accounts
                })
                .collect();
            Scenario {
                scenario_name: name.into(),
                turnout_count: variant.total_simulated_attendees,
                seeds_run: 15,
                profitable_runs: results.iter().filter(|a| a.net_profit_cents >= 0).count() as u32,
                median_revenue_cents: quantile(
                    results.iter().map(|a| a.gross_revenue_cents).collect(),
                    1,
                    2,
                ),
                median_profit_cents: quantile(
                    results.iter().map(|a| a.net_profit_cents).collect(),
                    1,
                    2,
                ),
                downside_p10_profit_cents: quantile(
                    results.iter().map(|a| a.net_profit_cents).collect(),
                    1,
                    10,
                ),
                median_balked_queue: quantile(
                    results
                        .iter()
                        .map(|a| a.balked_queue_count as i64)
                        .collect(),
                    1,
                    2,
                ) as u32,
                median_balked_price: quantile(
                    results
                        .iter()
                        .map(|a| a.balked_price_count as i64)
                        .collect(),
                    1,
                    2,
                ) as u32,
            }
        })
        .collect()
}

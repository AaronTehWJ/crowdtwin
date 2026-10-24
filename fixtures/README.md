# Fixture provenance and assumptions

`captured-event.json` is a normalized snapshot from a real Apify run on
2026-10-24. Run `yJgu1aGVtuTerBN8h`, dataset `agXeTSnOzn9vXzISe`;
`captured-event.provenance.json` records the source and capture time. Its
`CAPTURED` mode means replayed evidence, not a new live API call. Unknown prices,
RSVPs, and organizer attendance claims remain null. No raw organizer dataset or
contact data is included. The event spans 32 hours; the simulator uses elapsed
time and does not model overnight closures.

`modeled-atl-event.json` and `bay-area-event.json` are **modeled demo data**, not
verified captures. Their actor IDs are null. The default world retains the
modeled ATL evidence so eight-hour regression figures stay reproducible.
Select `atl` for the real snapshot, `demo` for the modeled ATL event, or `bay`
for the modeled Bay Area event.

Refresh explicitly with `node --import tsx scripts/capture-apify.ts`, or pass
an event URL and successful run ID to reuse an existing dataset. Provider keys
are read from the ignored orchestrator environment file, never copied here.

The default world models 400 individuals, not a weighted sample of 40,000 people.
Its three archetypes and normalized map are explicit assumptions.

The illustrative $23,000 upfront capital is split into:

| Editable assumption | Amount |
| --- | ---: |
| Booth fee | $6,000 |
| Inventory: 2,000 units × $6 COGS | $12,000 |
| Staff and equipment | $5,000 |

The inventory and staff assumptions sum to the original $17,000 combined budget.
A $4,500 intervention caps **inventory preparation only** (750 units at $6).
It does not include booth fees or labor. Unsold inventory stays an asset for
net-profit accounting; its full purchase outlay reduces cash balance.

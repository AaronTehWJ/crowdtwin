import { useState } from 'react';
import type { WorldSpec } from '@crowdtwin/contracts';
import { ValidatedWorldSchema, type CostConfirmation } from '@crowdtwin/contracts/validation';
import { money } from '../api';
import { MapCanvas } from './MapCanvas';

const unknownCosts: CostConfirmation = { unitCogsCents: false, boothFeeCents: false, staffAndEquipmentCents: false, organizerCutPct: false };
type BoothKey = keyof WorldSpec['vendorBooth'];
const fields: { key: BoothKey; label: string; scale?: number; max: number; min?: number }[] = [
  { key: 'itemPriceCents', label: 'Item price ($)', scale: 100, max: 1_000_000 },
  { key: 'unitCogsCents', label: 'Unit COGS ($)', scale: 100, max: 1_000_000 },
  { key: 'boothFeeCents', label: 'Booth fee ($)', scale: 100, max: 1_000_000 },
  { key: 'staffAndEquipmentCents', label: 'Staff + equipment ($)', scale: 100, max: 1_000_000 },
  { key: 'organizerCutPct', label: 'Organizer cut (%)', max: 100 },
  { key: 'inventoryUnits', label: 'Inventory units', max: 100_000, min: 1 },
  { key: 'prepTimeSec', label: 'Prep time (sec)', max: 3600, min: 1 },
  { key: 'parallelServers', label: 'Parallel servers', max: 50, min: 1 },
  { key: 'x', label: 'Booth X', max: 1000 }, { key: 'y', label: 'Booth Y', max: 1000 },
];

export function NumberField({ label, value, onChange, min = 0, max, step = 1 }: {
  label: string; value: number; onChange: (n: number) => void; min?: number; max: number; step?: number;
}) {
  return <label className="field">{label}<input type="number" value={Number.isNaN(value) ? '' : value}
    required min={min} max={max} step={step} onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))} /></label>;
}

export function Review({ initial, busy, onApprove }: {
  initial: WorldSpec; busy: boolean; onApprove: (world: WorldSpec, costs: CostConfirmation) => Promise<void>;
}) {
  const [world, setWorld] = useState(() => structuredClone(initial));
  const [costs, setCosts] = useState(unknownCosts);
  const [imageError, setImageError] = useState('');
  const result = ValidatedWorldSchema.safeParse(world);
  const booth = world.vendorBooth;
  const patchBooth = (patch: Partial<typeof booth>) => setWorld(w => ({ ...w, vendorBooth: { ...w.vendorBooth, ...patch } }));
  const capital = booth.boothFeeCents + booth.staffAndEquipmentCents + booth.unitCogsCents * booth.inventoryUnits;
  const loadImage = async (file?: File) => {
    setImageError('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 750_000) {
      setImageError('Choose a PNG, JPEG or WebP up to 750 KB. Remote images are not loaded.'); return;
    }
    const reader = new FileReader();
    reader.onerror = () => setImageError('Could not read that image.');
    reader.onload = () => setWorld(w => ({ ...w, mapMode: 'INDOOR_IMAGE', floorplanImageUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };
  return <form className="review-layout" onSubmit={event => {
    event.preventDefault();
    if (result.success && !busy) void onApprove(result.data, costs);
  }}>
    <section className="panel map-panel">
      <div className="panel-heading"><div><p className="eyebrow">02 / HUMAN REVIEW</p><h2>Place your bet. Then test it.</h2></div><span className="badge">NOT SEEDED</span></div>
      <MapCanvas world={world} onMove={busy ? undefined : patchBooth} />
      <p className="muted">Drag the mint booth, or edit its coordinates. Landmarks and customer archetypes are assumptions, not collected facts.</p>
      <fieldset disabled={busy} className="map-options">
        <label className="field">Map mode<select value={world.mapMode} onChange={e => setWorld(w => ({ ...w, mapMode: e.target.value as WorldSpec['mapMode'] }))}>
          <option value="OUTDOOR_MAP">Outdoor assumption map</option><option value="INDOOR_IMAGE">Indoor floorplan</option>
        </select></label>
        <label className="field">Local floorplan (max 750 KB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { void loadImage(e.target.files?.[0]); }} /></label>
      </fieldset>
      {imageError && <p role="alert" className="error">{imageError}</p>}
      <details><summary>Review landmark assumptions</summary><fieldset disabled={busy} className="stack">
        {world.anchors.map((anchor, i) => <div key={anchor.id} className="mini-panel">
          <strong>{anchor.label} · {anchor.nodeType}</strong><div className="field-grid">
            {(['x', 'y', 'gravityWeight'] as const).map(key => <NumberField key={key} label={`${anchor.label} ${key}`} value={anchor[key]} max={key === 'gravityWeight' ? 10 : 1000} step={key === 'gravityWeight' ? 0.1 : 1}
              onChange={value => setWorld(w => ({ ...w, anchors: w.anchors.map((a, j) => i === j ? { ...a, [key]: value } : a) }))} />)}
          </div>
        </div>)}
      </fieldset></details>
      <details><summary>Review three customer archetypes</summary><fieldset disabled={busy} className="stack">
        <p className="muted">Weights must sum to 1. Wallet amounts are cents; affinity is 0–1.</p>
        {world.personas.map((persona, i) => <div key={persona.id} className="mini-panel"><strong>{persona.name}</strong><div className="field-grid">
          {(['weight', 'walletMinCents', 'walletMaxCents', 'maxWaitSec', 'categoryAffinity'] as const).map(key => <NumberField key={key} label={`${persona.name} ${key}`} value={persona[key]}
            max={key === 'weight' || key === 'categoryAffinity' ? 1 : key === 'maxWaitSec' ? 3600 : 100_000_000}
            step={key === 'weight' || key === 'categoryAffinity' ? 0.01 : 1} min={key === 'maxWaitSec' ? 1 : 0}
            onChange={value => setWorld(w => ({ ...w, personas: w.personas.map((p, j) => i === j ? { ...p, [key]: value } : p) }))} />)}
        </div></div>)}
      </fieldset></details>
    </section>
    <section className="panel review-panel">
      <p className="eyebrow">EDITABLE ASSUMPTIONS</p><h2>Unit economics</h2>
      <p className="muted">Your numbers, not scraped evidence. Confirm each cost independently, including a genuine zero.</p>
      <fieldset disabled={busy}>
        <NumberField label="Simulated attendees" value={world.totalSimulatedAttendees} min={50} max={1000} onChange={n => setWorld(w => ({ ...w, totalSimulatedAttendees: n }))} />
        <div className="field-grid">{fields.map(field => <div key={field.key}>
          <NumberField label={field.label} value={Number(booth[field.key]) / (field.scale ?? 1)} min={field.min} max={field.max} step={field.scale ? 0.01 : 1}
            onChange={n => patchBooth({ [field.key]: field.scale ? Math.round(n * field.scale) : n })} />
          {field.key in costs && <label className="check"><input type="checkbox" checked={costs[field.key as keyof CostConfirmation]} onChange={e => setCosts(c => ({ ...c, [field.key]: e.target.checked }))} />Confirmed {field.label}</label>}
        </div>)}</div>
      </fieldset>
      <div className="capital"><span>Upfront capital</span><strong>{Number.isFinite(capital) ? money(capital) : 'Incomplete'}</strong><small>Booth + prepared inventory + staff/equipment</small></div>
      {!Object.values(costs).every(Boolean) && <p className="notice">Unconfirmed costs remain unknown. You may simulate, but underwriting will return NEEDS_INPUT.</p>}
      {!result.success && <ul className="error" role="alert">{result.error.issues.slice(0, 5).map((e, i) => <li key={i}>{e.path.join('.')}: {e.message}</li>)}</ul>}
      <button className="primary wide" disabled={!result.success || busy} type="submit">{busy ? 'Initializing Rust + 45 scenarios…' : 'Approve Setup & Seed World'}</button>
      <p className="fine">Human approval seeds a new world. No funds are authorized or transferred.</p>
    </section>
  </form>;
}

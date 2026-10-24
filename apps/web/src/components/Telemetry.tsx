import { money } from '../api';
import type { Booth } from '../simulation';

export function Telemetry({ booth: b }: { booth: Booth }) {
  return <>
    <div className="metrics">
      <article className="metric"><span>Gross sales</span><strong>{money(b.grossRevenueCents)}</strong><small>{b.unitsSold} units sold</small></article>
      <article className="metric"><span>Net profit</span><strong className={b.netProfitCents < 0 ? 'negative' : 'positive'}>{money(b.netProfitCents)}</strong><small>Recognizes consumed COGS only</small></article>
      <article className="metric"><span>Cash balance</span><strong className={b.cashBalanceCents < 0 ? 'negative' : 'positive'}>{money(b.cashBalanceCents)}</strong><small>Charges all prepared inventory</small></article>
    </div>
    <div className="money-detail"><span>Inventory outlay <b>{money(b.totalInventoryOutlayCents)}</b></span><span>Consumed COGS <b>{money(b.consumedCogsCents)}</b></span><span>Organizer fee <b>{money(b.organizerFeeCents)}</b></span></div>
    <div className="demand">
      <span><b>{b.balkedQueueCount}</b> Balked queue</span><span><b>{b.balkedPriceCount}</b> Balked price</span>
      <span><b>{b.abandonedQueueCount}</b> Abandoned</span><span><b>{b.lowAffinityCount}</b> Low affinity</span><span><b>{b.stockoutCount}</b> Stockout</span>
    </div>
  </>;
}

import type { WorldSpec } from '@crowdtwin/contracts';
import { evidenceLabel, money } from '../api';

export function Evidence({ world }: { world: WorldSpec }) {
  const e = world.evidence;
  return <section className="panel evidence"><p className="eyebrow">READ-ONLY EVIDENCE</p><h2>{e.title}</h2>
    <span className="badge">{evidenceLabel(e)}</span>
    <p>{e.description}</p>
    <dl>
      <dt>Venue</dt><dd>{e.venueName}</dd>
      <dt>Address</dt><dd>{e.venueAddress}</dd>
      <dt>Starts</dt><dd>{e.startIso}</dd>
      <dt>Duration</dt><dd>{e.durationHours} hours</dd>
      <dt>Ticket</dt><dd>{e.ticketPriceCents === null ? 'Unknown' : money(e.ticketPriceCents)}</dd>
      <dt>Platform RSVPs</dt><dd>{e.platformRsvpCount ?? 'Unknown'}</dd>
      <dt>Organizer claim</dt><dd>{e.organizerClaimedAttendance ?? 'Unknown'}</dd>
      <dt>Captured</dt><dd>{e.capturedAtIso}</dd>
      <dt>Actor run</dt><dd>{e.actorRunId ? <a href={`https://console.apify.com/actors/runs/${encodeURIComponent(e.actorRunId)}`} target="_blank" rel="noreferrer">{e.actorRunId}</a> : 'None (not a live actor run)'}</dd>
    </dl>
    <p className="fine">RSVPs and organizer claims do not establish turnout.</p>
    {e.durationHours > 12 && <p className="notice">This event spans {e.durationHours} hours. The simulation uses elapsed time without closures: arrivals are spread over the first half of the span, fixed costs are not prorated, and the map, archetypes, and booth economics are the modeled defaults unless you edit them. Review these assumptions before approving.</p>}
    {/^https?:\/\//.test(e.sourceUrl) && <a href={e.sourceUrl} target="_blank" rel="noreferrer">Source reference ↗</a>}
  </section>;
}

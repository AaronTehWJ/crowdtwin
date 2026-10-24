import { useEffect, useRef, type PointerEvent } from 'react';
import type { WorldSpec } from '@crowdtwin/contracts';
import { interpolate, type Agent, type Anchor } from '../simulation';

export function normalizedPoint(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>) {
  const clamp = (n: number) => Math.max(0, Math.min(1000, Math.round(n)));
  return { x: clamp((clientX - rect.left) / rect.width * 1000), y: clamp((clientY - rect.top) / rect.height * 1000) };
}

export function MapCanvas({ world, onMove, agents, anchors, boothPosition, simTimeSec = 0, playing = false, onSelect, selectedId }: {
  world: WorldSpec; onMove?: (point: { x: number; y: number }) => void;
  agents?: Agent[]; anchors?: Anchor[]; boothPosition?: { x: number; y: number };
  simTimeSec?: number; playing?: boolean; onSelect?: (id: number) => void; selectedId?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const positions = useRef(new Map<number, { x: number; y: number }>());
  const dragging = useRef(false);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    let disposed = false;
    const draw = (image?: HTMLImageElement) => {
      if (disposed) return;
      ctx.fillStyle = '#14201c'; ctx.fillRect(0, 0, 1000, 1000);
      if (image) { ctx.globalAlpha = 0.6; ctx.drawImage(image, 0, 0, 1000, 1000); ctx.globalAlpha = 1; }
      ctx.strokeStyle = '#ffffff0c'; ctx.lineWidth = 1;
      for (let n = 0; n <= 1000; n += 50) {
        ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, 1000); ctx.moveTo(0, n); ctx.lineTo(1000, n); ctx.stroke();
      }
      ctx.textAlign = 'center'; ctx.font = '18px system-ui';
      for (const node of anchors ?? world.anchors) {
        const color = node.nodeType === 'STAGE' ? '#dac997' : node.nodeType === 'COMPETITOR' ? '#e19a7a' : '#829d91';
        ctx.fillStyle = `${color}15`; ctx.beginPath(); ctx.arc(node.x, node.y, node.nodeType === 'STAGE' ? 115 : 60, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(node.x, node.y, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(node.label, Math.max(95, Math.min(905, node.x)), node.y + 36);
      }
      const booth = boothPosition ?? world.vendorBooth;
      ctx.fillStyle = '#78e8b5'; ctx.shadowColor = '#78e8b5'; ctx.shadowBlur = 22;
      ctx.fillRect(booth.x - 16, booth.y - 16, 32, 32); ctx.shadowBlur = 0;
      ctx.fillText('YOUR BOOTH', Math.max(90, Math.min(910, booth.x)), booth.y + 48);
    };
    draw();
    if (world.mapMode === 'INDOOR_IMAGE' && world.floorplanImageUrl) {
      const image = new Image(); image.onload = () => draw(image); image.src = world.floorplanImageUrl;
    }
    return () => { disposed = true; };
  }, [world, anchors, boothPosition]);
  useEffect(() => {
    const ctx = overlay.current?.getContext('2d');
    if (!ctx || !agents) return;
    const from = new Map(positions.current);
    const start = performance.now();
    const animate = playing && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const draw = (now: number) => {
      ctx.clearRect(0, 0, 1000, 1000);
      positions.current.clear();
      const t = animate ? (now - start) / 230 : 1;
      let bubbles = 0;
      for (const agent of agents) {
        if (agent.arrivalSec > simTimeSec) continue;
        const p = interpolate(from.get(agent.agentId) ?? agent, agent, t);
        positions.current.set(agent.agentId, p);
        ctx.fillStyle = agent.state === 'QUEUING' ? '#ebce86' : agent.thoughtBubble === 'Bought!' ? '#92edb3' : agent.lastDecisionId && agent.thoughtBubble !== 'Bought!' ? '#eda486' : '#99b6a5';
        ctx.beginPath(); ctx.arc(p.x, p.y, agent.agentId === selectedId ? 10 : 5, 0, 2 * Math.PI); ctx.fill();
        if (agent.agentId === selectedId) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
        if (agent.thoughtBubble && simTimeSec - agent.decisionSec < 120 && bubbles++ < 6) {
          ctx.font = '16px system-ui'; ctx.textAlign = 'center';
          const x = Math.max(85, Math.min(915, p.x)); const y = Math.max(25, p.y - 15 - bubbles * 4);
          ctx.fillStyle = '#112018eb'; ctx.fillRect(x - 82, y - 20, 164, 27);
          ctx.fillStyle = '#e9eee9'; ctx.fillText(agent.thoughtBubble, x, y);
        }
      }
      if (t < 1) frame = requestAnimationFrame(draw);
    };
    draw(start);
    return () => cancelAnimationFrame(frame);
  }, [agents, simTimeSec, playing, selectedId]);
  const point = (event: PointerEvent<HTMLCanvasElement>) => normalizedPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  return <div className="map-wrap">
    <div className="canvas-stage">
    <canvas ref={canvas} width={1000} height={1000} aria-label="Venue assumption map, 1000 by 1000 normalized coordinates"
      onPointerDown={event => {
        if (!onMove) return;
        const p = point(event);
        if (Math.hypot(p.x - world.vendorBooth.x, p.y - world.vendorBooth.y) < 55) {
          dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={event => { if (dragging.current) onMove?.(point(event)); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}>
      Venue map. Use the Booth X and Booth Y fields to place the booth with a keyboard.
    </canvas>
    {agents && <canvas ref={overlay} className="agent-overlay" width={1000} height={1000} aria-label="Live customers, click a dot to pause and inspect"
      onClick={event => {
        const p = normalizedPoint(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
        const nearest = [...positions.current].map(([id, xy]) => ({ id, distance: Math.hypot(p.x - xy.x, p.y - xy.y) })).sort((a, b) => a.distance - b.distance)[0];
        if (nearest && nearest.distance <= 25) onSelect?.(nearest.id);
      }} />}
    </div>
    <div className="map-caption"><span>ASSUMPTION MAP</span><span>1,000 × 1,000 · not geographic scale</span></div>
  </div>;
}

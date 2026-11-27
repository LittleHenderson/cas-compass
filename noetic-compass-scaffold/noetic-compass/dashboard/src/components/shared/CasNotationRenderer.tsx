import {
  lazy,
  Suspense,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { axisColorForNode } from '../../lib/casColorPalette';
import { authenticatedSggsEventSource, mode7LiveUrl } from '../../api/sggs';
import { SggsErrorBoundary } from '../idea-atlas/SggsErrorBoundary';
import { useSggsStream, type SggsCommit, type SggsStreamStatus } from '../../lib/sggs_stream';
import type {
  AtlasTraceThoughtTree,
  ThoughtTreeEdge,
  ThoughtTreeNode,
  ThoughtTreeRootNode,
} from '../../lib/trace';

const CompilerSggsScene = lazy(() =>
  import('../idea-atlas/SggsScene').then((m) => ({
    default: m.SggsScene,
  })),
);

// ── Types ──

export interface DiagramNode {
  id: string;
  kind: string;
  label: string;
  role?: string;
  step?: number;
  [key: string]: unknown;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
  label?: string;
  directed?: boolean;
}

export interface DiagramContainer {
  id: string;
  kind: string;
  label: string;
  contains: string[];
  cardinality?: number;
  element_type?: string;
}

export interface CasDiagram {
  kind: string;
  schema_version: string;
  layouts: string[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  containers: DiagramContainer[];
}

// ── Syntax highlighting ──

export function highlightSyntax(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let i = 0;
  const s = text;

  while (i < s.length) {
    // CO-N operator (legacy form)
    const coMatch = s.slice(i).match(/^CO-\d+/);
    if (coMatch) {
      parts.push(<span key={i} className="text-cyan-400">{coMatch[0]}</span>);
      i += coMatch[0].length;
      continue;
    }
    // ^N operator (caret form)
    if (s[i] === '^' && /[0-9]/.test(s[i + 1] ?? '')) {
      parts.push(<span key={i} className="text-cyan-400">^{s[i + 1]}</span>);
      i += 2;
      continue;
    }
    // ^Domain
    if (s[i] === '^' && 'PCEO'.includes(s[i + 1] ?? '')) {
      parts.push(<span key={i} className="text-[#37f5a0]">^{s[i + 1]}</span>);
      i += 2;
      continue;
    }
    // _{Fn} drive subscript
    const driveMatch = s.slice(i).match(/^_\{F\d+\}/);
    if (driveMatch) {
      parts.push(<span key={i} className="text-amber-400">{driveMatch[0]}</span>);
      i += driveMatch[0].length;
      continue;
    }
    // Fn drive ref
    const fnMatch = s.slice(i).match(/^F[1-7]\b/);
    if (fnMatch && (i === 0 || !/[{a-zA-Z]/.test(s[i - 1] ?? ''))) {
      parts.push(<span key={i} className="text-amber-400">{fnMatch[0]}</span>);
      i += fnMatch[0].length;
      continue;
    }
    // |⟨R1,R2,...⟩ register-set (CAS v7.7)
    const regSetMatch = s.slice(i).match(/^\|⟨[^⟩]+⟩/);
    if (regSetMatch) {
      parts.push(<span key={i} className="text-fuchsia-400">{regSetMatch[0]}</span>);
      i += regSetMatch[0].length;
      continue;
    }
    // |R single register (CAS v7.5)
    if (s[i] === '|' && /[TAfE]/.test(s[i + 1] ?? '') && !/[{a-zA-Z]/.test(s[i + 2] ?? '')) {
      parts.push(<span key={i} className="text-fuchsia-400">|{s[i + 1]}</span>);
      i += 2;
      continue;
    }
    // Y_T( / Y_A( yield query (CAS v7.6)
    const yieldMatch = s.slice(i).match(/^Y_[TA]\b/);
    if (yieldMatch) {
      parts.push(<span key={i} className="text-purple-400">{yieldMatch[0]}</span>);
      i += yieldMatch[0].length;
      continue;
    }
    // Recipe / production tokens (CAS v7.6)
    if (s.slice(i, i + 5) === 'Theta' || s[i] === 'Θ') {
      const len = s[i] === 'Θ' ? 1 : 5;
      parts.push(<span key={i} className="text-pink-400">{s.slice(i, i + len)}</span>);
      i += len;
      continue;
    }
    // Ω_name production target (with optional _name suffix)
    if (s.slice(i, i + 5) === 'Omega' || s[i] === 'Ω') {
      const headLen = s[i] === 'Ω' ? 1 : 5;
      const tailMatch = s.slice(i + headLen).match(/^_(?:\{[^}]+\}|[A-Za-z][A-Za-z0-9_]*)/);
      const totalLen = headLen + (tailMatch ? tailMatch[0].length : 0);
      parts.push(<span key={i} className="text-orange-400">{s.slice(i, i + totalLen)}</span>);
      i += totalLen;
      continue;
    }
    // Λ leakage / κ catalyst / ι inhibitor (with optional _name)
    const recipeSym = s.slice(i).match(/^(Lambda|Λ|kappa|κ|iota|ι|eta|η)(_(?:\{[^}]+\}|[A-Za-z][A-Za-z0-9_]*))?/);
    if (recipeSym) {
      parts.push(<span key={i} className="text-orange-400">{recipeSym[0]}</span>);
      i += recipeSym[0].length;
      continue;
    }
    // RPM
    if (s.slice(i, i + 3) === 'RPM') {
      parts.push(<span key={i} className="text-purple-400">RPM</span>);
      i += 3;
      continue;
    }
    // ASCII aliases for set-theory operators
    const aliasMatch = s.slice(i).match(/^(notin|subseteq|subset|supseteq|supset|emptyset|in)\b/);
    if (aliasMatch && (i === 0 || !/[A-Za-z0-9_]/.test(s[i - 1] ?? ''))) {
      const word = aliasMatch[0];
      const cls = word === 'emptyset' ? 'text-violet-300' : 'text-[#37f5a0] font-bold';
      parts.push(<span key={i} className={cls}>{word}</span>);
      i += word.length;
      continue;
    }
    // Meta-set names and typed cluster constructors (Set Theory layer).
    const metaSetMatch = s.slice(i).match(
      /^(?:Noetics|Domains|Drives|Registers|States|SubFoundations|Foundations|Foundation_[1-7]|EmptySet|NoeticSet|NoeticCluster|Cluster|StateSet|StateCluster|StateVariantSet|StateVariantCluster|RelationSet|RelationCluster|DriveSet|DomainSet|RegisterSet|FoundationSet|SubFoundationSet|Tuple|Coordinate|Product|Pullback|CoverOf|PartitionOf|Union|Intersection|Difference)\b/
    );
    if (metaSetMatch && (i === 0 || !/[A-Za-z0-9_]/.test(s[i - 1] ?? ''))) {
      parts.push(<span key={i} className="text-violet-300">{metaSetMatch[0]}</span>);
      i += metaSetMatch[0].length;
      continue;
    }
    // Set-theory operators (membership, subset, union/intersection/difference)
    if ('∈∉⊂⊆⊃⊇∪∩∖'.includes(s[i])) {
      parts.push(<span key={i} className="text-[#37f5a0] font-bold">{s[i]}</span>);
      i += 1;
      continue;
    }
    // ∅ empty-set literal
    if (s[i] === '∅') {
      parts.push(<span key={i} className="text-violet-300">{s[i]}</span>);
      i += 1;
      continue;
    }
    // Phi / Φ
    if (s.slice(i, i + 3) === 'Phi' || s[i] === 'Φ') {
      const len = s[i] === 'Φ' ? 1 : 3;
      parts.push(<span key={i} className="text-pink-400">{s.slice(i, i + len)}</span>);
      i += len;
      continue;
    }
    // Multiplicative ops × ÷ ∘ (and ASCII aliases * /)
    if ('*×/÷∘'.includes(s[i])) {
      parts.push(<span key={i} className="text-orange-400">{s[i]}</span>);
      i += 1;
      continue;
    }
    // Recipe coefficient ·
    if (s[i] === '·') {
      parts.push(<span key={i} className="text-[#b3c2ba]">{s[i]}</span>);
      i += 1;
      continue;
    }
    if (s.slice(i, i + 2) === '->') {
      parts.push(<span key={i} className="text-[#eaf3ee]">→</span>);
      i += 2;
      continue;
    }
    if (s[i] === '→' || s[i] === '←' || s[i] === '↔') {
      parts.push(<span key={i} className="text-[#eaf3ee]">{s[i]}</span>);
      i += 1;
      continue;
    }
    // Bare pipe
    if (s[i] === '|') {
      parts.push(<span key={i} className="text-[#b3c2ba]">{s[i]}</span>);
      i += 1;
      continue;
    }
    // = (recipe definition / emergent assignment)
    if (s[i] === '=') {
      parts.push(<span key={i} className="text-[#b3c2ba]">{s[i]}</span>);
      i += 1;
      continue;
    }
    if (s[i] === '+' || s[i] === '-') {
      parts.push(<span key={i} className="text-[#b3c2ba]">{s[i]}</span>);
      i += 1;
      continue;
    }
    // Parens / angle brackets
    if ('(){}⟨⟩<>'.includes(s[i])) {
      parts.push(<span key={i} className="text-[#62706a]">{s[i]}</span>);
      i += 1;
      continue;
    }
    // Default
    parts.push(<span key={i} className="text-[#b3c2ba]">{s[i]}</span>);
    i += 1;
  }
  return parts;
}

// ── Diagram rendering helpers ──

function diagramColor(kind: string, node?: { noetic?: number | null; domain?: string | null; drive?: number | null }): string {
  if (node) {
    try {
      const axisColor = axisColorForNode(node);
      if (axisColor !== null) return axisColor;
    } catch {
      // out-of-range axis value — fall through to kind-keyed fallback
    }
  }
  if (kind.includes('cluster') || kind === 'meta_set') return '#37f5a0';
  if (kind === 'state') return '#38bdf8';
  if (kind === 'noetic') return '#22d3ee';
  if (kind === 'drive') return '#f59e0b';
  if (kind === 'domain') return '#37f5a0';
  if (kind === 'register') return '#f472b6';
  if (kind === 'foundation' || kind === 'subfoundation') return '#fbbf24';
  if (kind === 'call' || kind === 'operator') return '#c084fc';
  if (kind === 'production_target' || kind === 'emergent') return '#a78bfa';
  return '#86958d';
}

type Pos = { x: number; y: number };
type Region = { cx: number; cy: number; rx: number; ry: number };
type GridSpec = {
  x0: number;
  y0: number;
  cellW: number;
  cellH: number;
  rows: string[];
  cols: string[];
  title: string;
};
type PetalSector = {
  id: string;
  start: number;
  end: number;
  label: string;
  color: string;
};
type PetalSpec = {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  sectors: PetalSector[];
  title: string;
};
type FractalBranch = { x1: number; y1: number; x2: number; y2: number; opacity: number };
type LayoutResult = {
  positions: Map<string, Pos>;
  regions?: Map<string, Region>;
  grid?: GridSpec;
  petals?: PetalSpec;
  fractalBranches?: FractalBranch[];
  pointMembers?: Set<string>;
};

const ATOM_RADIUS = 20;
const RECT_HEIGHT_FULL = 38;
const RECT_HEIGHT_PILL = 22;
const RECT_PAD_X = 16;
const CHAR_W = 6.5;

function truncateLabel(label: string, max = 22): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function rectWidthFor(label: string): number {
  return Math.max(truncateLabel(label).length * CHAR_W + RECT_PAD_X * 2, 48);
}

type GestureNodeStyle = CSSProperties & { '--cas-node-color': string };

function gestureNodeStyle(color: string, order = 0): GestureNodeStyle {
  return {
    '--cas-node-color': color,
    animationDelay: `${(order % 10) * 0.08}s`,
  } as GestureNodeStyle;
}

function radialLayout(items: DiagramNode[], w: number, h: number): LayoutResult {
  const out = new Map<string, Pos>();
  const containers = items.filter((it) => it.id.startsWith('container:'));
  const atoms = items.filter((it) => !it.id.startsWith('container:'));

  const containerRowY = 32;
  const containerRowH = 38;
  const atomR = 20;
  const r = Math.min(w, h) * 0.34;
  const cy = Math.max(h / 2 + 22, containerRowY + containerRowH / 2 + atomR + 14 + r);

  const cx = w / 2;
  const angleOffset = atoms.length > 0 ? Math.PI / atoms.length : 0;
  atoms.forEach((item, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(atoms.length, 1) - Math.PI / 2 + angleOffset;
    out.set(item.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  });

  if (containers.length === 1) {
    out.set(containers[0].id, { x: cx, y: containerRowY });
  } else if (containers.length > 1) {
    const widths = containers.map((c) => rectWidthFor(c.label));
    const totalContent = widths.reduce((s, x) => s + x, 0);
    const gap = Math.max(20, (w - 80 - totalContent) / Math.max(containers.length - 1, 1));
    let x = 40 + widths[0] / 2;
    containers.forEach((c, i) => {
      out.set(c.id, { x, y: containerRowY });
      if (i < containers.length - 1) {
        x += widths[i] / 2 + gap + widths[i + 1] / 2;
      }
    });
  }
  return { positions: out };
}

function dependencyLayout(items: DiagramNode[], edges: DiagramEdge[], w: number, h: number): LayoutResult {
  const ids = new Set(items.map((i) => i.id));
  const inEdges = new Map<string, string[]>();
  const outEdges = new Map<string, string[]>();
  items.forEach((it) => {
    inEdges.set(it.id, []);
    outEdges.set(it.id, []);
  });
  edges.forEach((e) => {
    if (ids.has(e.source) && ids.has(e.target)) {
      inEdges.get(e.target)!.push(e.source);
      outEdges.get(e.source)!.push(e.target);
    }
  });
  const rank = new Map<string, number>();
  const queue: string[] = [];
  items.forEach((it) => {
    if (inEdges.get(it.id)!.length === 0) {
      rank.set(it.id, 0);
      queue.push(it.id);
    }
  });
  while (queue.length) {
    const id = queue.shift()!;
    const r0 = rank.get(id)!;
    for (const tgt of outEdges.get(id) || []) {
      const cur = rank.get(tgt);
      if (cur === undefined || cur < r0 + 1) {
        rank.set(tgt, r0 + 1);
        queue.push(tgt);
      }
    }
  }
  items.forEach((it) => {
    if (!rank.has(it.id)) rank.set(it.id, 0);
  });
  const byRank = new Map<number, string[]>();
  rank.forEach((r, id) => {
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(id);
  });
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  const out = new Map<string, Pos>();
  const padX = 70;
  const padY = 36;
  const stepX = ranks.length > 1 ? (w - padX * 2) / (ranks.length - 1) : 0;
  ranks.forEach((r, i) => {
    const lane = byRank.get(r)!;
    const stepY = (h - padY * 2) / Math.max(lane.length, 1);
    lane.forEach((id, j) => {
      out.set(id, {
        x: ranks.length > 1 ? padX + i * stepX : w / 2,
        y: padY + (j + 0.5) * stepY,
      });
    });
  });
  return { positions: out };
}

function gridLayout(items: DiagramNode[], containers: DiagramContainer[], w: number, h: number): LayoutResult {
  const out = new Map<string, Pos>();
  const noetics = items
    .filter((it) => it.kind === 'noetic')
    .sort((a, b) => parseInt(a.label.replace(/\D/g, '') || '0') - parseInt(b.label.replace(/\D/g, '') || '0'));
  const domains = items
    .filter((it) => it.kind === 'domain')
    .sort((a, b) => ['P', 'C', 'E', 'O'].indexOf(a.label) - ['P', 'C', 'E', 'O'].indexOf(b.label));

  const rows = noetics.length ? noetics : items.filter((it) => it.role === 'atomic_noetic');
  const cols = domains.length ? domains : items.filter((it) => it.role === 'processing_domain');
  const x0 = 150;
  const y0 = 72;
  const gridW = w - x0 - 42;
  const gridH = h - y0 - 38;
  const cellW = gridW / Math.max(cols.length, 1);
  const cellH = gridH / Math.max(rows.length, 1);

  rows.forEach((row, i) => {
    out.set(row.id, { x: x0 - 42, y: y0 + cellH * (i + 0.5) });
  });
  cols.forEach((col, i) => {
    out.set(col.id, { x: x0 + cellW * (i + 0.5), y: y0 - 26 });
  });

  containers.forEach((container) => {
    if (container.element_type === 'noetic') {
      out.set(container.id, { x: x0 - 42, y: 30 });
    } else if (container.element_type === 'domain') {
      out.set(container.id, { x: x0 + gridW / 2, y: 30 });
    }
  });

  const call = items.find((it) => it.kind === 'call' && it.label === 'Product');
  if (call) out.set(call.id, { x: x0 + gridW - 42, y: h - 24 });

  return {
    positions: out,
    grid: {
      x0,
      y0,
      cellW,
      cellH,
      rows: rows.map((row) => row.label),
      cols: cols.map((col) => col.label),
      title: `${rows.length || '?'} × ${cols.length || '?'} finite product coordinates`,
    },
  };
}

function wedgePath(cx: number, cy: number, innerR: number, outerR: number, start: number, end: number): string {
  const largeArc = end - start > Math.PI ? 1 : 0;
  const p0 = { x: cx + Math.cos(start) * outerR, y: cy + Math.sin(start) * outerR };
  const p1 = { x: cx + Math.cos(end) * outerR, y: cy + Math.sin(end) * outerR };
  const p2 = { x: cx + Math.cos(end) * innerR, y: cy + Math.sin(end) * innerR };
  const p3 = { x: cx + Math.cos(start) * innerR, y: cy + Math.sin(start) * innerR };
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p3.x} ${p3.y}`,
    'Z',
  ].join(' ');
}

function petalLayout(items: DiagramNode[], containers: DiagramContainer[], edges: DiagramEdge[], w: number, h: number): LayoutResult {
  const out = new Map<string, Pos>();
  const cx = w / 2;
  const cy = h / 2 + 10;
  const outerR = Math.min(w, h) * 0.38;
  const innerR = 46;
  const call = items.find((it) => it.kind === 'call' && (it.label === 'CoverOf' || it.label === 'PartitionOf'));
  const baseEdge = edges.find((edge) => edge.kind === 'cover_base' || edge.kind === 'partition_base');
  const baseId = baseEdge?.source;
  const memberIds = edges
    .filter((edge) => edge.kind === 'cover_member' || edge.kind === 'partition_member')
    .map((edge) => edge.source);
  const memberContainers = memberIds
    .map((id) => containers.find((container) => container.id === id))
    .filter((container): container is DiagramContainer => !!container);
  const fallbackMembers = containers.filter((container) => container.id !== baseId);
  const sectorsSource = memberContainers.length ? memberContainers : fallbackMembers;
  const sectors: PetalSector[] = [];

  if (baseId) out.set(baseId, { x: cx, y: cy });
  if (call) out.set(call.id, { x: cx, y: cy });

  sectorsSource.forEach((container, i) => {
    const start = -Math.PI / 2 + (Math.PI * 2 * i) / Math.max(sectorsSource.length, 1);
    const end = -Math.PI / 2 + (Math.PI * 2 * (i + 1)) / Math.max(sectorsSource.length, 1);
    const mid = (start + end) / 2;
    const color = diagramColor(container.kind);
    sectors.push({ id: container.id, start, end, label: container.label, color });
    out.set(container.id, {
      x: cx + Math.cos(mid) * (outerR + 24),
      y: cy + Math.sin(mid) * (outerR + 24),
    });
    container.contains.forEach((childId, j) => {
      const spread = (j - (container.contains.length - 1) / 2) * ((end - start) * 0.16);
      const radius = innerR + (outerR - innerR) * (0.48 + 0.12 * (j % 2));
      out.set(childId, {
        x: cx + Math.cos(mid + spread) * radius,
        y: cy + Math.sin(mid + spread) * radius,
      });
    });
  });

  items
    .filter((item) => !out.has(item.id))
    .forEach((item, i) => {
      out.set(item.id, { x: 52 + i * 42, y: h - 26 });
    });

  return {
    positions: out,
    petals: {
      cx,
      cy,
      innerR,
      outerR,
      sectors,
      title: call?.label === 'PartitionOf' ? 'disjoint finite partition' : 'finite cover family',
    },
  };
}

function fractalLayout(items: DiagramNode[], edges: DiagramEdge[], w: number, h: number): LayoutResult {
  const out = new Map<string, Pos>();
  const stepNodes = items
    .filter((item) => item.role === 'fractal_step' || edges.some((edge) => edge.kind === 'fractal_step' && (edge.source === item.id || edge.target === item.id)))
    .sort((a, b) => Number(a.step ?? 0) - Number(b.step ?? 0));
  const ordered = stepNodes.length ? stepNodes : items;
  const branches: FractalBranch[] = [];
  const startY = 48;
  const stepY = Math.min(72, (h - 96) / Math.max(ordered.length - 1, 1));
  ordered.forEach((item, i) => {
    const amplitude = Math.max(28, 120 / (i + 1));
    const x = i === 0 ? w / 2 : w / 2 + (i % 2 === 0 ? 1 : -1) * amplitude;
    const y = startY + i * stepY;
    out.set(item.id, { x, y });
    if (i < ordered.length - 1) {
      branches.push(
        { x1: x, y1: y + 18, x2: x - amplitude * 0.48, y2: y + stepY * 0.58, opacity: 0.18 },
        { x1: x, y1: y + 18, x2: x + amplitude * 0.48, y2: y + stepY * 0.58, opacity: 0.18 },
      );
    }
  });
  items
    .filter((item) => !out.has(item.id))
    .forEach((item, i) => {
      out.set(item.id, { x: 46 + i * 46, y: h - 28 });
    });
  return { positions: out, fractalBranches: branches };
}

function containmentLayout(items: DiagramNode[], containers: DiagramContainer[], edges: DiagramEdge[], w: number, h: number): LayoutResult {
  const containedIn = new Map<string, string>();
  containers.forEach((c) => c.contains.forEach((member) => containedIn.set(member, c.id)));

  const containerIds = new Set(containers.map((c) => c.id));
  const memberOf = new Map<string, string>();
  edges.forEach((e) => {
    if (!containerIds.has(e.source) || !containerIds.has(e.target)) return;
    const lbl = (e.label || '').trim();
    if (lbl === '⊆' || lbl === '⊂') {
      if (!containedIn.has(e.source)) containedIn.set(e.source, e.target);
    } else if (lbl === '⊇' || lbl === '⊃') {
      if (!containedIn.has(e.target)) containedIn.set(e.target, e.source);
    } else if (lbl === '∈') {
      memberOf.set(e.source, e.target);
    }
  });

  const roots = containers.filter((c) => !containedIn.has(c.id));
  if (roots.length === 0) return radialLayout(items, w, h);

  const out = new Map<string, Pos>();
  const regions = new Map<string, Region>();
  const cx = w / 2;
  const cy = h / 2 + 14;

  const sortedRoots = [...roots].sort(
    (a, b) =>
      (containers.find((c) => c.id === b.id)?.contains.length ?? 0) -
      (containers.find((c) => c.id === a.id)?.contains.length ?? 0),
  );
  const outer = sortedRoots[0];
  const outerContainer = containers.find((c) => c.id === outer.id)!;

  const childContainersByParent = new Map<string, string[]>();
  containedIn.forEach((parentId, childId) => {
    if (!containerIds.has(childId)) return;
    const children = childContainersByParent.get(parentId) ?? [];
    children.push(childId);
    childContainersByParent.set(parentId, children);
  });
  const atomsForContainer = (containerId: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(containerId)) return new Set();
    seen.add(containerId);
    const container = containers.find((c) => c.id === containerId);
    const atomIds = new Set<string>();
    (container?.contains ?? []).forEach((childId) => {
      if (containerIds.has(childId)) {
        atomsForContainer(childId, seen).forEach((id) => atomIds.add(id));
      } else {
        atomIds.add(childId);
      }
    });
    (childContainersByParent.get(containerId) ?? []).forEach((childId) => {
      atomsForContainer(childId, seen).forEach((id) => atomIds.add(id));
    });
    return atomIds;
  };

  const outerAtomIds = atomsForContainer(outerContainer.id);
  const directAtoms = items.filter((it) => !it.id.startsWith('container:') && outerAtomIds.has(it.id));
  const r = Math.min(w, h) * 0.32;
  directAtoms.forEach((m, i) => {
    const angle = (Math.PI * 2 * i) / Math.max(directAtoms.length, 1) - Math.PI / 2;
    out.set(m.id, { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  });

  out.set(outer.id, { x: cx, y: cy });
  regions.set(outer.id, { cx, cy, rx: r + 36, ry: r + 36 });

  const innerContainers = containers.filter((c) => c.id !== outer.id);
  innerContainers.forEach((c) => {
    const memberPositions = c.contains
      .map((mid) => out.get(mid))
      .filter((p): p is Pos => !!p);
    if (memberPositions.length === 0) {
      out.set(c.id, { x: cx, y: cy });
      regions.set(c.id, { cx, cy, rx: 60, ry: 30 });
      return;
    }
    const xs = memberPositions.map((p) => p.x);
    const ys = memberPositions.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const innerCx = (minX + maxX) / 2;
    const innerCy = (minY + maxY) / 2;
    const padding = 30;
    const rx = Math.max((maxX - minX) / 2 + padding, 70);
    const ry = Math.max((maxY - minY) / 2 + padding, 40);
    out.set(c.id, { x: innerCx, y: innerCy - ry - 6 });
    regions.set(c.id, { cx: innerCx, cy: innerCy, rx, ry });
  });

  memberOf.forEach((targetId, sourceId) => {
    const targetRegion = regions.get(targetId) ?? regions.get(outer.id)!;
    if (!targetRegion) return;
    out.set(sourceId, {
      x: targetRegion.cx + targetRegion.rx * 0.55,
      y: targetRegion.cy - targetRegion.ry * 0.45,
    });
  });

  const orphans = items.filter((it) => !out.has(it.id));
  orphans.forEach((m, i) => {
    out.set(m.id, { x: w - 60 - i * 50, y: h - 30 });
  });
  return { positions: out, regions, pointMembers: new Set(memberOf.keys()) };
}

function toposLayout(items: DiagramNode[], containers: DiagramContainer[], edges: DiagramEdge[], w: number, h: number): LayoutResult {
  const out = new Map<string, Pos>();
  const containerIds = new Set(containers.map((c) => c.id));
  if (containers.length === 0) return dependencyLayout(items, edges, w, h);

  const inEdges = new Map<string, Set<string>>();
  const outEdgesC = new Map<string, Set<string>>();
  containers.forEach((c) => {
    inEdges.set(c.id, new Set());
    outEdgesC.set(c.id, new Set());
  });
  edges.forEach((e) => {
    if (!containerIds.has(e.source) || !containerIds.has(e.target)) return;
    if (e.source === e.target) return;
    outEdgesC.get(e.source)!.add(e.target);
    inEdges.get(e.target)!.add(e.source);
  });

  const rank = new Map<string, number>();
  const queue: string[] = [];
  containers.forEach((c) => {
    if (inEdges.get(c.id)!.size === 0) {
      rank.set(c.id, 0);
      queue.push(c.id);
    }
  });
  while (queue.length) {
    const id = queue.shift()!;
    const r0 = rank.get(id)!;
    for (const tgt of outEdgesC.get(id) ?? []) {
      const cur = rank.get(tgt);
      if (cur === undefined || cur < r0 + 1) {
        rank.set(tgt, r0 + 1);
        queue.push(tgt);
      }
    }
  }
  containers.forEach((c) => {
    if (!rank.has(c.id)) rank.set(c.id, 0);
  });

  const byRank = new Map<number, DiagramContainer[]>();
  containers.forEach((c) => {
    const r = rank.get(c.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(c);
  });
  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  const rowCount = Math.max(ranks.length, 1);
  const padX = 80;
  const padY = 56;
  const usableH = h - padY * 2 - 40;
  const rowStep = rowCount > 1 ? usableH / (rowCount - 1) : 0;

  ranks.forEach((r, rowIdx) => {
    const row = byRank.get(r)!;
    const colCount = row.length;
    const colStep = colCount > 1 ? (w - padX * 2) / (colCount - 1) : 0;
    const y = padY + rowIdx * rowStep;
    row.forEach((c, colIdx) => {
      const x = colCount > 1 ? padX + colIdx * colStep : w / 2;
      out.set(c.id, { x, y });
    });
  });

  const atoms = items.filter((it) => !it.id.startsWith('container:'));
  if (atoms.length > 0) {
    const stripY = h - 30;
    const stripStep = (w - padX * 2) / Math.max(atoms.length, 1);
    atoms.forEach((a, i) => {
      out.set(a.id, { x: padX + (i + 0.5) * stripStep, y: stripY });
    });
  }

  items
    .filter((it) => !out.has(it.id))
    .forEach((it, i) => {
      out.set(it.id, { x: w - 60 - i * 50, y: h - 30 });
    });
  return { positions: out };
}

function semanticLayout(items: DiagramNode[], containers: DiagramContainer[], edges: DiagramEdge[], w: number, h: number): LayoutResult {
  const out = new Map<string, Pos>();
  const bucketOf = (it: DiagramNode): string => {
    if (it.id.startsWith('container:')) {
      const c = containers.find((cc) => cc.id === it.id);
      return c?.element_type ? `set:${c.element_type}` : 'set';
    }
    return it.kind || 'other';
  };

  const laneOrder = [
    'set:noetic', 'set:domain', 'set:drive', 'set:register', 'set:state',
    'set',
    'noetic', 'domain', 'drive', 'register', 'state',
    'foundation', 'subfoundation', 'meta_set',
    'call', 'operator',
    'production_target', 'emergent',
    'other',
  ];

  const buckets = new Map<string, DiagramNode[]>();
  items.forEach((it) => {
    const key = bucketOf(it);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(it);
  });

  const presentLanes = [
    ...laneOrder.filter((k) => buckets.has(k)),
    ...[...buckets.keys()].filter((k) => !laneOrder.includes(k)),
  ];

  const numericLead = (s: string): number => {
    const m = s.match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
  };
  presentLanes.forEach((key) => {
    const arr = buckets.get(key)!;
    if (!key.startsWith('set')) {
      arr.sort((a, b) => numericLead(a.label) - numericLead(b.label) || a.label.localeCompare(b.label));
    }
  });

  const padX = 60;
  const padY = 56;
  const laneCount = Math.max(presentLanes.length, 1);
  const laneW = (w - padX * 2) / laneCount;
  const usableH = h - padY - 30;

  presentLanes.forEach((key, laneIdx) => {
    const arr = buckets.get(key)!;
    const cx = padX + laneW * (laneIdx + 0.5);
    const itemStep = usableH / Math.max(arr.length, 1);
    arr.forEach((it, i) => {
      out.set(it.id, { x: cx, y: padY + (i + 0.5) * itemStep });
    });
  });

  void edges;

  items
    .filter((it) => !out.has(it.id))
    .forEach((it, i) => {
      out.set(it.id, { x: w - 60 - i * 50, y: h - 30 });
    });
  return { positions: out };
}

function branchLayout(items: DiagramNode[], containers: DiagramContainer[], edges: DiagramEdge[], w: number, h: number): LayoutResult {
  const out = new Map<string, Pos>();
  const ids = new Set(items.map((it) => it.id));

  const children = new Map<string, string[]>();
  const parents = new Map<string, Set<string>>();
  const addEdge = (src: string, tgt: string) => {
    if (!ids.has(src) || !ids.has(tgt) || src === tgt) return;
    if (!children.has(src)) children.set(src, []);
    if (!children.get(src)!.includes(tgt)) children.get(src)!.push(tgt);
    if (!parents.has(tgt)) parents.set(tgt, new Set());
    parents.get(tgt)!.add(src);
  };
  containers.forEach((c) => {
    c.contains.forEach((childId) => addEdge(c.id, childId));
  });
  edges.forEach((e) => addEdge(e.source, e.target));

  const rootCandidates = items.filter((it) => (children.get(it.id)?.length ?? 0) > 0 && !(parents.get(it.id)?.size));
  let rootId: string | undefined = rootCandidates[0]?.id;
  if (!rootId) {
    const biggestContainer = [...containers].sort((a, b) => b.contains.length - a.contains.length)[0];
    rootId = biggestContainer?.id ?? items[0]?.id;
  }
  if (!rootId) return radialLayout(items, w, h);

  const depth = new Map<string, number>();
  depth.set(rootId, 0);
  const queue: string[] = [rootId];
  const visited = new Set<string>([rootId]);
  while (queue.length) {
    const id = queue.shift()!;
    const d = depth.get(id)!;
    for (const ch of children.get(id) ?? []) {
      if (!visited.has(ch)) {
        visited.add(ch);
        depth.set(ch, d + 1);
        queue.push(ch);
      } else {
        const cur = depth.get(ch) ?? 0;
        if (d + 1 > cur) depth.set(ch, d + 1);
      }
    }
  }
  const maxDepth = Math.max(0, ...depth.values());
  items.forEach((it) => {
    if (!depth.has(it.id)) depth.set(it.id, maxDepth + 1);
  });

  const byDepth = new Map<number, string[]>();
  items.forEach((it) => {
    const d = depth.get(it.id) ?? 0;
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(it.id);
  });
  const depthsSorted = [...byDepth.keys()].sort((a, b) => a - b);
  const padX = 60;
  const padY = 50;
  const layerCount = Math.max(depthsSorted.length, 1);
  const layerStep = layerCount > 1 ? (h - padY * 2) / (layerCount - 1) : 0;

  depthsSorted.forEach((d, layerIdx) => {
    const layer = byDepth.get(d)!;
    const cnt = layer.length;
    const colStep = cnt > 1 ? (w - padX * 2) / (cnt - 1) : 0;
    const y = padY + layerIdx * layerStep;
    layer.forEach((id, i) => {
      const x = cnt > 1 ? padX + i * colStep : w / 2;
      out.set(id, { x, y });
    });
  });

  items
    .filter((it) => !out.has(it.id))
    .forEach((it, i) => {
      out.set(it.id, { x: w - 60 - i * 50, y: h - 30 });
    });
  return { positions: out };
}

function compilerSpaceKind(item: DiagramNode): string {
  const kind = item.kind.toLowerCase();
  const role = String(item.role ?? '').toLowerCase();
  if (item.id.startsWith('container:')) return 'cas_expression';
  if (kind.includes('operator') || kind.includes('call')) return 'nl_bridge';
  if (kind.includes('emergent') || kind.includes('target') || role.includes('output')) {
    return 'model_generation';
  }
  if (kind.includes('fractal') || role.includes('step')) return 'slot_pattern';
  if (kind.includes('assert') || kind.includes('confidence')) return 'confidence_marker';
  return 'identifier_attempt';
}

function compilerTreeNode(item: DiagramNode): ThoughtTreeNode {
  const label = truncateLabel(item.label, 32);
  return {
    id: item.id,
    node_key: `compiler|${item.id}`,
    kind: compilerSpaceKind(item),
    role: String(item.role ?? item.kind),
    label,
    normalized_label: label.toLowerCase(),
    text: `${item.kind}${item.role ? ` / ${item.role}` : ''}: ${item.label}`,
  };
}

function buildCompilerSpaceTree(
  diagram: CasDiagram,
  displayItems: DiagramNode[],
  visibleEdges: DiagramEdge[],
): AtlasTraceThoughtTree {
  const rootId = 'compiler:root';
  const itemIds = new Set(displayItems.map((item) => item.id));
  const thoughtNodes = displayItems.map(compilerTreeNode);
  const nodeById = new Map(thoughtNodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, DiagramEdge[]>();
  const incoming = new Set<string>();

  visibleEdges.forEach((edge) => {
    if (!itemIds.has(edge.source) || !itemIds.has(edge.target)) return;
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
    incoming.add(edge.target);
  });

  const visited = new Set<string>();
  const makeRootNode = (id: string): ThoughtTreeRootNode | null => {
    const node = nodeById.get(id);
    if (!node || visited.has(id)) return null;
    visited.add(id);
    const children = (outgoing.get(id) ?? [])
      .map((edge) => makeRootNode(edge.target))
      .filter((child): child is ThoughtTreeRootNode => !!child);
    return {
      id: node.id,
      node_key: node.node_key,
      kind: node.kind,
      role: node.role,
      label: node.label,
      normalized_label: node.normalized_label,
      text: node.text,
      children,
    };
  };

  const roots = displayItems
    .filter((item) => !incoming.has(item.id))
    .map((item) => makeRootNode(item.id))
    .filter((node): node is ThoughtTreeRootNode => !!node);
  displayItems.forEach((item) => {
    const orphan = makeRootNode(item.id);
    if (orphan) roots.push(orphan);
  });

  const rootNode: ThoughtTreeNode = {
    id: rootId,
    node_key: rootId,
    kind: 'user_prompt',
    role: 'compiler',
    label: 'CAS structure graph',
    normalized_label: 'cas structure graph',
    text: `CAS diagram: ${diagram.kind}`,
  };

  const syntheticRootEdges: DiagramEdge[] = roots
    .map((node, index) => ({
      id: `compiler:root:${index}`,
      source: rootId,
      target: node.id ?? '',
      kind: 'root',
      label: '',
      directed: false,
    }))
    .filter((edge) => edge.target);

  return {
    root: {
      ...rootNode,
      children: roots,
    },
    nodes: [rootNode, ...thoughtNodes],
    edges: [
      ...syntheticRootEdges.map((edge) => ({
        id: edge.id,
        edge_key: edge.id,
        source: edge.source,
        target: edge.target,
        source_key: edge.source,
        target_key: edge.target,
        kind: edge.kind,
      })),
      ...visibleEdges
        .filter((edge) => itemIds.has(edge.source) && itemIds.has(edge.target))
        .map((edge) => ({
          id: edge.id,
          edge_key: `compiler|${edge.id}`,
          source: edge.source,
          target: edge.target,
          source_key: edge.source,
          target_key: edge.target,
          kind: edge.kind,
        })),
    ],
    node_count: thoughtNodes.length + 1,
    edge_count: visibleEdges.length + syntheticRootEdges.length,
  };
}

function mode7RootNode(sourceExpression?: string): ThoughtTreeNode {
  const source = sourceExpression?.trim() || 'CAS source';
  const label = truncateLabel(source, 36);
  return {
    id: 'n0',
    node_key: 'compiler-mode7|source',
    kind: 'user_prompt',
    role: 'compiler_mode7_source',
    label,
    normalized_label: label.toLowerCase(),
    text: `CAS source: ${source}`,
  };
}

function asRootNode(node: ThoughtTreeNode, children: ThoughtTreeRootNode[] = []): ThoughtTreeRootNode {
  return {
    id: node.id,
    node_key: node.node_key,
    kind: node.kind,
    role: node.role,
    label: node.label,
    normalized_label: node.normalized_label,
    axis_attrs: node.axis_attrs,
    text: node.text,
    children,
  };
}

function nestMode7Tree(
  rootNode: ThoughtTreeNode,
  nodes: ThoughtTreeNode[],
  edges: ThoughtTreeEdge[],
): AtlasTraceThoughtTree {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, ThoughtTreeEdge[]>();
  edges.forEach((edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) return;
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  });

  const visited = new Set<string>();
  const build = (id: string): ThoughtTreeRootNode | null => {
    const node = nodeById.get(id);
    if (!node || visited.has(id)) return null;
    visited.add(id);
    const children = (outgoing.get(id) ?? [])
      .map((edge) => build(edge.target))
      .filter((child): child is ThoughtTreeRootNode => !!child);
    return asRootNode(node, children);
  };

  const root = build(rootNode.id) ?? asRootNode(rootNode);
  const rootChildren = root.children ?? [];
  nodes.forEach((node) => {
    if (node.id === rootNode.id || visited.has(node.id)) return;
    const orphan = build(node.id);
    if (orphan) rootChildren.push(orphan);
  });
  root.children = rootChildren;

  return {
    root,
    nodes,
    edges,
    node_count: nodes.length,
    edge_count: edges.length,
  };
}

function edgeKey(source: string, target: string, kind: string): string {
  return `${source}|${target}|${kind}`;
}

type Mode7HeadCommit = Extract<SggsCommit, { kind: 'head_commit' }>;

const MODE7_STRUCTURAL_ATTR_KEYS = [
  'mode7_semantics',
  'structural_commit_linkage',
  'noetic',
  'domain',
  'drive',
  'register',
  'coefficient',
  'register_count',
  'prereq_count',
  'production_target',
  'confidence',
  'band',
  'pattern',
  'kind',
  'emergent',
  'evidence',
  'commit_evidence',
  'structural_commit_evidence',
  'source_span',
  'target_slot',
  'inferred_cas',
  'normalized_label',
  'role',
  'mechanistic_diagnostics',
];

const MODE7_TOKEN_ATTR_KEYS = [
  'load_bearing_tokens',
  'loadBearingTokens',
  'n_tokens',
  'token_count',
  'tokens',
  'source_tokens',
  'target_tokens',
  'token_indices',
  'input_position',
  'output_position',
  'position',
];

const MODE7_LAYER_ATTR_KEYS = [
  'activation_layers',
  'activation_hooks',
  'activation_summary',
  'per_head_attribution',
  'node_relevant_head_attribution',
  'domain_descent_attention',
  'layer',
  'layer_name',
  'layer_index',
  'layer_activations',
  'layer_activation_l2',
  'bottleneck_top_k',
  'attention_entropy_summary',
  'hook_status',
];

function isMode7HeadCommit(commit: SggsCommit): commit is Mode7HeadCommit {
  return commit.kind === 'head_commit';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactMode7Name(value: string): string {
  return value.replace(/_/g, ' ');
}

function formatMode7AttrValue(value: unknown, max = 34): string | null {
  let text: string | null = null;
  if (typeof value === 'string') {
    text = value.trim();
  } else if (typeof value === 'number') {
    text = Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  } else if (typeof value === 'boolean') {
    text = value ? 'true' : 'false';
  } else if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const previews = value.slice(0, 3).map((item) => {
      if (isRecord(item)) {
        const token = item.token ?? item.value ?? item.label ?? item.name ?? item.id;
        const index = item.index ?? item.position;
        const tokenText = formatMode7AttrValue(token, 16);
        const indexText = formatMode7AttrValue(index, 8);
        if (tokenText && indexText) return `${indexText}:${tokenText}`;
        return tokenText ?? formatMode7AttrValue(index, 16) ?? 'object';
      }
      return formatMode7AttrValue(item, 16) ?? 'item';
    });
    text = `${previews.join(', ')}${value.length > previews.length ? ` +${value.length - previews.length}` : ''}`;
  } else if (isRecord(value)) {
    const entries = Object.entries(value).filter(([, item]) => item !== null && item !== undefined);
    if (entries.length === 0) return null;
    text = entries
      .slice(0, 3)
      .map(([key, item]) => {
        const itemText = formatMode7AttrValue(item, 12);
        return itemText ? `${key}:${itemText}` : key;
      })
      .join(', ');
    if (entries.length > 3) text = `${text} +${entries.length - 3}`;
  }
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function mode7AttrPill(
  attrs: Record<string, unknown> | undefined,
  key: string,
  label = key.replace(/_/g, ' '),
): string | null {
  if (!attrs || !(key in attrs)) return null;
  const value = formatMode7AttrValue(attrs[key]);
  return value ? `${label}: ${value}` : null;
}

function collectMode7AttrPills(
  attrs: Record<string, unknown> | undefined,
  keys: string[],
  labelForKey?: (key: string) => string,
): string[] {
  if (!attrs) return [];
  return keys
    .map((key) => mode7AttrPill(attrs, key, labelForKey?.(key) ?? key.replace(/_/g, ' ')))
    .filter((pill): pill is string => !!pill);
}

function mode7TokenEvidence(attrs: Record<string, unknown> | undefined): string[] {
  return collectMode7AttrPills(attrs, MODE7_TOKEN_ATTR_KEYS, (key) => {
    if (key === 'n_tokens' || key === 'token_count') return 'tokens';
    if (key === 'input_position') return 'input token';
    if (key === 'output_position') return 'output token';
    if (key === 'position') return 'token position';
    return key.replace(/_/g, ' ');
  });
}

function mode7LayerEvidence(attrs: Record<string, unknown> | undefined): string[] {
  return collectMode7AttrPills(attrs, MODE7_LAYER_ATTR_KEYS, (key) => {
    if (key === 'layer_activations') return 'layers';
    if (key === 'layer_activation_l2') return 'layer L2';
    if (key === 'bottleneck_top_k') return 'bottleneck top-k';
    if (key === 'attention_entropy_summary') return 'attention entropy';
    if (key === 'hook_status') return 'hooks';
    return key.replace(/_/g, ' ');
  });
}

function uniqueMode7Pills(values: string[]): string[] {
  return [...new Set(values)];
}

function mode7StructuralEvidence(attrs: Record<string, unknown> | undefined): string[] {
  if (!attrs) return [];
  const structuredKeys = new Set(MODE7_STRUCTURAL_ATTR_KEYS);
  const tokenKeys = new Set(MODE7_TOKEN_ATTR_KEYS);
  const layerKeys = new Set(MODE7_LAYER_ATTR_KEYS);
  const supplementalKeys = Object.keys(attrs)
    .filter(
      (key) =>
        !structuredKeys.has(key) &&
        !tokenKeys.has(key) &&
        !layerKeys.has(key) &&
        key !== 'node_key',
    )
    .slice(0, 4);
  return uniqueMode7Pills([
    ...collectMode7AttrPills(attrs, MODE7_STRUCTURAL_ATTR_KEYS),
    ...collectMode7AttrPills(attrs, supplementalKeys),
  ]);
}

function mode7EvidencePills(attrs: Record<string, unknown> | undefined, max = 6): string[] {
  return uniqueMode7Pills([
    ...mode7TokenEvidence(attrs),
    ...mode7LayerEvidence(attrs),
    ...mode7StructuralEvidence(attrs),
  ]).slice(0, max);
}

function mode7NodeText(commit: Mode7HeadCommit, label: string): string {
  const evidence = mode7EvidencePills(commit.axis_attrs, 8);
  return [
    `Network attribution head ${commit.head_index + 1}: ${compactMode7Name(commit.head_name)}`,
    `Node: ${label}`,
    evidence.length ? `Evidence: ${evidence.join(' | ')}` : 'Evidence: structural commit received',
  ].join('\n');
}

function mode7NodeLabel(commit: Mode7HeadCommit): string {
  const head = compactMode7Name(commit.head_name);
  return truncateLabel(`H${commit.head_index + 1} ${head}: ${commit.node_label}`, 48);
}

function buildMode7TreeFromCommits(
  commits: SggsCommit[],
  sourceExpression: string | undefined,
): AtlasTraceThoughtTree {
  const rootNode = mode7RootNode(sourceExpression);
  const nodes = new Map<string, ThoughtTreeNode>([[rootNode.id, rootNode]]);
  const edges = new Map<string, ThoughtTreeEdge>();

  commits.forEach((commit) => {
    if (commit.kind === 'head_commit') {
      const label = mode7NodeLabel(commit);
      nodes.set(commit.node_id, {
        id: commit.node_id,
        node_key: `compiler-mode7|${commit.node_id}`,
        kind: commit.node_kind,
        role: commit.head_name,
        label,
        normalized_label: label.toLowerCase(),
        axis_attrs: commit.axis_attrs,
        text: mode7NodeText(commit, commit.node_label),
      });

      const parentId = commit.parent_node_id || rootNode.id;
      const id = `compiler-mode7:parent:${parentId}:${commit.node_id}`;
      edges.set(id, {
        id,
        edge_key: edgeKey(parentId, commit.node_id, 'parent_child'),
        source: parentId,
        target: commit.node_id,
        source_key: parentId,
        target_key: commit.node_id,
        kind: 'parent_child',
      });
      return;
    }

    if (commit.kind === 'edge_commit') {
      edges.set(commit.edge_id, {
        id: commit.edge_id,
        edge_key: edgeKey(commit.source_node_id, commit.target_node_id, commit.edge_kind),
        source: commit.source_node_id,
        target: commit.target_node_id,
        source_key: commit.source_node_id,
        target_key: commit.target_node_id,
        kind: commit.edge_kind,
      });
    }
  });

  return nestMode7Tree(rootNode, [...nodes.values()], [...edges.values()]);
}

function buildProgressiveCompilerMode7Tree(
  fallbackTree: AtlasTraceThoughtTree,
  visibleCount: number,
  sourceExpression?: string,
): AtlasTraceThoughtTree {
  const rootNode = mode7RootNode(sourceExpression);
  const originalRootId = fallbackTree.root.id ?? fallbackTree.nodes[0]?.id ?? 'compiler:root';
  const nonRootNodes = fallbackTree.nodes.filter((node) => node.id !== originalRootId);
  const visibleNodes = [
    rootNode,
    ...nonRootNodes.slice(0, Math.max(0, visibleCount - 1)),
  ];
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const edges: ThoughtTreeEdge[] = [
    ...fallbackTree.edges
      .filter((edge) => edge.source === originalRootId && visibleIds.has(edge.target))
      .map((edge, index) => ({
        ...edge,
        id: `compiler-mode7:root:${index}`,
        edge_key: `compiler-mode7:root:${index}`,
        source: rootNode.id,
        source_key: rootNode.node_key,
      })),
    ...fallbackTree.edges.filter(
      (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
    ),
  ];
  return nestMode7Tree(rootNode, visibleNodes, edges);
}

function commitIdentity(commit: SggsCommit): string {
  switch (commit.kind) {
    case 'turn_start':
      return `turn_start:${commit.turn_id}`;
    case 'head_commit':
      return `head_commit:${commit.turn_id}:${commit.node_id}`;
    case 'edge_commit':
      return `edge_commit:${commit.turn_id}:${commit.edge_id}`;
    case 'turn_end':
      return `turn_end:${commit.turn_id}:${commit.final_trace_id}`;
    case 'warning':
      return `warning:${commit.turn_id}:${commit.message}`;
    case 'error':
      return `error:${commit.turn_id}:${commit.code}:${commit.message}`;
  }
}

function compilerMode7StreamUrl(sourceExpression: string): string {
  const prompt = `Mode 7 trace for ${sourceExpression}`;
  return `${mode7LiveUrl({
    prompt,
    expression: sourceExpression,
    delayMs: 140,
  })}&surface=compiler`;
}

function sggsStatusLabel(status: SggsStreamStatus): string {
  switch (status) {
    case 'idle':
      return 'offline fallback';
    case 'connecting':
      return 'connecting';
    case 'open':
      return 'live stream';
    case 'closed':
      return 'stream closed';
    case 'error':
      return 'fallback active';
  }
}

function mode7EvidenceCount(commits: Mode7HeadCommit[], collector: (attrs: Record<string, unknown>) => string[]): number {
  return commits.reduce((count, commit) => count + (collector(commit.axis_attrs).length > 0 ? 1 : 0), 0);
}

function mode7SelectedNodeEvidence(node: ThoughtTreeNode | null): {
  tokens: string[];
  layers: string[];
  structural: string[];
} {
  return {
    tokens: mode7TokenEvidence(node?.axis_attrs),
    layers: mode7LayerEvidence(node?.axis_attrs),
    structural: mode7StructuralEvidence(node?.axis_attrs),
  };
}

function clipRay(from: Pos, to: Pos, shape: { kind: 'circle'; r: number } | { kind: 'rect'; w: number; h: number }): Pos {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return from;
  const ux = dx / dist;
  const uy = dy / dist;
  if (shape.kind === 'circle') {
    return { x: from.x + ux * shape.r, y: from.y + uy * shape.r };
  }
  const halfW = shape.w / 2;
  const halfH = shape.h / 2;
  const tx = ux === 0 ? Infinity : halfW / Math.abs(ux);
  const ty = uy === 0 ? Infinity : halfH / Math.abs(uy);
  const t = Math.min(tx, ty);
  return { x: from.x + ux * t, y: from.y + uy * t };
}

const LAYOUT_FAMILY: Record<string, string> = {
  containment: 'containment',
  topos: 'topos',
  grid: 'grid',
  petals: 'petals',
  fractal: 'fractal',
  radial: 'radial',
  branch: 'branch',
  semantic: 'semantic',
  dependency: 'dependency',
  recipe: 'dependency',
};

function computeLayout(
  layout: string,
  items: DiagramNode[],
  edges: DiagramEdge[],
  containers: DiagramContainer[],
  w: number,
  h: number,
): LayoutResult {
  const family = LAYOUT_FAMILY[layout] ?? layout;
  switch (family) {
    case 'grid':
      return gridLayout(items, containers, w, h);
    case 'petals':
      return petalLayout(items, containers, edges, w, h);
    case 'fractal':
      return fractalLayout(items, edges, w, h);
    case 'dependency':
      return dependencyLayout(items, edges, w, h);
    case 'containment':
      return containmentLayout(items, containers, edges, w, h);
    case 'topos':
      return toposLayout(items, containers, edges, w, h);
    case 'semantic':
      return semanticLayout(items, containers, edges, w, h);
    case 'branch':
      return branchLayout(items, containers, edges, w, h);
    case 'radial':
    default:
      return radialLayout(items, w, h);
  }
}

function CompilerMode7LiveView({
  fallbackTree,
  sourceExpression,
  fullscreen,
  selectedNodeId,
  onSelectNode,
}: {
  fallbackTree: AtlasTraceThoughtTree;
  sourceExpression?: string;
  fullscreen: boolean;
  selectedNodeId: string | null;
  onSelectNode: (node: ThoughtTreeNode) => void;
}) {
  const normalizedSource = sourceExpression?.trim() ?? '';
  const [commits, setCommits] = useState<SggsCommit[]>([]);
  const [streamMessage, setStreamMessage] = useState<string | null>(null);
  const [fallbackVisibleCount, setFallbackVisibleCount] = useState(1);
  const headCommits = useMemo(() => commits.filter(isMode7HeadCommit), [commits]);
  const hasLiveHeads = headCommits.length > 0;

  useEffect(() => {
    setCommits([]);
    setStreamMessage(null);
    setFallbackVisibleCount(1);
  }, [normalizedSource, fallbackTree]);

  useEffect(() => {
    if (hasLiveHeads) return;
    const maxNodes = Math.max(fallbackTree.nodes.length, 1);
    const id = window.setInterval(() => {
      setFallbackVisibleCount((cur) => (cur >= maxNodes ? cur : cur + 1));
    }, 180);
    return () => window.clearInterval(id);
  }, [hasLiveHeads, fallbackTree]);

  const streamUrl = useMemo(() => compilerMode7StreamUrl(normalizedSource), [normalizedSource]);
  const streamEnabled = normalizedSource.length > 0;

  const handleCommit = useCallback((commit: SggsCommit) => {
    setStreamMessage(null);
    setCommits((prev) => {
      if (commit.kind === 'turn_start') return [commit];
      const key = commitIdentity(commit);
      if (prev.some((item) => commitIdentity(item) === key)) return prev;
      return [...prev, commit].slice(-256);
    });
  }, []);

  const handleStreamError = useCallback((message: string) => {
    setStreamMessage(message);
  }, []);

  const stream = useSggsStream({
    url: streamUrl,
    enabled: streamEnabled,
    onCommit: handleCommit,
    onError: handleStreamError,
    eventSourceFactory: authenticatedSggsEventSource,
  });

  const tree = useMemo(() => {
    if (hasLiveHeads) {
      return buildMode7TreeFromCommits(commits, normalizedSource);
    }
    return buildProgressiveCompilerMode7Tree(fallbackTree, fallbackVisibleCount, normalizedSource);
  }, [commits, fallbackTree, fallbackVisibleCount, hasLiveHeads, normalizedSource]);

  const mode7NodeCount = Math.max(0, tree.node_count - 1);
  const tokenEvidenceCount = useMemo(
    () => mode7EvidenceCount(headCommits, mode7TokenEvidence),
    [headCommits],
  );
  const layerEvidenceCount = useMemo(
    () => mode7EvidenceCount(headCommits, mode7LayerEvidence),
    [headCommits],
  );
  const structuralEvidenceCount = useMemo(
    () => mode7EvidenceCount(headCommits, mode7StructuralEvidence),
    [headCommits],
  );
  const selectedNode = useMemo(
    () => (selectedNodeId ? tree.nodes.find((node) => node.id === selectedNodeId) ?? null : null),
    [selectedNodeId, tree.nodes],
  );
  const selectedEvidence = useMemo(() => mode7SelectedNodeEvidence(selectedNode), [selectedNode]);

  return (
    <div
      className={`relative w-full overflow-hidden rounded-[2px] bg-[#050b0a] ${
        fullscreen ? 'h-[calc(100vh-9rem)] min-h-[560px]' : 'h-[360px]'
      }`}
    >
      <SggsErrorBoundary>
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-[#86958d]">
              Loading Mode 7 mechanistic trace...
            </div>
          }
        >
          <CompilerSggsScene
            tree={tree}
            selectedNodeId={selectedNodeId}
            onNodeClick={onSelectNode}
            className="h-full w-full"
            fillParent
          />
        </Suspense>
      </SggsErrorBoundary>
      <div className="pointer-events-none absolute left-2 top-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-x-1 rounded-[2px] border border-[#20302b] bg-[#050b0a]/90 px-2 py-1 font-mono text-[9px] text-[#eaf3ee]">
        <span className="uppercase tracking-wider text-[#37f5a0]">Mode 7 Trace</span>
        <span className="mx-1 text-[#62706a]">|</span>
        <span>Network Attribution / Mechanistic Trace</span>
        <span className="mx-1 text-[#62706a]">|</span>
        <span>{sggsStatusLabel(streamEnabled ? stream.status : 'idle')}</span>
        <span className="mx-1 text-[#62706a]">|</span>
        <span>{hasLiveHeads ? `${headCommits.length} heads` : 'heads pending'}</span>
        <span className="mx-1 text-[#62706a]">|</span>
        <span>{tokenEvidenceCount > 0 ? `${tokenEvidenceCount} token refs` : 'tokens pending'}</span>
        <span className="mx-1 text-[#62706a]">|</span>
        <span>{layerEvidenceCount > 0 ? `${layerEvidenceCount} layer refs` : 'layers pending'}</span>
        <span className="mx-1 text-[#62706a]">|</span>
        <span>
          {structuralEvidenceCount > 0
            ? `${structuralEvidenceCount} structural commits`
            : `${mode7NodeCount} structural nodes`}
        </span>
        {stream.lastEventId && (
          <>
            <span className="mx-1 text-[#62706a]">|</span>
            <span>event {stream.lastEventId.slice(0, 8)}</span>
          </>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-2 left-2 max-w-[min(36rem,calc(100%-1rem))] rounded-[2px] border border-[#20302b] bg-[#050b0a]/85 px-2 py-1 font-mono text-[9px] text-[#b3c2ba]">
        Living Thought Atlas source: {normalizedSource || 'CAS diagram unavailable'}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-2 right-2 rounded-[2px] border border-[#20302b] bg-[#050b0a]/85 px-2 py-1 font-mono text-[9px] text-[#86958d]"
      >
        drag to orbit · wheel to zoom · head commits grow the trace
      </div>
      {streamMessage && commits.length === 0 && (
        <div className="pointer-events-none absolute right-2 top-2 max-w-[20rem] rounded-[2px] border border-[#f59e0b]/40 bg-[#0c1513] px-2 py-1 font-mono text-[9px] text-[#f59e0b]">
          network attribution stream unavailable; showing derived Living Thought Atlas trace
        </div>
      )}
      {selectedNode && (
        <div className="pointer-events-none absolute right-2 top-12 max-w-[min(24rem,calc(100%-1rem))] rounded-[2px] border border-[#37f5a0]/40 bg-[#0c1513]/95 p-2 font-mono text-[9px] text-[#eaf3ee]">
          <div className="mb-1 flex flex-wrap items-center gap-x-1 text-[#37f5a0]">
            <span className="uppercase tracking-wider">Selected mechanistic node</span>
            <span className="text-[#62706a]">|</span>
            <span>head: {compactMode7Name(selectedNode.role || selectedNode.kind)}</span>
          </div>
          <div className="text-[10px] text-[#eaf3ee]">{selectedNode.label}</div>
          <div className="mt-1 text-[#86958d]">kind: {compactMode7Name(selectedNode.kind)}</div>
          <div className="mt-2 grid gap-1">
            <div>
              <span className="text-[#37f5a0]">tokens</span>
              <span className="text-[#62706a]">: </span>
              <span>{selectedEvidence.tokens.length ? selectedEvidence.tokens.join(' | ') : 'no token attrs on this commit'}</span>
            </div>
            <div>
              <span className="text-[#37f5a0]">layers</span>
              <span className="text-[#62706a]">: </span>
              <span>{selectedEvidence.layers.length ? selectedEvidence.layers.join(' | ') : 'no layer attrs on this commit'}</span>
            </div>
            <div>
              <span className="text-[#37f5a0]">structural evidence</span>
              <span className="text-[#62706a]">: </span>
              <span>{selectedEvidence.structural.length ? selectedEvidence.structural.join(' | ') : 'commit metadata pending'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function DiagramPreview({
  diagram,
  result,
  sourceExpression,
}: {
  diagram?: CasDiagram | null;
  result?: Record<string, unknown> | null;
  sourceExpression?: string;
}) {
  const assertionHolds: boolean | undefined =
    result && (result as { kind?: string }).kind === 'meta_assertion'
      ? ((result as { holds?: boolean }).holds ?? undefined)
      : undefined;

  const availableLayouts = useMemo(() => {
    const seen = new Set<string>();
    const list = (diagram?.layouts ?? []).filter((layout) => {
      const family = LAYOUT_FAMILY[layout] ?? layout;
      if (seen.has(family)) return false;
      seen.add(family);
      return true;
    });
    if (list.includes('grid')) {
      return ['grid', ...list.filter((l) => l !== 'grid')];
    }
    if (list.includes('petals')) {
      return ['petals', ...list.filter((l) => l !== 'petals')];
    }
    if (list.includes('fractal')) {
      return ['fractal', ...list.filter((l) => l !== 'fractal')];
    }
    if ((diagram?.containers.length ?? 0) > 0 && list.includes('containment')) {
      return ['containment', ...list.filter((l) => l !== 'containment')];
    }
    return list;
  }, [diagram]);

  const [activeLayout, setActiveLayout] = useState<string>(availableLayouts[0] ?? 'radial');
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [diagramFullscreen, setDiagramFullscreen] = useState(false);
  const [bouncingNodeId, setBouncingNodeId] = useState<string | null>(null);
  const [diagramView, setDiagramView] = useState<'space' | 'map' | 'mode7'>('space');
  const [selectedSpaceNodeId, setSelectedSpaceNodeId] = useState<string | null>(null);
  const [selectedMode7NodeId, setSelectedMode7NodeId] = useState<string | null>(null);

  useEffect(() => {
    const onChange = () => {
      setDiagramFullscreen(document.fullscreenElement === previewRef.current);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleDiagramFullscreen = useCallback(() => {
    const el = previewRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) {
      void document.exitFullscreen?.();
    } else {
      void el.requestFullscreen?.();
    }
  }, []);

  const triggerNodeBounce = useCallback((id: string) => {
    setBouncingNodeId(id);
    window.setTimeout(() => {
      setBouncingNodeId((cur) => (cur === id ? null : cur));
    }, 360);
  }, []);

  const displayItems = useMemo<DiagramNode[]>(() => {
    if (!diagram) return [];
    return [
      ...diagram.containers.map((c) => ({
        id: c.id,
        kind: c.kind,
        label: `${c.label}${typeof c.cardinality === 'number' ? ` (${c.cardinality})` : ''}`,
        role: c.element_type,
      })),
      ...diagram.nodes,
    ].slice(0, 48);
  }, [diagram]);

  const visibleEdges = useMemo<DiagramEdge[]>(() => {
    if (!diagram) return [];
    const visibleIds = new Set(displayItems.map((item) => item.id));
    return diagram.edges
      .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
      .slice(0, 32);
  }, [diagram, displayItems]);

  const spaceTree = useMemo<AtlasTraceThoughtTree | null>(() => {
    if (!diagram) return null;
    return buildCompilerSpaceTree(diagram, displayItems, visibleEdges);
  }, [diagram, displayItems, visibleEdges]);

  useEffect(() => {
    if (availableLayouts.length && !availableLayouts.includes(activeLayout)) {
      setActiveLayout(availableLayouts[0]);
    }
    setSelectedSpaceNodeId(null);
    setSelectedMode7NodeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram]);

  if (!diagram || (diagram.nodes.length === 0 && diagram.containers.length === 0)) return null;

  const VIEW_W = 620;
  const VIEW_H = 360;
  const layoutResult = computeLayout(activeLayout, displayItems, diagram.edges, diagram.containers, VIEW_W, VIEW_H);
  const positions = layoutResult.positions;
  const regions = layoutResult.regions;
  const grid = layoutResult.grid;
  const petals = layoutResult.petals;
  const fractalBranches = layoutResult.fractalBranches ?? [];
  const pointMembers = layoutResult.pointMembers ?? new Set<string>();
  const useVenn = !!regions && regions.size > 0;
  const edgeStroke = assertionHolds === true ? '#37f5a0' : assertionHolds === false ? '#ff7b72' : '#22d3ee';
  const edgeAccent = assertionHolds === true ? 'fill-[#37f5a0]' : assertionHolds === false ? 'fill-[#ff7b72]' : 'fill-cyan-300';
  const truthBadge = assertionHolds === true ? '✓' : assertionHolds === false ? '✗' : '';

  return (
    <div
      ref={previewRef}
      className={`cas-spatial-graph mt-3 rounded-[2px] border border-[#20302b] bg-[#0c1513] p-3 ${
        diagramFullscreen ? 'min-h-screen overflow-auto bg-[#050b0a] p-4' : ''
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-mono text-[10px] font-medium uppercase tracking-wider text-[#86958d]">CAS Diagram</p>
        <span className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#37f5a0]">
          Spatial Gesture Graph
        </span>
        {availableLayouts.slice(0, 6).map((layout) => {
          const isActive = layout === activeLayout;
          return (
            <button
              key={layout}
              type="button"
              onClick={() => setActiveLayout(layout)}
              className={`rounded-[2px] border px-2 py-0.5 font-mono text-[9px] transition-colors ${
                isActive
                  ? 'border-[#37f5a0] bg-[#13201c] text-[#37f5a0]'
                  : 'border-[#20302b] bg-[#050b0a] text-[#86958d] hover:border-[#62706a] hover:text-[#eaf3ee]'
              }`}
            >
              {layout}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1 rounded-[2px] border border-[#20302b] bg-[#050b0a] p-0.5">
          {(['space', 'map', 'mode7'] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setDiagramView(view)}
              className={`rounded-[2px] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                diagramView === view
                  ? 'bg-[#37f5a0] text-[#050b0a] font-semibold'
                  : 'text-[#86958d] hover:text-[#eaf3ee]'
              }`}
            >
              {view === 'space' ? '3D Space' : view === 'map' ? '2D Map' : 'Mode 7 Trace'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleDiagramFullscreen}
          className="rounded-[2px] border border-[#20302b] bg-[#050b0a] px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[#b3c2ba] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0]"
        >
          {diagramFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
      </div>

      {diagramView === 'space' ? (
        <div
          className={`relative w-full overflow-hidden rounded-[2px] bg-[#050b0a] ${
            diagramFullscreen ? 'h-[calc(100vh-9rem)] min-h-[560px]' : 'h-[360px]'
          }`}
        >
          <SggsErrorBoundary>
            <Suspense
              fallback={
                <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-[#86958d]">
                  Loading 3D structure graph...
                </div>
              }
            >
              <CompilerSggsScene
                tree={spaceTree!}
                selectedNodeId={selectedSpaceNodeId}
                onNodeClick={(node) => {
                  setSelectedSpaceNodeId(node.id);
                  triggerNodeBounce(node.id);
                }}
                className="h-full w-full"
                fillParent
              />
            </Suspense>
          </SggsErrorBoundary>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 right-2 rounded-[2px] border border-[#20302b] bg-[#050b0a]/85 px-2 py-1 font-mono text-[9px] text-[#86958d]"
          >
            drag to orbit · wheel to zoom · click a box
          </div>
        </div>
      ) : diagramView === 'mode7' ? (
        <CompilerMode7LiveView
          fallbackTree={spaceTree!}
          sourceExpression={sourceExpression}
          fullscreen={diagramFullscreen}
          selectedNodeId={selectedMode7NodeId}
          onSelectNode={(node) => {
            setSelectedMode7NodeId(node.id);
            triggerNodeBounce(node.id);
          }}
        />
      ) : (
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className={`w-full rounded-[2px] bg-[#050b0a] ${
            diagramFullscreen ? 'h-[calc(100vh-9rem)] min-h-[520px]' : 'h-72'
          }`}
        >
          <defs>
            <marker id="cas-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto">
              <path d="M0,0 L9,4.5 L0,9 Z" fill={edgeStroke} />
            </marker>
          </defs>
          <g className="cas-spatial-float-layer">
            {grid && (
              <g>
                <rect
                  x={grid.x0}
                  y={grid.y0}
                  width={grid.cellW * Math.max(grid.cols.length, 1)}
                  height={grid.cellH * Math.max(grid.rows.length, 1)}
                  rx="2"
                  fill="#0c1513"
                  stroke="#37f5a0"
                  strokeOpacity="0.45"
                />
                {Array.from({ length: grid.cols.length + 1 }, (_, i) => (
                  <line
                    key={`grid-v-${i}`}
                    x1={grid.x0 + i * grid.cellW}
                    y1={grid.y0}
                    x2={grid.x0 + i * grid.cellW}
                    y2={grid.y0 + grid.cellH * grid.rows.length}
                    stroke="#37f5a0"
                    strokeOpacity="0.18"
                  />
                ))}
                {Array.from({ length: grid.rows.length + 1 }, (_, i) => (
                  <line
                    key={`grid-h-${i}`}
                    x1={grid.x0}
                    y1={grid.y0 + i * grid.cellH}
                    x2={grid.x0 + grid.cellW * grid.cols.length}
                    y2={grid.y0 + i * grid.cellH}
                    stroke="#37f5a0"
                    strokeOpacity="0.18"
                  />
                ))}
                {grid.rows.flatMap((_, row) =>
                  grid.cols.map((_, col) => (
                    <circle
                      key={`grid-cell-${row}-${col}`}
                      cx={grid.x0 + grid.cellW * (col + 0.5)}
                      cy={grid.y0 + grid.cellH * (row + 0.5)}
                      r="2.2"
                      fill="#37f5a0"
                      opacity="0.34"
                    />
                  )),
                )}
                <text x={grid.x0} y={grid.y0 - 48} className="fill-[#eaf3ee] text-[10px] font-semibold">
                  {grid.title}
                </text>
              </g>
            )}
            {petals && (
              <g>
                {petals.sectors.map((sector) => (
                  <path
                    key={`petal-${sector.id}`}
                    d={wedgePath(petals.cx, petals.cy, petals.innerR, petals.outerR, sector.start + 0.015, sector.end - 0.015)}
                    fill={`${sector.color}24`}
                    stroke={sector.color}
                    strokeOpacity="0.75"
                    strokeWidth="1.2"
                  />
                ))}
                <circle cx={petals.cx} cy={petals.cy} r={petals.innerR - 6} fill="#050b0a" stroke="#37f5a0" strokeOpacity="0.5" />
                <text x={petals.cx} y={petals.cy - 4} textAnchor="middle" className="fill-[#eaf3ee] text-[10px] font-semibold">
                  {petals.title}
                </text>
                <text x={petals.cx} y={petals.cy + 10} textAnchor="middle" className="fill-[#86958d] text-[8px]">
                  {petals.sectors.length} pieces
                </text>
              </g>
            )}
            {fractalBranches.map((branch, i) => (
              <line
                key={`fractal-branch-${i}`}
                x1={branch.x1}
                y1={branch.y1}
                x2={branch.x2}
                y2={branch.y2}
                stroke="#37f5a0"
                strokeWidth="1"
                strokeOpacity={branch.opacity}
              />
            ))}
            {useVenn &&
              [...regions!.entries()].map(([id, region]) => {
                const container = diagram.containers.find((c) => c.id === id);
                if (!container) return null;
                const color = diagramColor(container.kind);
                return (
                  <ellipse
                    key={`region-${id}`}
                    className="cas-spatial-region"
                    style={gestureNodeStyle(color)}
                    cx={region.cx}
                    cy={region.cy}
                    rx={region.rx}
                    ry={region.ry}
                    fill={`${color}15`}
                    stroke={color}
                    strokeWidth="1.4"
                    strokeDasharray="4 3"
                  />
                );
              })}
            {visibleEdges.map((edge) => {
              const a = positions.get(edge.source);
              const b = positions.get(edge.target);
              if (!a || !b) return null;
              const sourceItem = displayItems.find((it) => it.id === edge.source);
              const targetItem = displayItems.find((it) => it.id === edge.target);
              const sourceShape = edge.source.startsWith('container:')
                ? { kind: 'rect' as const, w: rectWidthFor(sourceItem?.label ?? ''), h: useVenn ? RECT_HEIGHT_PILL : RECT_HEIGHT_FULL }
                : { kind: 'circle' as const, r: ATOM_RADIUS };
              const targetShape = edge.target.startsWith('container:')
                ? { kind: 'rect' as const, w: rectWidthFor(targetItem?.label ?? ''), h: useVenn ? RECT_HEIGHT_PILL : RECT_HEIGHT_FULL }
                : { kind: 'circle' as const, r: ATOM_RADIUS };
              const start = clipRay(a, b, sourceShape);
              const end = clipRay(b, a, targetShape);
              const labelText = edge.label ? `${edge.label}${truthBadge ? ' ' + truthBadge : ''}` : '';
              return (
                <g key={edge.id}>
                  <line
                    x1={start.x}
                    y1={start.y}
                    x2={end.x}
                    y2={end.y}
                    stroke={edgeStroke}
                    strokeWidth="1.8"
                    strokeOpacity="0.95"
                    markerEnd={edge.directed === false ? undefined : 'url(#cas-arrow)'}
                  />
                  {labelText && (
                    <text x={(start.x + end.x) / 2} y={(start.y + end.y) / 2 - 4} textAnchor="middle" className={`${edgeAccent} text-[10px] font-semibold`}>
                      {labelText}
                    </text>
                  )}
                </g>
              );
            })}
            {displayItems.map((item, index) => {
              const pos = positions.get(item.id);
              if (!pos) return null;
              const color = diagramColor(item.kind, {
                noetic: typeof item.noetic === 'number' ? item.noetic : null,
                domain: typeof item.domain === 'string' ? item.domain : null,
                drive: typeof item.drive === 'number' ? item.drive : null,
              });
              const isContainer = item.id.startsWith('container:');
              const label = truncateLabel(item.label);
              if (isContainer) {
                if (pointMembers.has(item.id)) {
                  return (
                    <g key={item.id} transform={`translate(${pos.x}, ${pos.y})`}>
                      <g
                        className={`cas-gesture-node ${bouncingNodeId === item.id ? 'cas-gesture-node-bounce' : ''}`}
                        style={gestureNodeStyle(color, index)}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          triggerNodeBounce(item.id);
                        }}
                      >
                        <circle r={ATOM_RADIUS - 4} fill={`${color}26`} stroke={color} strokeWidth="1.4" />
                        <text y="3" textAnchor="middle" className="fill-[#eaf3ee] text-[9px] font-semibold">
                          {label.replace('NoeticCluster', 'NC').replace('StateCluster', 'SC').replace(/\(\d+\)/, '').slice(0, 6)}
                        </text>
                        <text y={ATOM_RADIUS + 8} textAnchor="middle" className="fill-[#b3c2ba] text-[8px]">
                          {label}
                        </text>
                      </g>
                    </g>
                  );
                }
                const w = rectWidthFor(item.label);
                const useVennPill = useVenn;
                const h = useVennPill ? RECT_HEIGHT_PILL : RECT_HEIGHT_FULL;
                return (
                  <g key={item.id} transform={`translate(${pos.x}, ${pos.y})`}>
                    <g
                      className={`cas-gesture-node ${bouncingNodeId === item.id ? 'cas-gesture-node-bounce' : ''}`}
                      style={gestureNodeStyle(color, index)}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        triggerNodeBounce(item.id);
                      }}
                    >
                      <rect
                        x={-w / 2}
                        y={-h / 2}
                        width={w}
                        height={h}
                        rx="2"
                        fill={useVennPill ? '#050b0a' : `${color}22`}
                        stroke={color}
                        strokeWidth={useVennPill ? 1.2 : 1.4}
                      />
                      <text y="3" textAnchor="middle" className="fill-[#eaf3ee] text-[10px] font-semibold">
                        {label}
                      </text>
                    </g>
                  </g>
                );
              }
              return (
                <g key={item.id} transform={`translate(${pos.x}, ${pos.y})`}>
                  <g
                    className={`cas-gesture-node ${bouncingNodeId === item.id ? 'cas-gesture-node-bounce' : ''}`}
                    style={gestureNodeStyle(color, index)}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      triggerNodeBounce(item.id);
                    }}
                  >
                    <circle r={ATOM_RADIUS} fill={`${color}26`} stroke={color} strokeWidth="1.4" />
                    <text y="3" textAnchor="middle" className="fill-[#eaf3ee] text-[10px] font-semibold">
                      {label}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>
        </svg>
      )}

      <div className="mt-2 grid gap-1 font-mono text-[10px] text-[#86958d] sm:grid-cols-3">
        <span>{diagram.nodes.length} nodes</span>
        <span>{diagram.edges.length} edges</span>
        <span>{diagram.containers.length} containment boxes</span>
      </div>
    </div>
  );
}

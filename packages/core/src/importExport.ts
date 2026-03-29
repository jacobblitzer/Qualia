import type { QualiaGraphJSON, NodeCore, Edge, Context, SDFFieldDef } from './types';
import type { Graph } from './Graph';

// ============================================================================
// Import
// ============================================================================

/**
 * Detect format and parse to QualiaGraphJSON.
 */
export function importGraph(input: string): QualiaGraphJSON {
  const trimmed = input.trim();

  // JSON detection
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);

    // Qualia v1 native format
    if (parsed.meta?.format === 'qualia-v1') {
      return parsed as QualiaGraphJSON;
    }

    // Obsidian .canvas format
    if (parsed.nodes && parsed.edges && parsed.nodes[0]?.type === 'text') {
      return importObsidianCanvas(parsed);
    }

    // Simple JSON (nodes + edges, no meta)
    return wrapSimpleJSON(parsed);
  }

  // CSV detection
  if (trimmed.includes(',') && !trimmed.startsWith('{')) {
    return importCSV(trimmed);
  }

  throw new Error('Unrecognized format');
}

/**
 * Wrap a simple { nodes, edges } JSON into QualiaGraphJSON.
 */
function wrapSimpleJSON(data: {
  nodes?: Array<{ id: string; label?: string; type?: string; [key: string]: unknown }>;
  edges?: Array<{ id?: string; source: string; target: string; type?: string; weight?: number; [key: string]: unknown }>;
  links?: Array<{ source: string; target: string; [key: string]: unknown }>;
}): QualiaGraphJSON {
  const nodes = (data.nodes ?? []).map((n, i) => {
    const { id: rawId, label: rawLabel, type: rawType, ...rest } = n;
    return {
      id: rawId ?? `n${i}`,
      type: rawType ?? 'default',
      label: rawLabel ?? rawId ?? `Node ${i}`,
      ...rest,
    };
  });

  const rawEdges = data.edges ?? data.links ?? [];
  const edges = rawEdges.map((e, i) => ({
    id: (e as { id?: string }).id ?? `e${i}`,
    source: typeof e.source === 'object' ? (e.source as { id: string }).id : e.source,
    target: typeof e.target === 'object' ? (e.target as { id: string }).id : e.target,
    type: (e as { type?: string }).type ?? 'default',
    weight: (e as { weight?: number }).weight,
  }));

  return {
    meta: {
      format: 'qualia-v1',
      title: 'Imported Graph',
      created: new Date().toISOString(),
    },
    nodeTypes: { default: { color: '#4488ff', icon: 'circle', baseRadius: 0.5 } },
    edgeTypes: { default: { color: '#336699', dash: [], defaultWeight: 1, directional: false } },
    nodes,
    contexts: [],
    edges,
  };
}

/**
 * Import CSV edge list: source,target[,type][,weight]
 */
function importCSV(csv: string): QualiaGraphJSON {
  const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const nodeSet = new Set<string>();
  const edges: Array<{ id: string; source: string; target: string; type: string; weight?: number }> = [];

  // Skip header if present
  let startIdx = 0;
  const firstLine = lines[0].toLowerCase();
  if (firstLine.includes('source') || firstLine.includes('from') || firstLine.includes('node')) {
    startIdx = 1;
  }

  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(',').map(p => p.trim());
    if (parts.length < 2) continue;
    const source = parts[0];
    const target = parts[1];
    const type = parts[2] || 'default';
    const weight = parts[3] ? parseFloat(parts[3]) : undefined;
    nodeSet.add(source);
    nodeSet.add(target);
    edges.push({ id: `e${i}`, source, target, type, weight });
  }

  const nodes = [...nodeSet].map(id => ({
    id,
    type: 'default',
    label: id,
  }));

  return {
    meta: {
      format: 'qualia-v1',
      title: 'CSV Import',
      created: new Date().toISOString(),
    },
    nodeTypes: { default: { color: '#4488ff', icon: 'circle', baseRadius: 0.5 } },
    edgeTypes: { default: { color: '#336699', dash: [], defaultWeight: 1, directional: false } },
    nodes,
    contexts: [],
    edges,
  };
}

/**
 * Import Obsidian .canvas format.
 */
function importObsidianCanvas(canvas: {
  nodes: Array<{ id: string; type: string; text?: string; x: number; y: number; width: number; height: number; color?: string }>;
  edges: Array<{ id: string; fromNode: string; toNode: string; label?: string }>;
}): QualiaGraphJSON {
  const nodes = canvas.nodes
    .filter(n => n.type === 'text')
    .map(n => ({
      id: n.id,
      type: 'note',
      label: (n.text ?? '').slice(0, 50).replace(/\n/g, ' '),
      notes: n.text,
    }));

  const edges = canvas.edges.map(e => ({
    id: e.id,
    source: e.fromNode,
    target: e.toNode,
    type: 'link',
    label: e.label,
  }));

  // Use canvas positions (scaled from px to world units)
  const positions: Record<string, [number, number, number]> = {};
  for (const n of canvas.nodes) {
    positions[n.id] = [n.x / 50, -n.y / 50, 0];
  }

  return {
    meta: {
      format: 'qualia-v1',
      title: 'Obsidian Canvas Import',
      created: new Date().toISOString(),
    },
    nodeTypes: { note: { color: '#aa88ff', icon: 'file', baseRadius: 0.5 } },
    edgeTypes: { link: { color: '#6644aa', dash: [], defaultWeight: 1, directional: true } },
    nodes,
    contexts: [{
      id: 'canvas',
      label: 'Canvas',
      edges: edges.map(e => ({ ...e, behavior: null, state: {} })),
      fields: [],
      layout: { algorithm: 'manual' },
      positions,
    }],
  };
}

// ============================================================================
// Export
// ============================================================================

/**
 * Export the graph as QualiaGraphJSON v1.
 */
export function exportQualiaJSON(graph: Graph): QualiaGraphJSON {
  const nodes = [...graph.nodes.values()].map(n => ({
    id: n.id,
    type: n.type,
    label: n.label,
    subtitle: n.subtitle,
    importance: n.importance,
    notes: n.notes,
    tags: n.tags,
    links: n.links,
    behavior: n.behavior,
    state: Object.keys(n.state).length > 0 ? n.state : undefined,
  }));

  const contexts = [...graph.contexts.values()].map(ctx => ({
    id: ctx.id,
    label: ctx.label,
    description: ctx.description,
    edges: ctx.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: e.type,
      weight: e.weight,
      label: e.label,
      confidence: e.confidence,
      notes: e.notes,
      behavior: e.behavior,
      state: Object.keys(e.state).length > 0 ? e.state : undefined,
    })),
    fields: ctx.fields,
    layout: ctx.layout,
    visualMapping: ctx.visualMapping,
    camera: ctx.camera,
    positions: ctx.positions,
  }));

  return {
    meta: {
      format: 'qualia-v1',
      title: 'Qualia Export',
      created: new Date().toISOString(),
    },
    nodeTypes: graph.nodeTypes,
    edgeTypes: graph.edgeTypes,
    nodes,
    contexts,
  };
}

/**
 * Export as Obsidian .canvas JSON.
 */
export function exportObsidianCanvas(graph: Graph): string {
  const allPositions = [...graph.contexts.values()][0]?.positions ?? {};

  const canvasNodes = [...graph.nodes.values()].map(n => {
    const pos = allPositions[n.id] ?? [0, 0, 0];
    return {
      id: n.id,
      type: 'text',
      text: n.notes ?? n.label,
      x: pos[0] * 50,
      y: -pos[1] * 50,
      width: 200,
      height: 100,
    };
  });

  const allEdges = [...graph.contexts.values()].flatMap(ctx => ctx.edges);
  const canvasEdges = allEdges.map(e => ({
    id: e.id,
    fromNode: e.source,
    toNode: e.target,
    label: e.label,
  }));

  return JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }, null, 2);
}

/**
 * Export as CSV edge list.
 */
export function exportCSV(graph: Graph): string {
  const lines = ['source,target,type,weight'];
  for (const ctx of graph.contexts.values()) {
    for (const e of ctx.edges) {
      lines.push(`${e.source},${e.target},${e.type},${e.weight ?? 1}`);
    }
  }
  return lines.join('\n');
}

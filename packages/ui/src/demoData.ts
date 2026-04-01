import type { EventStore, QualiaGraphJSON } from '@qualia/core';

/**
 * Inline demo graph for when the JSON file isn't available.
 */
export function createDemoGraph(store: EventStore): void {
  const json: QualiaGraphJSON = {
    meta: {
      format: 'qualia-v1',
      title: 'Demo Organization',
      description: 'A sample organizational graph with departments and social contexts',
      created: new Date().toISOString(),
    },
    nodeTypes: {
      person: { color: '#4488ff', icon: 'circle', baseRadius: 0.5 },
      team: { color: '#ff8844', icon: 'hexagon', baseRadius: 0.7 },
      project: { color: '#44cc88', icon: 'diamond', baseRadius: 0.6 },
    },
    edgeTypes: {
      reports_to: { color: '#6666aa', dash: [], defaultWeight: 1, directional: true },
      collaborates: { color: '#44aacc', dash: [], defaultWeight: 0.7, directional: false },
      mentors: { color: '#aa66cc', dash: [5, 5], defaultWeight: 0.5, directional: true },
      social: { color: '#cc8844', dash: [], defaultWeight: 0.5, directional: false },
    },
    nodes: [
      { id: 'alice', type: 'person', label: 'Alice', subtitle: 'CTO', importance: 0.9, tags: ['leadership', 'engineering'] },
      { id: 'bob', type: 'person', label: 'Bob', subtitle: 'VP Engineering', importance: 0.8, tags: ['leadership', 'engineering'] },
      { id: 'carol', type: 'person', label: 'Carol', subtitle: 'VP Design', importance: 0.8, tags: ['leadership', 'design'] },
      { id: 'dave', type: 'person', label: 'Dave', subtitle: 'Tech Lead', importance: 0.7, tags: ['engineering'] },
      { id: 'eve', type: 'person', label: 'Eve', subtitle: 'Senior Designer', importance: 0.7, tags: ['design'] },
      { id: 'frank', type: 'person', label: 'Frank', subtitle: 'Backend Dev', importance: 0.5, tags: ['engineering'] },
      { id: 'grace', type: 'person', label: 'Grace', subtitle: 'Frontend Dev', importance: 0.5, tags: ['engineering'] },
      { id: 'heidi', type: 'person', label: 'Heidi', subtitle: 'UX Researcher', importance: 0.6, tags: ['design', 'research'] },
      { id: 'ivan', type: 'person', label: 'Ivan', subtitle: 'DevOps', importance: 0.5, tags: ['engineering', 'ops'] },
      { id: 'judy', type: 'person', label: 'Judy', subtitle: 'PM', importance: 0.7, tags: ['product'] },
      { id: 'karl', type: 'person', label: 'Karl', subtitle: 'Data Scientist', importance: 0.6, tags: ['engineering', 'research'] },
      { id: 'lisa', type: 'person', label: 'Lisa', subtitle: 'QA Lead', importance: 0.6, tags: ['engineering', 'qa'] },
    ],
    contexts: [
      {
        id: 'hierarchy',
        label: 'Reporting Structure',
        description: 'Who reports to whom',
        edges: [
          { id: 'e1', source: 'bob', target: 'alice', type: 'reports_to', behavior: null, state: {} },
          { id: 'e2', source: 'carol', target: 'alice', type: 'reports_to', behavior: null, state: {} },
          { id: 'e3', source: 'dave', target: 'bob', type: 'reports_to', behavior: null, state: {} },
          { id: 'e4', source: 'frank', target: 'dave', type: 'reports_to', behavior: null, state: {} },
          { id: 'e5', source: 'grace', target: 'dave', type: 'reports_to', behavior: null, state: {} },
          { id: 'e6', source: 'ivan', target: 'bob', type: 'reports_to', behavior: null, state: {} },
          { id: 'e7', source: 'eve', target: 'carol', type: 'reports_to', behavior: null, state: {} },
          { id: 'e8', source: 'heidi', target: 'carol', type: 'reports_to', behavior: null, state: {} },
          { id: 'e9', source: 'judy', target: 'alice', type: 'reports_to', behavior: null, state: {} },
          { id: 'e10', source: 'karl', target: 'bob', type: 'reports_to', behavior: null, state: {} },
          { id: 'e11', source: 'lisa', target: 'dave', type: 'reports_to', behavior: null, state: {} },
        ],
        groups: [
          {
            id: 'f-eng', label: 'Engineering', nodeIds: ['bob', 'dave', 'frank', 'grace', 'ivan', 'karl', 'lisa'],
            color: [0.24, 0.47, 1.0],
            params: { radius: 8, blendFactor: 4, transparency: 0.6 },
          },
          {
            id: 'f-design', label: 'Design', nodeIds: ['carol', 'eve', 'heidi'],
            color: [1.0, 0.39, 0.63],
            params: { radius: 6, blendFactor: 3, transparency: 0.6 },
          },
        ],
        layout: { algorithm: 'force-directed' },
      },
      {
        id: 'social',
        label: 'Social Network',
        description: 'Who hangs out with whom',
        edges: [
          { id: 's1', source: 'alice', target: 'carol', type: 'social', weight: 0.9, behavior: null, state: {} },
          { id: 's2', source: 'bob', target: 'dave', type: 'social', weight: 0.8, behavior: null, state: {} },
          { id: 's3', source: 'frank', target: 'grace', type: 'social', weight: 0.9, behavior: null, state: {} },
          { id: 's4', source: 'eve', target: 'heidi', type: 'social', weight: 0.7, behavior: null, state: {} },
          { id: 's5', source: 'dave', target: 'ivan', type: 'social', weight: 0.6, behavior: null, state: {} },
          { id: 's6', source: 'judy', target: 'alice', type: 'social', weight: 0.7, behavior: null, state: {} },
          { id: 's7', source: 'grace', target: 'eve', type: 'social', weight: 0.5, behavior: null, state: {} },
          { id: 's8', source: 'karl', target: 'heidi', type: 'social', weight: 0.6, behavior: null, state: {} },
          { id: 's9', source: 'frank', target: 'karl', type: 'social', weight: 0.7, behavior: null, state: {} },
          { id: 's10', source: 'bob', target: 'judy', type: 'social', weight: 0.5, behavior: null, state: {} },
          { id: 's11', source: 'lisa', target: 'grace', type: 'social', weight: 0.8, behavior: null, state: {} },
          { id: 's12', source: 'ivan', target: 'frank', type: 'social', weight: 0.6, behavior: null, state: {} },
        ],
        groups: [
          {
            id: 'f-lunch', label: 'Lunch Crew', nodeIds: ['frank', 'grace', 'karl', 'ivan', 'lisa'],
            color: [1.0, 0.71, 0.16],
            params: { radius: 7, blendFactor: 3.5, transparency: 0.5 },
          },
          {
            id: 'f-coffee', label: 'Coffee Group', nodeIds: ['alice', 'carol', 'judy', 'eve'],
            color: [0.71, 0.31, 1.0],
            params: { radius: 6, blendFactor: 3, transparency: 0.5 },
          },
        ],
        layout: { algorithm: 'force-directed' },
      },
    ],
  };

  store.loadGraph(json);
}

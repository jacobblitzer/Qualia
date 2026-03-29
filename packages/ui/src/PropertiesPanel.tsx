import React from 'react';
import { useStore, useStoreVersion } from './StoreContext';

export function PropertiesPanel() {
  const store = useStore();
  const version = useStoreVersion();
  const selectedIds = [...store.state.selectedNodeIds];

  if (selectedIds.length === 0) {
    return (
      <div className="qualia-properties">
        <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 11, padding: '20px 0', textAlign: 'center' }}>
          Select a node to edit
        </div>
      </div>
    );
  }

  const nodeId = selectedIds[0];
  const node = store.state.nodes.get(nodeId);
  if (!node) return null;

  const updateField = (field: string, value: unknown) => {
    store.updateNode(nodeId, { [field]: value } as Record<string, unknown>);
  };

  return (
    <div className="qualia-properties">
      <div className="prop-section">
        <h3>Node</h3>

        <div className="prop-field">
          <label>Label</label>
          <input
            type="text"
            value={node.label}
            onChange={(e) => updateField('label', e.target.value)}
          />
        </div>

        <div className="prop-field">
          <label>Type</label>
          <select
            value={node.type}
            onChange={(e) => updateField('type', e.target.value)}
          >
            {Object.keys(store.state.nodeTypes).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
            <option value={node.type}>{node.type}</option>
          </select>
        </div>

        <div className="prop-field">
          <label>Subtitle</label>
          <input
            type="text"
            value={node.subtitle ?? ''}
            onChange={(e) => updateField('subtitle', e.target.value || undefined)}
          />
        </div>

        <div className="prop-field">
          <label>
            Importance
            <span className="slider-value">{(node.importance ?? 0.5).toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={node.importance ?? 0.5}
            onChange={(e) => updateField('importance', parseFloat(e.target.value))}
          />
        </div>

        <div className="prop-field">
          <label>Notes</label>
          <textarea
            value={node.notes ?? ''}
            onChange={(e) => updateField('notes', e.target.value || undefined)}
            rows={3}
          />
        </div>

        <div className="prop-field">
          <label>Tags</label>
          <input
            type="text"
            value={(node.tags ?? []).join(', ')}
            onChange={(e) => updateField('tags', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="tag1, tag2, ..."
          />
        </div>
      </div>

      {/* Links section */}
      {node.links && Object.keys(node.links).length > 0 && (
        <div className="prop-section">
          <h3>Links</h3>
          {Object.entries(node.links).map(([key, url]) => (
            <div key={key} className="prop-field">
              <label>{key}</label>
              <input type="text" value={url} readOnly />
            </div>
          ))}
        </div>
      )}

      {/* ID display */}
      <div className="prop-section">
        <h3>Info</h3>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', wordBreak: 'break-all' }}>
          ID: {node.id}
        </div>
      </div>

      {/* Delete button */}
      <div style={{ padding: '12px 0' }}>
        <button
          className="btn-danger"
          style={{ width: '100%' }}
          onClick={() => {
            store.removeNode(nodeId);
            store.clearSelection();
          }}
        >
          Delete Node
        </button>
      </div>
    </div>
  );
}

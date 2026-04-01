import React from 'react';
import { useStore, useStoreVersion } from './StoreContext';

export function ContextSwitcher() {
  const store = useStore();
  const version = useStoreVersion();
  const activeId = store.state.activeContextId;
  const contexts = [...store.state.contexts.values()];

  return (
    <div className="qualia-context-switcher">
      <button
        className={`context-tab superposition ${activeId === null ? 'active' : ''}`}
        onClick={() => store.switchContext(null)}
        title="Superposition: all contexts blended"
      >
        ALL
      </button>
      {contexts.map(ctx => (
        <button
          key={ctx.id}
          className={`context-tab ${activeId === ctx.id ? 'active' : ''}`}
          onClick={() => store.switchContext(ctx.id)}
        >
          <span
            className="context-dot"
            style={{
              background: ctx.groups[0]?.color
                ? `rgb(${ctx.groups[0].color.map((c: number) => Math.round(c * 255)).join(',')})`
                : 'var(--accent)',
            }}
          />
          {ctx.label}
        </button>
      ))}
    </div>
  );
}

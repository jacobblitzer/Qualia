import React, { useState } from 'react';
import type { QualiaRenderer } from '@qualia/renderer';
import { DISPLAY_MODES } from '@qualia/renderer';

interface ViewportToolbarProps {
  renderer: QualiaRenderer | null;
  onToggleSdfPanel: () => void;
  sdfPanelOpen: boolean;
}

export function ViewportToolbar({ renderer, onToggleSdfPanel, sdfPanelOpen }: ViewportToolbarProps) {
  const [activeMode, setActiveMode] = useState('default');
  const [showModes, setShowModes] = useState(false);

  const applyMode = (modeId: string) => {
    const mode = DISPLAY_MODES.find(m => m.id === modeId);
    if (mode && renderer) {
      renderer.applyDisplayMode(mode.settings);
      setActiveMode(modeId);
    }
    setShowModes(false);
  };

  return (
    <div className="viewport-toolbar">
      <button
        onClick={() => renderer?.fitToView(0.6)}
        title="Zoom All (A)"
      >
        Zoom All
      </button>
      <button
        onClick={() => renderer?.resetCamera(0.6)}
        title="Reset Camera (Home)"
      >
        Reset
      </button>
      <button
        onClick={() => renderer?.toggleGrid()}
        className={renderer?.gridVisible ? 'active' : ''}
        title="Toggle Grid"
      >
        Grid
      </button>
      <div className="toolbar-separator" />
      <div className="display-mode-container">
        <button
          onClick={() => setShowModes(v => !v)}
          className={showModes ? 'active' : ''}
          title="Display Modes (1-6)"
        >
          {DISPLAY_MODES.find(m => m.id === activeMode)?.label ?? 'Mode'}
        </button>
        {showModes && (
          <div className="display-mode-dropdown">
            {DISPLAY_MODES.map(mode => (
              <button
                key={mode.id}
                className={activeMode === mode.id ? 'active' : ''}
                onClick={() => applyMode(mode.id)}
              >
                <span className="mode-shortcut">{mode.shortcut}</span>
                {mode.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="toolbar-separator" />
      <button
        onClick={onToggleSdfPanel}
        className={sdfPanelOpen ? 'active' : ''}
        title="SDF Settings"
      >
        SDF
      </button>
    </div>
  );
}

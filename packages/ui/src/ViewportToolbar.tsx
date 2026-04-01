import React from 'react';
import type { QualiaRenderer } from '@qualia/renderer';

interface ViewportToolbarProps {
  renderer: QualiaRenderer | null;
  onToggleSettingsPanel: () => void;
  settingsPanelOpen: boolean;
}

export function ViewportToolbar({ renderer, onToggleSettingsPanel, settingsPanelOpen }: ViewportToolbarProps) {
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
      <button
        onClick={onToggleSettingsPanel}
        className={settingsPanelOpen ? 'active' : ''}
        title="Viewer Settings"
      >
        Settings
      </button>
    </div>
  );
}

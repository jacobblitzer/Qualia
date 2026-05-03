import React from 'react';
import type { QualiaRenderer } from '@qualia/renderer';

interface ViewportToolbarProps {
  renderer: QualiaRenderer | null;
  onToggleSettingsPanel: () => void;
  settingsPanelOpen: boolean;
  onTogglePerfPanel: () => void;
  perfPanelOpen: boolean;
  onToggleDisplayPanel: () => void;
  displayPanelOpen: boolean;
  onTogglePlanePanel: () => void;
  planePanelOpen: boolean;
  onSnapshot: () => void;
  snapshotBusy?: boolean;
}

export function ViewportToolbar({
  renderer,
  onToggleSettingsPanel,
  settingsPanelOpen,
  onTogglePerfPanel,
  perfPanelOpen,
  onToggleDisplayPanel,
  displayPanelOpen,
  onTogglePlanePanel,
  planePanelOpen,
  onSnapshot,
  snapshotBusy,
}: ViewportToolbarProps) {
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
      <button
        onClick={onTogglePerfPanel}
        className={perfPanelOpen ? 'active' : ''}
        title="Performance toggles (P)"
      >
        Perf
      </button>
      <button
        onClick={onToggleDisplayPanel}
        className={displayPanelOpen ? 'active' : ''}
        title="Node display (D)"
      >
        Display
      </button>
      <button
        onClick={onTogglePlanePanel}
        className={planePanelOpen ? 'active' : ''}
        title="Plane / levels (L)"
      >
        Plane
      </button>
      <div className="toolbar-separator" />
      <button
        onClick={onSnapshot}
        disabled={snapshotBusy}
        title="Capture debug snapshot — saves screenshot + settings to qualia-debug/, opens viewer in new tab (S)"
      >
        {snapshotBusy ? 'Snapshotting…' : 'Snapshot'}
      </button>
    </div>
  );
}

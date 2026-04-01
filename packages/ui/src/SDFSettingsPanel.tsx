import React, { useState, useCallback } from 'react';
import type { QualiaRenderer } from '@qualia/renderer';
import { CollapsibleSection } from './CollapsibleSection';

interface SDFSettingsPanelProps {
  renderer: QualiaRenderer;
  onClose: () => void;
}

interface Settings {
  nodeScale: number;
  emissiveIntensity: number;
  edgeOpacity: number;
  edgeWidth: number;
  ambientIntensity: number;
  fogDensity: number;
  fov: number;
  farPlane: number;
}

function Slider({ label, value, min, max, step, onChange, leftLabel, rightLabel, disabled }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  leftLabel?: string;
  rightLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="sdf-setting-row">
      <label>{label}</label>
      <div className="sdf-setting-control">
        {leftLabel && <span className="sdf-setting-hint">{leftLabel}</span>}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        {rightLabel
          ? <span className="sdf-setting-hint">{rightLabel}</span>
          : <span className="sdf-setting-value">{value.toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0)}</span>
        }
      </div>
    </div>
  );
}

export function SDFSettingsPanel({ renderer, onClose }: SDFSettingsPanelProps) {
  const [settings, setSettings] = useState<Settings>(() => {
    const s = renderer.getViewerSettings();
    return {
      nodeScale: s.nodeScale,
      emissiveIntensity: s.emissiveIntensity,
      edgeOpacity: s.edgeOpacity,
      edgeWidth: s.edgeWidth,
      ambientIntensity: s.ambientIntensity,
      fogDensity: s.fogDensity,
      fov: s.fov,
      farPlane: s.farPlane,
    };
  });

  const update = useCallback((key: keyof Settings, value: number) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      renderer.applyViewerSettings({ [key]: value });
      return next;
    });
  }, [renderer]);

  return (
    <div className="sdf-settings-panel">
      <div className="sdf-settings-header">
        <span>Viewer Settings</span>
        <button onClick={onClose} className="sdf-settings-close">&times;</button>
      </div>

      <div className="sdf-settings-body">
        <CollapsibleSection title="Nodes" defaultOpen={true}>
          <Slider label="Scale" value={settings.nodeScale} min={0.1} max={5} step={0.1} onChange={v => update('nodeScale', v)} />
          <Slider label="Emissive" value={settings.emissiveIntensity} min={0} max={2} step={0.05} onChange={v => update('emissiveIntensity', v)} />
        </CollapsibleSection>

        <CollapsibleSection title="Edges" defaultOpen={false}>
          <Slider label="Opacity" value={settings.edgeOpacity} min={0} max={1} step={0.05} onChange={v => update('edgeOpacity', v)} />
          <Slider label="Width" value={settings.edgeWidth} min={0.5} max={8} step={0.5} onChange={v => update('edgeWidth', v)} />
        </CollapsibleSection>

        <CollapsibleSection title="Environment" defaultOpen={false}>
          <Slider label="Ambient" value={settings.ambientIntensity} min={0} max={3} step={0.1} onChange={v => update('ambientIntensity', v)} />
          <Slider label="Fog Density" value={settings.fogDensity} min={0} max={0.01} step={0.0005} onChange={v => update('fogDensity', v)} />
        </CollapsibleSection>

        <CollapsibleSection title="Camera" defaultOpen={false}>
          <Slider label="FOV" value={settings.fov} min={20} max={120} step={1} onChange={v => update('fov', v)} />
          <Slider label="Far Plane" value={settings.farPlane} min={100} max={5000} step={100} onChange={v => update('farPlane', v)} />
        </CollapsibleSection>
      </div>
    </div>
  );
}

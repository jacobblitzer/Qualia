import React, { useState, useCallback, useEffect } from 'react';
import type { QualiaRenderer } from '@qualia/renderer';

interface SDFSettingsPanelProps {
  renderer: QualiaRenderer;
  onClose: () => void;
}

interface Settings {
  sdfIntensity: number;
  sdfResDivisor: number;
  nodeScale: number;
  emissiveIntensity: number;
  edgeOpacity: number;
  ambientIntensity: number;
  fogDensity: number;
  fov: number;
  farPlane: number;
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="sdf-setting-row">
      <label>{label}</label>
      <div className="sdf-setting-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span className="sdf-setting-value">{value.toFixed(step < 0.01 ? 4 : step < 1 ? 2 : 0)}</span>
      </div>
    </div>
  );
}

export function SDFSettingsPanel({ renderer, onClose }: SDFSettingsPanelProps) {
  const [settings, setSettings] = useState<Settings>(() => {
    const s = renderer.getViewerSettings();
    return {
      sdfIntensity: s.sdfIntensity,
      sdfResDivisor: s.sdfResDivisor,
      nodeScale: s.nodeScale,
      emissiveIntensity: s.emissiveIntensity,
      edgeOpacity: s.edgeOpacity,
      ambientIntensity: s.ambientIntensity,
      fogDensity: s.fogDensity,
      fov: s.fov,
      farPlane: s.farPlane,
    };
  });

  const update = useCallback((key: keyof Settings, value: number) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    renderer.applyViewerSettings({ [key]: value });
  }, [renderer]);

  return (
    <div className="sdf-settings-panel">
      <div className="sdf-settings-header">
        <span>Viewer Settings</span>
        <button onClick={onClose} className="sdf-settings-close">&times;</button>
      </div>

      <div className="sdf-settings-body">
        <div className="sdf-settings-section">
          <h4>SDF Fields</h4>
          <Slider label="Intensity" value={settings.sdfIntensity} min={0} max={1} step={0.05} onChange={v => update('sdfIntensity', v)} />
          <div className="sdf-setting-row">
            <label>Resolution</label>
            <div className="sdf-setting-control">
              <select
                className="sdf-res-select"
                value={settings.sdfResDivisor}
                onChange={(e) => update('sdfResDivisor', parseInt(e.target.value))}
              >
                <option value={1}>Full (1x)</option>
                <option value={2}>Half (1/2)</option>
                <option value={4}>Quarter (1/4)</option>
                <option value={8}>Eighth (1/8)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="sdf-settings-section">
          <h4>Nodes</h4>
          <Slider label="Scale" value={settings.nodeScale} min={0.1} max={5} step={0.1} onChange={v => update('nodeScale', v)} />
          <Slider label="Emissive" value={settings.emissiveIntensity} min={0} max={2} step={0.05} onChange={v => update('emissiveIntensity', v)} />
        </div>

        <div className="sdf-settings-section">
          <h4>Edges</h4>
          <Slider label="Opacity" value={settings.edgeOpacity} min={0} max={1} step={0.05} onChange={v => update('edgeOpacity', v)} />
        </div>

        <div className="sdf-settings-section">
          <h4>Environment</h4>
          <Slider label="Ambient" value={settings.ambientIntensity} min={0} max={3} step={0.1} onChange={v => update('ambientIntensity', v)} />
          <Slider label="Fog Density" value={settings.fogDensity} min={0} max={0.01} step={0.0005} onChange={v => update('fogDensity', v)} />
        </div>

        <div className="sdf-settings-section">
          <h4>Camera</h4>
          <Slider label="FOV" value={settings.fov} min={20} max={120} step={1} onChange={v => update('fov', v)} />
          <Slider label="Far Plane" value={settings.farPlane} min={100} max={5000} step={100} onChange={v => update('farPlane', v)} />
        </div>
      </div>
    </div>
  );
}

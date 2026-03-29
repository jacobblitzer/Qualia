import React, { useState, useCallback } from 'react';
import type { QualiaRenderer } from '@qualia/renderer';

interface SDFSettingsPanelProps {
  renderer: QualiaRenderer;
  onClose: () => void;
}

interface Settings {
  sdfIntensity: number;
  sdfResDivisor: number;
  opacityBoost: number;
  blendMode: number;
  fresnelStrength: number;
  renderOrder: string;
  nodeScale: number;
  emissiveIntensity: number;
  edgeOpacity: number;
  edgeWidth: number;
  ambientIntensity: number;
  fogDensity: number;
  fov: number;
  farPlane: number;
  noiseEnabled: boolean;
  noiseGlobal: number;
  contoursEnabled: boolean;
}

function Slider({ label, value, min, max, step, onChange, leftLabel, rightLabel }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  leftLabel?: string;
  rightLabel?: string;
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
      sdfIntensity: s.sdfIntensity,
      sdfResDivisor: s.sdfResDivisor,
      opacityBoost: s.opacityBoost,
      blendMode: s.blendMode,
      fresnelStrength: s.fresnelStrength,
      renderOrder: s.renderOrder,
      nodeScale: s.nodeScale,
      emissiveIntensity: s.emissiveIntensity,
      edgeOpacity: s.edgeOpacity,
      edgeWidth: s.edgeWidth,
      ambientIntensity: s.ambientIntensity,
      fogDensity: s.fogDensity,
      fov: s.fov,
      farPlane: s.farPlane,
      noiseEnabled: false,
      noiseGlobal: 0.5,
      contoursEnabled: false,
    };
  });

  const update = useCallback((key: keyof Settings, value: number | string | boolean) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      // For noise, send both enabled and global together
      if (key === 'noiseEnabled' || key === 'noiseGlobal') {
        const enabled = key === 'noiseEnabled' ? value as boolean : prev.noiseEnabled;
        const global = key === 'noiseGlobal' ? value as number : prev.noiseGlobal;
        renderer.applyViewerSettings({ noiseEnabled: enabled, noiseGlobal: global });
      } else {
        renderer.applyViewerSettings({ [key]: value });
      }
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
        <div className="sdf-settings-section">
          <h4>SDF Fields</h4>
          <Slider label="Intensity" value={settings.sdfIntensity} min={0} max={1} step={0.05} onChange={v => update('sdfIntensity', v)} />
          <Slider label="Opacity" value={settings.opacityBoost} min={0} max={1} step={0.05} onChange={v => update('opacityBoost', v)} leftLabel="Glow" rightLabel="Solid" />
          <Slider label="Blend" value={settings.blendMode} min={0} max={1} step={0.05} onChange={v => update('blendMode', v)} leftLabel="Add" rightLabel="Alpha" />
          <Slider label="Fresnel" value={settings.fresnelStrength} min={0} max={3} step={0.1} onChange={v => update('fresnelStrength', v)} />
          <div className="sdf-setting-row">
            <label>Resolution</label>
            <div className="sdf-setting-control">
              <select
                className="sdf-res-select"
                value={settings.sdfResDivisor}
                onChange={(e) => update('sdfResDivisor', parseFloat(e.target.value))}
              >
                <option value={0.5}>Super (2x)</option>
                <option value={1}>Full (1x)</option>
                <option value={2}>Half (1/2)</option>
                <option value={4}>Quarter (1/4)</option>
                <option value={8}>Eighth (1/8)</option>
              </select>
            </div>
          </div>
          <div className="sdf-setting-row">
            <label>Render</label>
            <div className="sdf-setting-control">
              <select
                className="sdf-res-select"
                value={settings.renderOrder}
                onChange={(e) => update('renderOrder', e.target.value)}
              >
                <option value="sdf-behind">SDF Behind</option>
                <option value="sdf-opaque-behind">SDF + Graph Overlay</option>
              </select>
            </div>
          </div>
        </div>

        <div className="sdf-settings-section">
          <h4>SDF Effects</h4>
          <div className="sdf-setting-row">
            <label>Noise</label>
            <div className="sdf-setting-control">
              <input
                type="checkbox"
                checked={settings.noiseEnabled}
                onChange={(e) => update('noiseEnabled', e.target.checked)}
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.noiseGlobal}
                disabled={!settings.noiseEnabled}
                onChange={(e) => update('noiseGlobal', parseFloat(e.target.value))}
              />
              <span className="sdf-setting-value">{settings.noiseGlobal.toFixed(2)}</span>
            </div>
          </div>
          <div className="sdf-setting-row">
            <label>Contours</label>
            <div className="sdf-setting-control">
              <input
                type="checkbox"
                checked={settings.contoursEnabled}
                onChange={(e) => update('contoursEnabled', e.target.checked)}
              />
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
          <Slider label="Width" value={settings.edgeWidth} min={0.5} max={8} step={0.5} onChange={v => update('edgeWidth', v)} />
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

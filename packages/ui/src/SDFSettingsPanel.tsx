import React, { useState, useCallback } from 'react';
import type { QualiaRenderer } from '@qualia/renderer';
import { CollapsibleSection } from './CollapsibleSection';

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
  // PBR
  specularStrength: number;
  roughness: number;
  metalness: number;
  // Domain warp
  warpEnabled: boolean;
  warpAmount: number;
  warpScale: number;
  warpSpeed: number;
  // Onion layers
  onionEnabled: boolean;
  onionLayers: number;
  onionThickness: number;
  onionGap: number;
  // Interior fog
  interiorFogEnabled: boolean;
  interiorFogDensity: number;
  // Color blending
  colorBlendSharpness: number;
  // Fine noise
  noiseScale: number;
  noiseSpeed: number;
  // Fine contour
  contourSpacing: number;
  contourWidth: number;
  contourContrast: number;
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
      // PBR (off by default)
      specularStrength: s.specularStrength ?? 0,
      roughness: s.roughness ?? 0.6,
      metalness: s.metalness ?? 0,
      // Domain warp
      warpEnabled: s.warpEnabled,
      warpAmount: s.warpAmount,
      warpScale: s.warpScale,
      warpSpeed: s.warpSpeed,
      // Onion
      onionEnabled: s.onionEnabled,
      onionLayers: s.onionLayers,
      onionThickness: s.onionThickness,
      onionGap: s.onionGap,
      // Interior fog
      interiorFogEnabled: s.interiorFogEnabled,
      interiorFogDensity: s.interiorFogDensity,
      // Color blend
      colorBlendSharpness: s.colorBlendSharpness,
      // Fine noise
      noiseScale: s.noiseScale,
      noiseSpeed: s.noiseSpeed,
      // Fine contour
      contourSpacing: s.contourSpacing,
      contourWidth: s.contourWidth,
      contourContrast: s.contourContrast,
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
        <CollapsibleSection title="SDF Fields" defaultOpen={true}>
          <Slider label="Intensity" value={settings.sdfIntensity} min={0} max={1} step={0.05} onChange={v => update('sdfIntensity', v)} />
          <Slider label="Opacity" value={settings.opacityBoost} min={0} max={1} step={0.05} onChange={v => update('opacityBoost', v)} leftLabel="Glow" rightLabel="Solid" />
          <Slider label="Blend" value={settings.blendMode} min={0} max={1} step={0.05} onChange={v => update('blendMode', v)} leftLabel="Add" rightLabel="Alpha" />
          <Slider label="Fresnel" value={settings.fresnelStrength} min={0} max={3} step={0.1} onChange={v => update('fresnelStrength', v)} />
          <Slider label="Color Blend" value={settings.colorBlendSharpness} min={0} max={20} step={0.5} onChange={v => update('colorBlendSharpness', v)} leftLabel="Smooth" rightLabel="Sharp" />
          <div className="sdf-setting-row">
            <label>Resolution</label>
            <div className="sdf-setting-control">
              <select
                className="sdf-res-select"
                value={settings.sdfResDivisor}
                onChange={(e) => update('sdfResDivisor', parseFloat(e.target.value))}
              >
                <option value={0.5}>Super (2x)</option>
                <option value={0.667}>High (1.5x)</option>
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
        </CollapsibleSection>

        <CollapsibleSection title="SDF Material" defaultOpen={false}>
          <Slider label="Specular" value={settings.specularStrength} min={0} max={1} step={0.05} onChange={v => update('specularStrength', v)} />
          <Slider label="Roughness" value={settings.roughness} min={0} max={1} step={0.05} onChange={v => update('roughness', v)} leftLabel="Mirror" rightLabel="Diffuse" />
          <Slider label="Metalness" value={settings.metalness} min={0} max={1} step={0.05} onChange={v => update('metalness', v)} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Noise"
          defaultOpen={false}
          enabled={settings.noiseEnabled}
          onToggleEnabled={(v) => update('noiseEnabled', v)}
        >
          <Slider label="Amount" value={settings.noiseGlobal} min={0} max={1} step={0.05} onChange={v => update('noiseGlobal', v)} disabled={!settings.noiseEnabled} />
          <Slider label="Scale" value={settings.noiseScale} min={0.01} max={1} step={0.01} onChange={v => update('noiseScale', v)} disabled={!settings.noiseEnabled} />
          <Slider label="Speed" value={settings.noiseSpeed} min={0} max={0.5} step={0.01} onChange={v => update('noiseSpeed', v)} disabled={!settings.noiseEnabled} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Contours"
          defaultOpen={false}
          enabled={settings.contoursEnabled}
          onToggleEnabled={(v) => update('contoursEnabled', v)}
        >
          <Slider label="Spacing" value={settings.contourSpacing} min={0} max={5} step={0.1} onChange={v => update('contourSpacing', v)} disabled={!settings.contoursEnabled} />
          <Slider label="Width" value={settings.contourWidth} min={0} max={1} step={0.05} onChange={v => update('contourWidth', v)} disabled={!settings.contoursEnabled} />
          <Slider label="Contrast" value={settings.contourContrast} min={0} max={1} step={0.05} onChange={v => update('contourContrast', v)} disabled={!settings.contoursEnabled} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Domain Warp"
          defaultOpen={false}
          enabled={settings.warpEnabled}
          onToggleEnabled={(v) => update('warpEnabled', v)}
        >
          <Slider label="Amount" value={settings.warpAmount} min={0} max={10} step={0.1} onChange={v => update('warpAmount', v)} disabled={!settings.warpEnabled} />
          <Slider label="Scale" value={settings.warpScale} min={0.01} max={0.5} step={0.01} onChange={v => update('warpScale', v)} disabled={!settings.warpEnabled} />
          <Slider label="Speed" value={settings.warpSpeed} min={0} max={0.5} step={0.01} onChange={v => update('warpSpeed', v)} disabled={!settings.warpEnabled} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Onion Layers"
          defaultOpen={false}
          enabled={settings.onionEnabled}
          onToggleEnabled={(v) => update('onionEnabled', v)}
        >
          <Slider label="Layers" value={settings.onionLayers} min={1} max={10} step={1} onChange={v => update('onionLayers', v)} disabled={!settings.onionEnabled} />
          <Slider label="Thickness" value={settings.onionThickness} min={0.05} max={2} step={0.05} onChange={v => update('onionThickness', v)} disabled={!settings.onionEnabled} />
          <Slider label="Gap" value={settings.onionGap} min={0.1} max={5} step={0.1} onChange={v => update('onionGap', v)} disabled={!settings.onionEnabled} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Interior Fog"
          defaultOpen={false}
          enabled={settings.interiorFogEnabled}
          onToggleEnabled={(v) => update('interiorFogEnabled', v)}
        >
          <Slider label="Density" value={settings.interiorFogDensity} min={0} max={2} step={0.05} onChange={v => update('interiorFogDensity', v)} disabled={!settings.interiorFogEnabled} />
        </CollapsibleSection>

        <CollapsibleSection title="Nodes" defaultOpen={false}>
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

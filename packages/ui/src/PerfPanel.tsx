import React, { useState, useCallback, useEffect } from 'react';
import type { QualiaRenderer, PerfSettings } from '@qualia/renderer';

interface PerfPanelProps {
  renderer: QualiaRenderer;
  onClose: () => void;
}

interface ToggleProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function Toggle({ label, hint, value, onChange }: ToggleProps) {
  return (
    <label className="perf-toggle-row">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="perf-toggle-label">
        {label}
        {hint && <span className="perf-toggle-hint"> — {hint}</span>}
      </span>
    </label>
  );
}

interface SliderProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

function Slider({ label, hint, value, min, max, step, onChange, format }: SliderProps) {
  return (
    <div className="perf-slider-row">
      <label className="perf-slider-label">
        {label}
        {hint && <span className="perf-toggle-hint"> — {hint}</span>}
      </label>
      <div className="perf-slider-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <span className="perf-slider-value">
          {format ? format(value) : value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
    </div>
  );
}

export function PerfPanel({ renderer, onClose }: PerfPanelProps) {
  const [perf, setPerf] = useState<PerfSettings>(() => renderer.getPerfSettings());
  const [fps, setFps] = useState<number>(0);

  // Tiny FPS estimator — reads requestAnimationFrame ticks. Cheap.
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const update = useCallback(<K extends keyof PerfSettings>(key: K, value: PerfSettings[K]) => {
    setPerf((prev) => {
      const next = { ...prev, [key]: value };
      renderer.setPerfSettings({ [key]: value } as Partial<PerfSettings>);
      return next;
    });
  }, [renderer]);

  const allOff = useCallback(() => {
    const next: Partial<PerfSettings> = {
      penumbraEnabled: false,
      skeletonNodesEnabled: false,
      skeletonEdgesEnabled: false,
      halosEnabled: false,
      labelsVisible: false,
      gridVisible: false,
    };
    renderer.setPerfSettings(next);
    setPerf((prev) => ({ ...prev, ...next }));
  }, [renderer]);

  const allOn = useCallback(() => {
    const next: Partial<PerfSettings> = {
      penumbraEnabled: true,
      skeletonNodesEnabled: true,
      skeletonEdgesEnabled: true,
      halosEnabled: true,
      nodesVisible: true,
      edgesVisible: true,
      labelsVisible: true,
      gridVisible: true,
      penumbraRenderInterval: 1,
      penumbraResolutionScale: 1.0,
    };
    renderer.setPerfSettings(next);
    setPerf((prev) => ({ ...prev, ...next }));
  }, [renderer]);

  return (
    <div className="perf-panel">
      <div className="perf-panel-header">
        <span>Performance</span>
        <span className="perf-fps">{fps} fps</span>
        <button onClick={onClose} className="perf-panel-close">&times;</button>
      </div>

      <div className="perf-panel-body">
        <div className="perf-quick-actions">
          <button onClick={allOff} title="Turn off everything expensive">Minimal</button>
          <button onClick={allOn} title="Restore defaults">All on</button>
        </div>

        <div className="perf-section">
          <div className="perf-section-title">Penumbra (SDF backdrop)</div>
          <Toggle
            label="Enabled"
            hint="master switch — biggest perf hit"
            value={perf.penumbraEnabled}
            onChange={(v) => update('penumbraEnabled', v)}
          />
          <Toggle
            label="Skeleton edges"
            hint="capsule per graph edge — smooth-unioned, expensive"
            value={perf.skeletonEdgesEnabled}
            onChange={(v) => update('skeletonEdgesEnabled', v)}
          />
          <Toggle
            label="Skeleton nodes"
            hint="sphere per node"
            value={perf.skeletonNodesEnabled}
            onChange={(v) => update('skeletonNodesEnabled', v)}
          />
          <Toggle
            label="Group halos"
            hint="point-cloud per group, color overlay"
            value={perf.halosEnabled}
            onChange={(v) => update('halosEnabled', v)}
          />
          <Slider
            label="Halo radius"
            hint="<1 = halos inside group; >1 = halos engulf skeleton"
            value={perf.haloRadiusMultiplier}
            min={0}
            max={2.0}
            step={0.05}
            onChange={(v) => update('haloRadiusMultiplier', v)}
          />
          <Slider
            label="Skeleton blend"
            hint="0 = sharp primitives; high = nodes/edges fuse"
            value={perf.skeletonBlend}
            min={0}
            max={1.0}
            step={0.01}
            onChange={(v) => update('skeletonBlend', v)}
          />
          <Toggle
            label="Smooth halo blend"
            hint="adjacent group halos flow into each other"
            value={perf.smoothHaloBlend}
            onChange={(v) => update('smoothHaloBlend', v)}
          />
          <Slider
            label="Halo blend radius"
            hint="active when smooth halo blend is on"
            value={perf.haloBlendRadius}
            min={0}
            max={2.0}
            step={0.05}
            onChange={(v) => update('haloBlendRadius', v)}
          />
          <Toggle
            label="Edges in halo"
            hint="capsule tubes along edges within each group's halo"
            value={perf.edgesInHalo}
            onChange={(v) => update('edgesInHalo', v)}
          />
          <Slider
            label="Edge halo radius"
            hint="capsule radius for edges-in-halo"
            value={perf.edgeHaloRadius}
            min={0.05}
            max={1.5}
            step={0.05}
            onChange={(v) => update('edgeHaloRadius', v)}
          />
          <Slider
            label="Halo opacity"
            hint="<1 = plane / nodes show through SDF blob"
            value={perf.haloOpacity}
            min={0}
            max={1.0}
            step={0.05}
            onChange={(v) => update('haloOpacity', v)}
          />
          <Slider
            label="Node opacity"
            hint="<1 = plane shows through node meshes"
            value={perf.nodeOpacity}
            min={0.1}
            max={1.0}
            step={0.05}
            onChange={(v) => update('nodeOpacity', v)}
          />
          <Toggle
            label="Global illumination"
            hint="SDF-based AO — crevices darken naturally"
            value={perf.giEnabled}
            onChange={(v) => update('giEnabled', v)}
          />
          <Slider
            label="GI strength"
            hint="0 = no effect; 1 = default; 2+ = exaggerated"
            value={perf.giStrength}
            min={0}
            max={4.0}
            step={0.1}
            onChange={(v) => update('giStrength', v)}
          />
          <Slider
            label="Resolution"
            hint="lower = render fewer pixels"
            value={perf.penumbraResolutionScale}
            min={0.1}
            max={1.0}
            step={0.05}
            onChange={(v) => update('penumbraResolutionScale', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Frame interval"
            hint="render every N frames"
            value={perf.penumbraRenderInterval}
            min={1}
            max={10}
            step={1}
            onChange={(v) => update('penumbraRenderInterval', v)}
            format={(v) => v === 1 ? 'every frame' : `every ${v} frames`}
          />
        </div>

        <div className="perf-section">
          <div className="perf-section-title">Particulate (Penumbra)</div>
          <div className="perf-radio-group">
            <label>
              <input
                type="radio"
                name="renderMode"
                value="surface"
                checked={perf.renderMode === 'surface'}
                onChange={() => update('renderMode', 'surface')}
              />
              Surface
            </label>
            <label>
              <input
                type="radio"
                name="renderMode"
                value="particulate"
                checked={perf.renderMode === 'particulate'}
                onChange={() => update('renderMode', 'particulate')}
              />
              Particulate
            </label>
            <label>
              <input
                type="radio"
                name="renderMode"
                value="blend"
                checked={perf.renderMode === 'blend'}
                onChange={() => update('renderMode', 'blend')}
              />
              Blend
            </label>
          </div>
          <Slider
            label="Surface↔particulate mix"
            hint="for blend mode only"
            value={perf.particulateMix}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update('particulateMix', v)}
            format={(v) => v === 0 ? 'surface' : v === 1 ? 'particulate' : `${Math.round(v * 100)}% part.`}
          />
          <Slider
            label="Coarse steps"
            hint="ray-march budget for the seed pass"
            value={perf.particulateCoarseSteps}
            min={4}
            max={32}
            step={1}
            onChange={(v) => update('particulateCoarseSteps', v)}
          />
          <Slider
            label="Coarse resolution"
            hint="seed pass resolution as a fraction of viewport"
            value={perf.particulateCoarseScale}
            min={0.25}
            max={1.0}
            step={0.05}
            onChange={(v) => update('particulateCoarseScale', v)}
            format={(v) => `${Math.round(v * 100)}%`}
          />
          <Slider
            label="Points per seed"
            hint="3D points scattered around each coarse hit"
            value={perf.particulatePointsPerSeed}
            min={8}
            max={512}
            step={8}
            onChange={(v) => update('particulatePointsPerSeed', v)}
          />
          <Slider
            label="Scatter radius"
            hint="world-space jitter — small = smoke clinging to surface"
            value={perf.particulateScatterRadius}
            min={0.005}
            max={1.0}
            step={0.005}
            onChange={(v) => update('particulateScatterRadius', v)}
          />
          <Slider
            label="Volume mix"
            hint="0 = surface anchored, 1 = volume fill"
            value={perf.particulateVolumeMix}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update('particulateVolumeMix', v)}
          />
          <Slider
            label="Point size"
            hint="billboard size in pixels — small = smoke, large = embers"
            value={perf.particulatePointSize}
            min={0.5}
            max={10}
            step={0.5}
            onChange={(v) => update('particulatePointSize', v)}
          />
          <Slider
            label="Brightness"
            hint="output multiplier — push higher to make embers visible"
            value={perf.particulateBrightness}
            min={0.1}
            max={5.0}
            step={0.1}
            onChange={(v) => update('particulateBrightness', v)}
          />
          <Toggle
            label="Shimmer"
            hint="when on, seed pixels rotate per frame (subtle motion / fizz)"
            value={perf.particulateShimmer}
            onChange={(v) => update('particulateShimmer', v)}
          />
          <Slider
            label="Cloud noise"
            hint="0 = brick lattice, 1 = wispy cloud (fbm displacement + density + size)"
            value={perf.particulateCloudNoise}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update('particulateCloudNoise', v)}
          />
          <Slider
            label="Cloud noise scale"
            hint="smaller = larger blobs, larger = finer fizz"
            value={perf.particulateCloudNoiseScale}
            min={0.2}
            max={6}
            step={0.1}
            onChange={(v) => update('particulateCloudNoiseScale', v)}
          />
          <Slider
            label="Cloud amplitude"
            hint="fbm displacement in scene units (independent of scatter radius) — increase for billowy volume"
            value={perf.particulateCloudAmplitude}
            min={0}
            max={5}
            step={0.05}
            onChange={(v) => update('particulateCloudAmplitude', v)}
          />
          <Slider
            label="Seed subdivision"
            hint="sub-seeds per brick (1–16) — denser cloud, more particles per brick"
            value={perf.particulateSeedSubdivision}
            min={1}
            max={16}
            step={1}
            onChange={(v) => update('particulateSeedSubdivision', v)}
          />
          <Slider
            label="Particle softness"
            hint="0 = sharp tight billboard, 1 = wide soft puff (fixes pixelated small particles)"
            value={perf.particulateSoftness}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update('particulateSoftness', v)}
          />
        </div>

        <div className="perf-section">
          <div className="perf-section-title">Soften (Penumbra post)</div>
          <Slider
            label="Bilateral blur"
            hint="depth-gated blur on the Penumbra color (0 = off)"
            value={perf.edgeSoftenBilateralStrength}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => update('edgeSoftenBilateralStrength', v)}
          />
          <Slider
            label="Bilateral radius"
            hint="cardinal tap radius in pixels"
            value={perf.edgeSoftenBilateralRadius}
            min={1}
            max={4}
            step={0.5}
            onChange={(v) => update('edgeSoftenBilateralRadius', v)}
          />
          <Slider
            label="Bloom"
            hint="halo glow on the SDF mask (0 = off)"
            value={perf.edgeSoftenBloomStrength}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(v) => update('edgeSoftenBloomStrength', v)}
          />
          <Slider
            label="Bloom radius"
            hint="halo kernel radius in pixels"
            value={perf.edgeSoftenBloomRadius}
            min={2}
            max={24}
            step={1}
            onChange={(v) => update('edgeSoftenBloomRadius', v)}
          />
        </div>

        <div className="perf-section">
          <div className="perf-section-title">Three.js scene</div>
          <Toggle
            label="Nodes"
            value={perf.nodesVisible}
            onChange={(v) => update('nodesVisible', v)}
          />
          <Toggle
            label="Edges"
            value={perf.edgesVisible}
            onChange={(v) => update('edgesVisible', v)}
          />
          <Toggle
            label="Labels"
            value={perf.labelsVisible}
            onChange={(v) => update('labelsVisible', v)}
          />
          <Toggle
            label="Grid"
            value={perf.gridVisible}
            onChange={(v) => update('gridVisible', v)}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Display mode presets for the Qualia viewer.
 * Each mode is a set of viewer settings that can be applied at once.
 */

export interface DisplayModeSettings {
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

export interface DisplayMode {
  id: string;
  label: string;
  shortcut: string;
  settings: DisplayModeSettings;
}

export const DISPLAY_MODES: DisplayMode[] = [
  {
    id: 'default',
    label: 'Default',
    shortcut: '1',
    settings: {
      sdfIntensity: 0.7,
      sdfResDivisor: 4,
      nodeScale: 1.0,
      emissiveIntensity: 0.4,
      edgeOpacity: 0.6,
      ambientIntensity: 0.8,
      fogDensity: 0.001,
      fov: 60,
      farPlane: 1000,
    },
  },
  {
    id: 'fields-only',
    label: 'Fields Only',
    shortcut: '2',
    settings: {
      sdfIntensity: 1.0,
      sdfResDivisor: 2,
      nodeScale: 0.3,
      emissiveIntensity: 0.1,
      edgeOpacity: 0.15,
      ambientIntensity: 0.3,
      fogDensity: 0.0005,
      fov: 60,
      farPlane: 1000,
    },
  },
  {
    id: 'wireframe',
    label: 'Wireframe',
    shortcut: '3',
    settings: {
      sdfIntensity: 0.0,
      sdfResDivisor: 4,
      nodeScale: 0.6,
      emissiveIntensity: 0.8,
      edgeOpacity: 1.0,
      ambientIntensity: 1.2,
      fogDensity: 0.0,
      fov: 60,
      farPlane: 2000,
    },
  },
  {
    id: 'xray',
    label: 'X-Ray',
    shortcut: '4',
    settings: {
      sdfIntensity: 0.4,
      sdfResDivisor: 4,
      nodeScale: 0.8,
      emissiveIntensity: 1.0,
      edgeOpacity: 0.3,
      ambientIntensity: 1.5,
      fogDensity: 0.0,
      fov: 60,
      farPlane: 2000,
    },
  },
  {
    id: 'deep-field',
    label: 'Deep Field',
    shortcut: '5',
    settings: {
      sdfIntensity: 1.0,
      sdfResDivisor: 2,
      nodeScale: 1.2,
      emissiveIntensity: 0.6,
      edgeOpacity: 0.4,
      ambientIntensity: 0.5,
      fogDensity: 0.003,
      fov: 45,
      farPlane: 500,
    },
  },
  {
    id: 'presentation',
    label: 'Presentation',
    shortcut: '6',
    settings: {
      sdfIntensity: 0.5,
      sdfResDivisor: 2,
      nodeScale: 1.5,
      emissiveIntensity: 0.5,
      edgeOpacity: 0.8,
      ambientIntensity: 1.0,
      fogDensity: 0.0008,
      fov: 50,
      farPlane: 1500,
    },
  },
];

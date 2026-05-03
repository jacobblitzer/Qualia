// Types
export type {
  NodeCore, Edge, Context, VisualGroup, VisualGroupParams,
  SDFFieldDef, SDFParams, // deprecated aliases
  NodeTypeDefinition, EdgeTypeDefinition,
  NodeAtom, NodeAtomShape, NodeDisplayMode,
  EdgeShape, EdgeRoutingMode,
  PlaneAxis, Level, LevelSet, PlanarSettings,
  QualiaGraphJSON, QualiaEvent, TimestampedEvent, QualiaState,
  LayoutConfig, VisualMapping, CameraState, AgentBehavior,
  LayoutWorkerMessage, LayoutWorkerResult, Vec3,
} from './types';

export { STANDARD_PLANE_AXES, DEFAULT_PLANAR_SETTINGS } from './types';

// Resolvers (cascade defaults → type → instance)
export { resolveNodeAtom, resolveNodeDisplayMode } from './nodeResolvers';
export { resolveEdgeShape } from './edgeResolvers';

// Theme system (ADR Qualia 0008)
export { THEMES, DARK, LIGHT, MONUMENT, THEME_CYCLE, nextTheme, applyCssVars } from './themes';
export type { ThemeId, ThemeConfig } from './themes';

// Graph
export { Graph } from './Graph';

// Event Store
export { EventStore } from './EventStore';

// Context utilities
export { blendPositions, lerpPositions, sortedContextIds } from './ContextManager';

// Layout
export { LayoutEngine } from './LayoutEngine';

// Import/Export
export { importGraph, exportQualiaJSON, exportObsidianCanvas, exportCSV } from './importExport';

// Analytics
export { degreeCentrality, connectedComponents, betweennessCentrality, pageRank, modularityDetection } from './analytics';

// Debug
export { DebugCollector } from './DebugCollector';
export type { FrameTelemetry, ConsoleEntry, DebugSnapshot, DebugBundle } from './DebugCollector';

// Debug Recorder
export { DebugRecorder } from './DebugRecorder';
export type { RecorderConfig, DebugCapture, RecorderListener } from './DebugRecorder';

export { QualiaRenderer } from './QualiaRenderer';
export { SceneManager } from './SceneManager';
export { NodeMesh } from './NodeMesh';
export { EdgeMesh } from './EdgeMesh';
export { LabelLayer } from './LabelLayer';
export { ContextTransition } from './ContextTransition';
export { InteractionManager } from './InteractionManager';
export { Gumball } from './Gumball';
export { compileGraphToScene } from './PenumbraNetworkCompiler';
export type { NetworkCompileOptions } from './PenumbraNetworkCompiler';

// Re-export PenumbraPass for hosts that just want to construct one.
// Hosts can also import directly from @penumbra/three.
export { PenumbraPass } from '@penumbra/three';
export type { PenumbraPassOptions } from '@penumbra/three';

// NodeMesh is the historical API name for what is now NodeAtomLayer.
// Kept as a re-export so existing imports (`import { NodeMesh } from
// './NodeMesh'`) keep working without churn. New code should import
// NodeAtomLayer directly.
//
// See ADR Qualia 0003.
export { NodeAtomLayer as NodeMesh } from './NodeAtomLayer';

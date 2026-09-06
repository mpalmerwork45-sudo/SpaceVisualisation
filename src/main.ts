import { SpaceEngine } from './engine/SpaceEngine';
import { UIManager } from './ui/UIManager';
import './style.css';

console.log('🚀 [SpaceVis App] Starting application initialization...');

document.addEventListener('DOMContentLoaded', () => {
  const canvasContainer = document.getElementById('canvas-container');
  const uiContainer = document.getElementById('ui-container');

  console.log('📌 [DOM Check]', { canvasContainer: !!canvasContainer, uiContainer: !!uiContainer });

  if (!canvasContainer || !uiContainer) {
    console.error('❌ [DOM Error] Could not find #canvas-container or #ui-container elements!');
    return;
  }

  try {
    console.log('🌌 [Space Engine] Initializing WebGL Space Engine...');
    const spaceEngine = new SpaceEngine(canvasContainer);

    console.log('🎨 [UI Manager] Initializing UI Overlay & Control Listeners...');
    new UIManager(spaceEngine, uiContainer);

    console.log('✅ [SpaceVis App] System fully loaded and active.');
  } catch (err) {
    console.error('💥 [SpaceVis App Crash] Error initializing space visualizer:', err);
  }
});

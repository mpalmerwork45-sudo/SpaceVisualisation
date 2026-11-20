import { SpaceEngine } from './engine/SpaceEngine';
import { UIManager } from './ui/UIManager';
import './style.css';

document.addEventListener('DOMContentLoaded', () => {
  const canvasContainer = document.getElementById('canvas-container');
  const uiContainer = document.getElementById('ui-container');

  let engine: SpaceEngine | undefined;
  try {
    if (!canvasContainer || !uiContainer) throw new Error('Missing visualizer containers.');
    engine = new SpaceEngine(canvasContainer);
    new UIManager(engine, uiContainer);
  } catch (error) {
    engine?.dispose();
    canvasContainer?.replaceChildren();
    uiContainer?.replaceChildren();
    console.error('Unable to start the space visualizer.', error);
    const panel = document.getElementById('startup-error')!;
    const retry = document.getElementById('startup-retry')!;
    panel.hidden = false;
    document.getElementById('startup-error-message')!.textContent = error instanceof Error && /WebGL/i.test(error.message)
      ? 'WebGL 2 is unavailable. Enable graphics acceleration or try a browser that supports WebGL 2, then retry.'
      : 'The visualizer encountered a startup error. Reload the page to try again.';
    retry.addEventListener('click', () => window.location.reload());
    retry.focus();
  }
});

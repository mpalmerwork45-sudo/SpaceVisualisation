import { SpaceEngine, ObjectSelection, SelectedObjectType } from '../engine/SpaceEngine';
import { PLANET_EPHEMERIS, LY_PER_AU } from '../utils/ephemeris';
import { getSpectralCssColor } from '../utils/coordinates';
import { AudioEngine } from './AudioEngine';
import { StarLabelOverlay } from './StarLabelOverlay';
import { ConstellationLabelOverlay } from './ConstellationLabelOverlay';
import { PlanetLabelOverlay } from './PlanetLabelOverlay';
import { PLANET_APPEARANCE } from '../data/planetAppearance';
import { Vector3 } from 'three';
import { matchesSpectralFilter } from '../engine/StarRenderer';
import { DEEP_SPACE_LABELS, planetKind, searchCatalogue } from './catalogueSearch';

function planetDistance(position: Vector3) {
  return `${(position.length() / LY_PER_AU).toFixed(2)} AU`;
}

function stat(label: string, value: string | number) {
  return `<div class="stat-box"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
}

export class UIManager {
  private engine: SpaceEngine;
  private audioEngine: AudioEngine;
  private uiContainer: HTMLElement;
  public labelOverlay: StarLabelOverlay;
  public constellationLabelOverlay: ConstellationLabelOverlay;
  public planetLabelOverlay: PlanetLabelOverlay;

  private tooltipElem!: HTMLElement;
  private modalElem!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private searchResultsElem!: HTMLElement;

  constructor(engine: SpaceEngine, uiContainer: HTMLElement) {
    console.log('🎨 [UIManager] Constructor called.');
    this.engine = engine;
    this.uiContainer = uiContainer;
    this.audioEngine = new AudioEngine();

    this.createUIOverlay();

    const labelsContainer = document.getElementById('labels-container')!;
    this.labelOverlay = new StarLabelOverlay(engine, labelsContainer);
    this.constellationLabelOverlay = new ConstellationLabelOverlay(engine, labelsContainer);
    this.planetLabelOverlay = new PlanetLabelOverlay(engine, labelsContainer, id => this.selectAndFocus('planet', id));

    this.bindEngineCallbacks();
    this.engine.onStateChange = () => this.syncEngineControls();
    this.syncEngineControls();

    this.engine.onRenderFrame = () => {
      this.labelOverlay.updateLabels();
      this.constellationLabelOverlay.updateLabels();
      this.planetLabelOverlay.updateLabels();
      document.getElementById('planet-nav')!.hidden = !this.engine.solSystemRenderer.group.visible;
      this.updateOrientationTelemetry();
    };
  }

  private createUIOverlay() {
    this.uiContainer.innerHTML = `
      <!-- MAIN TOP NAVIGATION BAR -->
      <div class="top-controls">
      <header class="navbar">
        <div class="brand">
          <div class="logo-icon">✨</div>
          <div class="brand-text">
            <h1>SOL & NEARBY UNIVERSE</h1>
            <span class="subtext">3D Cosmic Exploration • 50 Light-Year Radius</span>
          </div>
        </div>

        <details class="navigation-options" id="navigation-options">
        <summary>Explore & settings</summary>
        <div class="nav-controls">
          <!-- VIEW MODE SELECTOR -->
          <div class="control-group">
            <span class="group-label">Sky View Mode:</span>
            <button id="btn-mode-easy" class="btn-mode active" title="Easy-to-read layout with 50 ly distance rings">
              ✨ Easy-to-Read 3D
            </button>
            <button id="btn-mode-log" class="btn-mode" title="Logarithmic distance compression showing local stars, nebulae and Andromeda on one map">
              🌀 Logarithmic
            </button>
            <button id="btn-mode-real" class="btn-mode" title="Sol-centred angular sky with dim, nearly colourless eye exposure; a display approximation, not a long-exposure photograph">
              🔭 Realistic Sky
            </button>
          </div>

          <!-- QUICK ORIENTATION CONTROLS -->
          <div class="control-group">
            <span class="group-label">Preset Viewpoints:</span>
            <button id="btn-center-galactic-center" class="btn-preset" title="Turn toward the Galactic centre from here, preserving your position, focus and zoom">
              🧭 Center Galactic Bulge
            </button>
            <button id="btn-turn-180" class="btn-preset" title="Flips the current heading by 180°; from the bulge this faces the Galactic anticentre at l=180°, b=0°">
              🔄 Turn 180°
            </button>
            <button id="btn-top-g-pole" class="btn-preset" title="Top-down view looking from North Galactic Pole down at Sol and Galactic Plane">
              🌌 Top View (Galactic Pole)
            </button>
            <button id="btn-plane-align" class="btn-preset" title="Switch horizontal alignment between Planetary Ecliptic Plane and Galactic Plane">
              🪐 Plane: Ecliptic
            </button>
            <button id="btn-view-sol" class="btn-preset active" title="Close Solar System view centred on Sol, facing the Galactic centre">
              ☀️ Sol Planetary Zoom
            </button>
          </div>

          <!-- TOGGLES -->
          <div class="control-group toggles-group">
            <label class="toggle-switch" title="Toggle Smart De-cluttered Star Labels">
              <input type="checkbox" id="chk-star-labels" checked>
              <span class="slider"></span>
              <span class="toggle-label">Star Labels</span>
            </label>

            <label class="toggle-switch" title="Toggle 3D Constellation Line Networks and Constellation Name Badges (Default OFF)">
              <input type="checkbox" id="chk-constellations">
              <span class="slider"></span>
              <span class="toggle-label">Constellations</span>
            </label>

            <label class="toggle-switch" title="Toggle Planetary Orbit Paths (Default OFF)">
              <input type="checkbox" id="chk-planet-orbits">
              <span class="slider"></span>
              <span class="toggle-label">Planetary Orbits</span>
            </label>

            <label class="toggle-switch" title="Toggle 10, 25, 50 ly Concentric Rings">
              <input type="checkbox" id="chk-rings">
              <span class="slider"></span>
              <span class="toggle-label">Distance Rings</span>
            </label>

            <button id="btn-audio" class="btn-icon" title="Play an ambient soundtrack of slow harmonies, distant bells and deep undertones" aria-pressed="false" aria-controls="sound-controls">
              ♫ Soundtrack: Off
            </button>
            <div id="sound-controls" class="sound-controls" hidden>
              <label>Volume <input id="sound-volume" type="range" min="0" max="100" value="35" aria-label="Soundtrack volume" /><output id="sound-volume-value">35%</output></label>
              <label title="Adds a colder, more dissonant undertone">Intensity <input id="sound-intensity" type="range" min="0" max="100" value="45" aria-label="Soundtrack intensity" /></label>
            </div>

            <button id="btn-exposure" class="btn-icon" title="Eye: faint, muted diffuse light. Enhanced: brighter photographic-style colour. Neither is a calibrated vision simulation." aria-pressed="false">
              🌙 Eye Exposure
            </button>
            <button id="btn-sky-source" class="btn-icon" title="Switch the Milky Way between a procedural render and an ESO photographic reference" aria-pressed="false">
              Galaxy: Render
            </button>
          </div>
        </div>
        </details>
      </header>

      <!-- SEARCH BAR -->
      <div class="exploration-toolbar">
      <div class="search-container">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="search-input" aria-label="Search celestial objects" placeholder="Search stars, planets, nebulae, constellations… [/]" autocomplete="off" />
          <div id="search-results" class="search-results hidden"></div>
        </div>
      </div>

      <!-- SINGLE AXIS ORIENTATION CONTROL HUD -->
      <details class="axis-hud-panel" id="orientation-options">
        <summary class="axis-hud-title">View angle & orientation</summary>
        <div class="axis-btn-row">
          <span class="axis-label">Pitch (Elevation):</span>
          <button id="btn-pitch-up" class="btn-axis" title="Tilt camera Up (Pitch +5°)">Pitch ▲</button>
          <button id="btn-pitch-dn" class="btn-axis" title="Tilt camera Down (Pitch -5°)">Pitch ▼</button>

          <span class="axis-label">Yaw (Heading):</span>
          <button id="btn-yaw-left" class="btn-axis" title="Pan camera Left (Yaw -5°)">Yaw ◄</button>
          <button id="btn-yaw-right" class="btn-axis" title="Pan camera Right (Yaw +5°)">Yaw ►</button>

          <span class="axis-label">Roll (Rotation):</span>
          <button id="btn-roll-ccw" class="btn-axis" title="Roll camera Counter-Clockwise (Roll -5°)">Roll ↶</button>
          <button id="btn-roll-cw" class="btn-axis" title="Roll camera Clockwise (Roll +5°)">Roll ↷</button>

          <button id="btn-axis-reset" class="btn-axis btn-axis-reset" title="Reset Camera Roll to Horizontal Level">Level ⚖️</button>
        </div>
        <div id="axis-telemetry-readout" class="axis-telemetry-readout">
          Solar System · Facing the Galactic centre
        </div>
        <div class="view-angle-controls">
          <span>Orbit view</span>
          <button class="btn-axis" data-elevation="75" title="Look down at the current focus without changing distance">Above</button>
          <button class="btn-axis" data-elevation="0" title="View the current focus at the selected coordinate plane">Level</button>
          <button class="btn-axis" data-elevation="-45" title="Look up at the current focus without changing distance">Below</button>
          <label for="view-fov">Field of view</label>
          <input id="view-fov" type="range" min="0" max="100" step="0.1" value="93.4" aria-label="Field of view" />
          <output id="view-fov-value" for="view-fov">55°</output>
        </div>
      </details>
      </div>
      </div>

      <!-- SPECTRAL FILTER BAR -->
      <nav class="planet-nav" id="planet-nav" aria-label="Explore the Solar System">
        <div class="planet-nav-heading"><span>SOLAR SYSTEM</span><small>Positions to scale · bodies enlarged</small></div>
        <div class="planet-nav-items">
          ${PLANET_EPHEMERIS.map((planet, index) => `<button class="planet-stop" data-planet="${planet.id}" style="--planet-colour:${planet.color}" title="Inspect ${planet.name}">
            <span class="planet-swatch planet-swatch-${planet.id}"></span><span>${planet.name}</span><small>${String(index + 1).padStart(2,'0')}</small>
          </button>`).join('')}
        </div>
      </nav>
      <div class="spectral-filter-bar">
        <span class="filter-title">Filter Spectral Class:</span>
        <button class="btn-spectral active" data-class="ALL">ALL</button>
        <button class="btn-spectral" data-class="O" style="--sc-color: #9bb0ff">O</button>
        <button class="btn-spectral" data-class="B" style="--sc-color: #aabfff">B</button>
        <button class="btn-spectral" data-class="A" style="--sc-color: #cad7ff">A</button>
        <button class="btn-spectral" data-class="F" style="--sc-color: #f8f7ff">F</button>
        <button class="btn-spectral" data-class="G" style="--sc-color: #fff4ea">G (Sol)</button>
        <button class="btn-spectral" data-class="K" style="--sc-color: #ffd2a1">K</button>
        <button class="btn-spectral" data-class="M" style="--sc-color: #ffa06d">M</button>
        <button class="btn-spectral" data-class="BD" style="--sc-color: #d24836" title="L, T, Y Brown Dwarfs">🟤 BD (L/T/Y)</button>
      </div>

      <!-- HOVER TOOLTIP -->
      <div class="sky-credit hidden" id="sky-credit">
        Milky Way: <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener noreferrer">ESO/S. Brunier</a>
        · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
      </div>
      <div id="tooltip" class="tooltip hidden"></div>

      <!-- OBJECT DETAIL SIDEBAR / MODAL -->
      <div id="detail-modal" class="detail-modal hidden" role="region" aria-label="Object details">
        <button id="btn-close-modal" class="btn-close" aria-label="Close object details">&times;</button>
        <div id="modal-content"></div>
      </div>
    `;

    this.tooltipElem = document.getElementById('tooltip')!;
    this.modalElem = document.getElementById('detail-modal')!;
    this.searchInput = document.getElementById('search-input') as HTMLInputElement;
    this.searchResultsElem = document.getElementById('search-results')!;
    // Keep the sky usable on smaller screens; every control remains accessible
    // in keyboard-operable disclosures with independently scrollable contents.
    const wideScreen = window.matchMedia('(min-width: 1600px)');
    const adaptControls = () => {
      (document.getElementById('navigation-options') as HTMLDetailsElement).open = wideScreen.matches;
      (document.getElementById('orientation-options') as HTMLDetailsElement).open = wideScreen.matches;
    };
    adaptControls();
    wideScreen.addEventListener('change', adaptControls);

    this.bindUIEvents();
  }

  private updateOrientationTelemetry() {
    const readout = document.getElementById('axis-telemetry-readout');
    if (!readout) return;

    // Orbit angles describe camera position; telemetry describes the actual
    // inward line of sight, which is the opposite direction.
    const direction = this.engine.camera.getWorldDirection(new Vector3());
    const fov = this.engine.targetCameraFov;
    const fovSlider = document.getElementById('view-fov') as HTMLInputElement;
    if (document.activeElement !== fovSlider) fovSlider.value = String(Math.log(fov/0.05)/Math.log(1800)*100);
    document.getElementById('view-fov-value')!.textContent = `${fov < 1 ? fov.toFixed(2) : fov.toFixed(1)}°`;
    fovSlider.setAttribute('aria-valuetext', `${fov.toFixed(2)} degrees`);
    const pitchDeg = Math.round(Math.asin(direction.y) * (180 / Math.PI));
    const yawRaw = ((Math.atan2(-direction.z, direction.x) * (180 / Math.PI)) + 360) % 360;
    const yawDeg = Math.round(yawRaw) % 360;
    const rollDeg = Math.round(this.engine.cameraRoll * (180 / Math.PI));
    const radiusLy = this.engine.cameraRadius;

    let radText = `${radiusLy.toFixed(4)} ly`;
    if (radiusLy < 0.0001) {
      const au = radiusLy * 63241.077;
      radText = au < 0.1 ? `${(au * 149597870).toLocaleString(undefined, { maximumFractionDigits: 0 })} km` : `${au.toFixed(2)} AU`;
    }

    const location = this.engine.viewMode === 'realistic' ? 'Observer at Sol' : `View Scale: ${radText}`;
    readout.textContent = `Pitch: ${pitchDeg}° | Yaw: ${yawDeg}° | Roll: ${rollDeg}° | ${location}`;
  }

  private syncEngineControls() {
    const modes = { linear: 'btn-mode-easy', logarithmic: 'btn-mode-log', realistic: 'btn-mode-real' };
    Object.values(modes).forEach(id => document.getElementById(id)!.classList.toggle('active', id === modes[this.engine.viewMode]));
    const presets = { sol_center: 'btn-view-sol', galactic_center: 'btn-center-galactic-center', look_galactic_pole: 'btn-top-g-pole' };
    Object.entries(presets).forEach(([preset,id]) => document.getElementById(id)!.classList.toggle('active', preset === this.engine.activePreset));
    document.getElementById('btn-plane-align')!.textContent = `🪐 Plane: ${this.engine.planeAlignment === 'galactic' ? 'Galactic' : 'Ecliptic'}`;
    (document.getElementById('chk-rings') as HTMLInputElement).checked = this.engine.gridRenderer.ringsVisible;
    (document.getElementById('chk-planet-orbits') as HTMLInputElement).checked = this.engine.solSystemRenderer.orbitsVisible;
    document.querySelectorAll<HTMLElement>('.btn-spectral').forEach(button => button.classList.toggle('active', button.dataset.class === this.engine.spectralFilter));
    document.querySelectorAll<HTMLElement>('[data-planet]').forEach(button => button.classList.toggle('active', button.dataset.planet === this.engine.focusedPlanetId));
    const enhanced = this.engine.observationMode === 'enhancedOptical';
    const exposure = document.getElementById('btn-exposure')!;
    exposure.textContent = enhanced ? '📷 Enhanced Exposure' : '🌙 Eye Exposure';
    exposure.classList.toggle('active', enhanced);
    exposure.setAttribute('aria-pressed', String(enhanced));
  }

  private bindUIEvents() {
    const btnModeEasy = document.getElementById('btn-mode-easy')!;
    const btnModeLog = document.getElementById('btn-mode-log')!;
    const btnModeReal = document.getElementById('btn-mode-real')!;
    const btnCenterGalacticCenter = document.getElementById('btn-center-galactic-center')!;
    const btnTurn180 = document.getElementById('btn-turn-180')!;
    const btnTopGPole = document.getElementById('btn-top-g-pole')!;
    const btnPlaneAlign = document.getElementById('btn-plane-align')!;
    const btnViewSol = document.getElementById('btn-view-sol')!;
    const modeBtns = [btnModeEasy, btnModeLog, btnModeReal];
    const presetBtns = [btnCenterGalacticCenter, btnTopGPole, btnViewSol];
    const syncRingsCheckbox = (checked: boolean) => {
      (document.getElementById('chk-rings') as HTMLInputElement).checked = checked;
    };

    btnModeEasy.addEventListener('click', () => {
      this.setActiveBtn(modeBtns, btnModeEasy);
      presetBtns.forEach(button => button.classList.remove('active'));
      this.engine.setViewMode('linear');
      syncRingsCheckbox(true);
    });

    btnModeLog.addEventListener('click', () => {
      this.setActiveBtn(modeBtns, btnModeLog);
      presetBtns.forEach(button => button.classList.remove('active'));
      this.engine.setViewMode('logarithmic');
      syncRingsCheckbox(true);
    });

    btnModeReal.addEventListener('click', () => {
      this.setActiveBtn(modeBtns, btnModeReal);
      presetBtns.forEach(button => button.classList.remove('active'));
      this.engine.setPresetViewpoint('realistic_sky');
      const exposure = document.getElementById('btn-exposure')!;
      exposure.textContent = '🌙 Eye Exposure';
      exposure.classList.remove('active');
      exposure.setAttribute('aria-pressed', 'false');
      syncRingsCheckbox(false);
    });

    btnCenterGalacticCenter.addEventListener('click', () => {
      this.setActiveBtn(presetBtns, btnCenterGalacticCenter);
      this.engine.setPresetViewpoint('galactic_center');
    });

    btnTurn180.addEventListener('click', () => {
      this.engine.turnAround180();
    });

    btnTopGPole.addEventListener('click', () => {
      this.setActiveBtn(presetBtns, btnTopGPole);
      this.setActiveBtn(modeBtns, btnModeEasy);
      this.engine.setPresetViewpoint('look_galactic_pole');
      btnPlaneAlign.textContent = '🪐 Plane: Galactic';
      syncRingsCheckbox(true);
    });

    btnPlaneAlign.addEventListener('click', () => {
      if (this.engine.planeAlignment === 'ecliptic') {
        this.engine.setPlaneAlignment('galactic');
        btnPlaneAlign.textContent = '🪐 Plane: Galactic';
      } else {
        this.engine.setPlaneAlignment('ecliptic');
        btnPlaneAlign.textContent = '🪐 Plane: Ecliptic';
      }
    });

    btnViewSol.addEventListener('click', () => {
      this.setActiveBtn(presetBtns, btnViewSol);
      this.setActiveBtn(modeBtns, btnModeEasy);
      this.engine.setPresetViewpoint('sol_center');
      btnPlaneAlign.textContent = '🪐 Plane: Ecliptic';
      syncRingsCheckbox(false);
    });

    // SINGLE AXIS TILT HUD BUTTON EVENTS
    document.querySelectorAll<HTMLButtonElement>('[data-elevation]').forEach(button => {
      button.addEventListener('click', () => this.engine.setOrbitElevation(Number(button.dataset.elevation)));
    });
    document.getElementById('view-fov')!.addEventListener('input', event => {
      this.engine.setFieldOfView(0.05 * Math.pow(1800,Number((event.target as HTMLInputElement).value)/100));
    });
    document.getElementById('btn-pitch-up')!.addEventListener('click', () => this.engine.adjustPitch(5));
    document.getElementById('btn-pitch-dn')!.addEventListener('click', () => this.engine.adjustPitch(-5));
    document.getElementById('btn-yaw-left')!.addEventListener('click', () => this.engine.adjustYaw(-5));
    document.getElementById('btn-yaw-right')!.addEventListener('click', () => this.engine.adjustYaw(5));
    document.getElementById('btn-roll-ccw')!.addEventListener('click', () => this.engine.adjustRoll(-5));
    document.getElementById('btn-roll-cw')!.addEventListener('click', () => this.engine.adjustRoll(5));
    document.getElementById('btn-axis-reset')!.addEventListener('click', () => this.engine.resetOrientation());

    // KEYBOARD SHORTCUTS FOR AXIS TILT AND SEARCH FOCUS
    window.addEventListener('keydown', (e) => {
      if (document.activeElement === this.searchInput) {
        if (e.key === 'Enter') {
          this.selectTopSearchMatch();
        } else if (e.key === 'Escape') {
          this.searchResultsElem.classList.add('hidden');
        }
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      if (active && this.searchResultsElem.contains(active)) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const editableSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';
      if (active?.closest(editableSelector) || target?.closest(editableSelector) || active?.isContentEditable || target?.isContentEditable) return;

      if (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        this.searchInput.focus();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.engine.adjustPitch(5);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.engine.adjustPitch(-5);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.engine.adjustYaw(-5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.engine.adjustYaw(5);
      } else if (e.key.toLowerCase() === 'q') {
        this.engine.adjustRoll(-5);
      } else if (e.key.toLowerCase() === 'e') {
        this.engine.adjustRoll(5);
      } else if (e.key.toLowerCase() === 'r') {
        this.engine.resetOrientation();
      }
    });

    const chkStarLabels = document.getElementById('chk-star-labels') as HTMLInputElement;
    chkStarLabels.addEventListener('change', (e) => {
      this.labelOverlay.setVisible((e.target as HTMLInputElement).checked);
    });

    const chkConstellations = document.getElementById('chk-constellations') as HTMLInputElement;
    chkConstellations.addEventListener('change', (e) => {
      const isChecked = (e.target as HTMLInputElement).checked;
      this.engine.constellationRenderer.setVisible(isChecked);
      this.constellationLabelOverlay.setVisible(isChecked);
      if (isChecked) {
        this.engine.constellationRenderer.updateConstellations(
          this.engine.starRenderer,
          this.engine.viewMode,
          this.engine.planeAlignment
        );
      }
    });

    const chkPlanetOrbits = document.getElementById('chk-planet-orbits') as HTMLInputElement;
    chkPlanetOrbits.addEventListener('change', (e) => {
      this.engine.solSystemRenderer.setOrbitsVisible((e.target as HTMLInputElement).checked);
    });

    const chkRings = document.getElementById('chk-rings') as HTMLInputElement;
    chkRings.addEventListener('change', (e) => {
      this.engine.gridRenderer.setRingsVisible((e.target as HTMLInputElement).checked);
    });

    const btnAudio = document.getElementById('btn-audio') as HTMLButtonElement;
    btnAudio.addEventListener('click', async () => {
      btnAudio.disabled = true;
      try {
        const isPlaying = await this.audioEngine.toggleAudio();
        btnAudio.textContent = isPlaying ? '♫ Soundtrack: On' : '♫ Soundtrack: Off';
        btnAudio.classList.toggle('active', isPlaying);
        btnAudio.setAttribute('aria-pressed', String(isPlaying));
        document.getElementById('sound-controls')!.hidden = !isPlaying;
      } catch (error) {
        btnAudio.textContent = 'Sound unavailable · Retry';
        console.warn('Unable to start soundtrack.', error);
      } finally {
        btnAudio.disabled = false;
      }
    });
    document.getElementById('sound-volume')!.addEventListener('input', event => {
      const value = Number((event.target as HTMLInputElement).value);
      this.audioEngine.setVolume(value/100);
      document.getElementById('sound-volume-value')!.textContent = `${value}%`;
    });
    document.getElementById('sound-intensity')!.addEventListener('input', event => {
      this.audioEngine.setIntensity(Number((event.target as HTMLInputElement).value)/100);
    });
    window.addEventListener('pagehide', () => {
      this.audioEngine.dispose();
      btnAudio.textContent = '♫ Soundtrack: Off';
      btnAudio.classList.remove('active');
      btnAudio.setAttribute('aria-pressed','false');
      document.getElementById('sound-controls')!.hidden = true;
    });

    const btnExposure = document.getElementById('btn-exposure')!;
    document.querySelectorAll<HTMLButtonElement>('[data-planet]').forEach(button => {
      button.addEventListener('click', () => this.selectAndFocus('planet', button.dataset.planet!));
    });
    const btnSkySource = document.getElementById('btn-sky-source') as HTMLButtonElement;
    btnSkySource.addEventListener('click', async () => {
      const mode = this.engine.milkyWay.mode === 'render' ? 'photo' : 'render';
      btnSkySource.disabled = true;
      btnSkySource.textContent = mode === 'photo' ? 'Loading photograph…' : 'Galaxy: Render';
      try {
        await this.engine.setMilkyWayMode(mode);
        btnSkySource.textContent = mode === 'photo' ? 'Galaxy: Photo' : 'Galaxy: Render';
        btnSkySource.setAttribute('aria-pressed', String(mode === 'photo'));
        document.getElementById('sky-credit')!.classList.toggle('hidden', mode !== 'photo');
      } catch (error) {
        btnSkySource.textContent = 'Photo unavailable · Retry';
        console.warn('Unable to load the reference photograph.', error);
      } finally {
        btnSkySource.disabled = false;
      }
    });
    btnExposure.addEventListener('click', () => {
      const enhanced = this.engine.observationMode === 'darkAdaptedEye';
      this.engine.setObservationMode(enhanced ? 'enhancedOptical' : 'darkAdaptedEye');
      btnExposure.textContent = enhanced ? '📷 Enhanced Exposure' : '🌙 Eye Exposure';
      btnExposure.classList.toggle('active', enhanced);
      btnExposure.setAttribute('aria-pressed', String(enhanced));
    });

    const spectralBtns = document.querySelectorAll('.btn-spectral');
    spectralBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        spectralBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const specClass = btn.getAttribute('data-class') || 'ALL';
        this.engine.setSpectralFilter(specClass);
      });
    });

    document.getElementById('btn-close-modal')!.addEventListener('click', () => {
      this.modalElem.classList.add('hidden');
    });

    this.searchInput.addEventListener('input', () => {
      this.handleSearch(this.searchInput.value);
    });

    document.addEventListener('click', (e) => {
      if (!this.searchInput.contains(e.target as Node) && !this.searchResultsElem.contains(e.target as Node)) {
        this.searchResultsElem.classList.add('hidden');
      }
    });
  }

  private setActiveBtn(btnGroup: HTMLElement[], activeBtn: HTMLElement) {
    btnGroup.forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  private handleSearch(query: string) {
    if (!query.trim()) {
      this.searchResultsElem.classList.add('hidden');
      this.searchResultsElem.replaceChildren();
      return;
    }

    const matches = searchCatalogue(query).slice(0, 8);
    if (matches.length === 0) {
      this.searchResultsElem.innerHTML = '<div class="search-item-empty" role="status">No celestial objects found</div>';
    } else {
      this.searchResultsElem.replaceChildren(...matches.map(match => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-item';
        button.dataset.id = match.id;
        button.dataset.type = match.type;
        const name = document.createElement('span');
        name.className = 'item-name';
        name.textContent = match.name;
        const label = document.createElement('span');
        label.className = 'item-badge';
        label.textContent = match.label;
        button.append(name, label);
        button.addEventListener('click', () => {
          this.selectAndFocus(match.type, match.id);
          this.searchResultsElem.classList.add('hidden');
          this.searchInput.value = '';
        });
        return button;
      }));
    }

    this.searchResultsElem.classList.remove('hidden');
  }

  private selectTopSearchMatch() {
    if (this.searchResultsElem.classList.contains('hidden') || !this.searchInput.value.trim()) return;
    this.searchResultsElem.querySelector<HTMLButtonElement>('.search-item')?.click();
  }

  private selectAndFocus(type: SelectedObjectType, id: string) {
    const selection = this.engine.resolveSelection(type, id);
    if (!selection) return;
    if (selection.type === 'star' && !matchesSpectralFilter(selection.data, this.engine.spectralFilter)) {
      this.engine.setSpectralFilter('ALL');
    }
    this.engine.focusObject(type, id);
    const current = this.engine.resolveSelection(type, id);
    if (current) this.showDetailModal(current);
  }

  private bindEngineCallbacks() {
    this.engine.onHoverObject = (hovered, screenPos) => {
      if (!hovered) {
        this.tooltipElem.classList.add('hidden');
        return;
      }

      const { type, data, position } = hovered;
      const spectral = type === 'star' ? data.spectral : undefined;
      let facts: [string, string][];
      if (type === 'planet') {
        facts = [['Type', planetKind(data.id)], ['Distance from Sun', planetDistance(position)]];
      } else if (type === 'constellation') {
        facts = [['Type', 'Constellation'], ['Stars in outline', String(new Set(data.lines.flat()).size)]];
      } else {
        const classification = type === 'star'
          ? data.stellarType ?? (data.isBrownDwarf ? 'Brown dwarf' : 'Star')
          : DEEP_SPACE_LABELS[data.type];
        facts = [['Type', classification], ['Distance from Sol', `${data.dist.toLocaleString()} ly`], ['Region', data.constellation]];
      }

      this.tooltipElem.innerHTML = `
        <div class="tooltip-header">
          <span class="tooltip-title">${data.name}</span>
          ${spectral ? `<span class="spec-badge" style="background:${getSpectralCssColor(spectral)}">${spectral}</span>` : ''}
        </div>
        <div class="tooltip-body">
          ${facts.map(([label, value]) => `<span>${label}: <strong>${value}</strong></span>`).join('')}
        </div>
      `;

      this.tooltipElem.style.left = `${screenPos.x + 15}px`;
      this.tooltipElem.style.top = `${screenPos.y + 15}px`;
      this.tooltipElem.classList.remove('hidden');
    };

    this.engine.onSelectObject = (selection) => {
      this.showDetailModal(selection);
    };
  }

  private showDetailModal(selection: ObjectSelection) {
    const { type, data, position } = selection;
    const content = document.getElementById('modal-content')!;

    if (type === 'planet') {
      const appearance = PLANET_APPEARANCE[data.id];
      const period = data.periodYears < 2 ? `${Math.round(data.periodYears * 365.25)} days` : `${data.periodYears.toFixed(1)} years`;
      content.innerHTML = `
        <div class="modal-header planet-detail-header" style="--planet-colour:${data.color}">
          <span class="modal-type-badge">${appearance.kind}</span><h2>${data.name}</h2>
          <p class="planet-detail-subtitle">Solar System / ${planetKind(data.id)}</p>
        </div>
        <p class="modal-description">${appearance.summary}</p>
        <div class="modal-grid">
          ${stat('Diameter', `${Math.round(data.radiusKm * 2).toLocaleString()} km`)}
          ${stat('Distance from Sun', planetDistance(position))}
          ${stat('Orbital period', period)}
          ${stat('Orbital inclination', `${data.i.toFixed(2)}°`)}
        </div>
        <p class="planet-model-note">Illustrative surface detail · enlarged for visibility.<br>Drag to orbit. Scroll to explore the surface.</p>
        <div class="modal-actions"><button id="btn-inspect-planet" class="btn-action">Inspect ${data.name}</button><button id="btn-planet-home" class="btn-action secondary-action">Solar System</button></div>
      `;
      document.getElementById('btn-inspect-planet')!.addEventListener('click', () => this.engine.focusPlanet(data.id));
      document.getElementById('btn-planet-home')!.addEventListener('click', () => {
        this.engine.setPresetViewpoint('sol_center');
        this.modalElem.classList.add('hidden');
      });
    } else {
      const facts: string[] = [];
      let kind: string;
      let description = '';
      let notes = '';
      let spectralBadge = '';

      if (type === 'star') {
        kind = data.isBrownDwarf ? 'Brown dwarf' : 'Star';
        description = data.description;
        spectralBadge = `<span class="spec-badge-lg" style="background:${getSpectralCssColor(data.spectral)}">${data.spectral}</span>`;
        facts.push(
          stat('Classification', data.stellarType ?? kind),
          stat('Distance from Sol', `${data.dist.toLocaleString()} ly`),
          stat('Region', data.constellation),
          stat('Apparent magnitude', data.mag)
        );
        if (data.temp !== undefined) facts.push(stat('Surface temperature', `${data.temp.toLocaleString()} K (${Math.round(data.temp - 273.15)}°C)`));
        if (data.metallicity !== undefined) facts.push(stat('Metallicity [Fe/H]', `${data.metallicity >= 0 ? '+' : ''}${data.metallicity} dex`));
        if (data.ageGyr !== undefined) facts.push(stat('Stellar age', `${data.ageGyr} Gyr`));
        if (data.lum !== undefined) facts.push(stat('Luminosity', `${data.lum} L☉`));
        if (data.rotationPeriodDays !== undefined) facts.push(stat('Rotation period', `${data.rotationPeriodDays} days`));
        if (data.radialVelocityKmS !== undefined) facts.push(stat('Radial velocity', `${data.radialVelocityKmS > 0 ? '+' : ''}${data.radialVelocityKmS} km/s`));
        if (data.properMotionMasYr !== undefined) facts.push(stat('Proper motion', `${data.properMotionMasYr} mas/yr`));
        if (data.variableType) facts.push(stat('Variable class', data.variableType));
        if (data.exoplanets !== undefined) facts.push(stat('Known exoplanets', data.exoplanets));
        if (data.mag > 6.5) {
          notes += '<p class="modal-source">Below the unaided-eye sky limit. Use a 3D map to see its catalogue marker. Enhanced sky exposure shows stars down to magnitude 14.</p>';
        }
        if (data.source) {
          notes += `<p class="modal-source">Astrometry and visual magnitude from <a href="${data.source}" target="_blank" rel="noopener noreferrer">CDS/SIMBAD</a>. Distances are parallax-derived estimates.</p>`;
        }
      } else if (type === 'deepSpace') {
        kind = DEEP_SPACE_LABELS[data.type];
        description = data.description;
        const major = data.galaxy?.majorArcmin ?? data.angularSizeArcmin;
        const minor = data.galaxy?.minorArcmin ?? data.angularSizeMinorArcmin;
        facts.push(
          stat('Distance from Sol', `${data.dist.toLocaleString()} ly`),
          stat('Constellation', data.constellation),
          stat('Angular extent', minor ? `${major}′ × ${minor}′` : `${major}′`)
        );
        if (data.galaxy) {
          facts.push(
            stat('Morphology', data.galaxy.morphology),
            stat('Position angle', `${data.galaxy.positionAngleDeg}° east of north`),
            stat('Visual magnitude', `V ${data.galaxy.apparentMagnitudeV}`)
          );
          notes = `<p class="modal-source">Appearance data from ${data.galaxy.source}.</p>`;
        }
      } else {
        kind = 'Constellation';
        facts.push(stat('Stars in outline', new Set(data.lines.flat()).size), stat('Line segments', data.lines.length));
      }

      content.innerHTML = `
        <div class="modal-header">
          <span class="modal-type-badge">${kind}</span>
          <h2>${data.name}</h2>
          ${spectralBadge}
        </div>
        <div class="modal-grid">${facts.join('')}</div>
        ${description ? `<p class="modal-description">${description}</p>` : ''}
        ${notes}
        <div class="modal-actions"><button id="btn-fly-focus" class="btn-action">🎯 Center Camera View</button></div>
      `;
      document.getElementById('btn-fly-focus')!.addEventListener('click', () => this.engine.focusObject(type, data.id));
    }
    this.modalElem.classList.remove('hidden');
  }
}

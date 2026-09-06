import { SpaceEngine, ObjectSelection } from '../engine/SpaceEngine';
import { STARS_CATALOG, StarData } from '../data/stars';
import { PLANET_EPHEMERIS } from '../utils/ephemeris';
import { DEEP_SPACE_OBJECTS, DeepSpaceObjectData } from '../data/deepSpace';
import { angularDiameterToWorldSize, getSpectralCssColor, scaleDistance } from '../utils/coordinates';
import { AudioEngine } from './AudioEngine';
import { StarLabelOverlay } from './StarLabelOverlay';
import { ConstellationLabelOverlay } from './ConstellationLabelOverlay';
import { PlanetLabelOverlay } from './PlanetLabelOverlay';
import { PLANET_APPEARANCE } from '../data/planetAppearance';
import { LY_PER_AU } from '../utils/ephemeris';
import { Vector3 } from 'three';

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
    this.planetLabelOverlay = new PlanetLabelOverlay(engine, labelsContainer, id => this.selectAndFlyToObject(id));

    this.bindEngineCallbacks();

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
      <header class="navbar">
        <div class="brand">
          <div class="logo-icon">✨</div>
          <div class="brand-text">
            <h1>SOL & NEARBY UNIVERSE</h1>
            <span class="subtext">3D Cosmic Exploration • 50 Light-Year Radius</span>
          </div>
        </div>

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
            <button id="btn-mode-real" class="btn-mode" title="Realistic sky dome rendering from Earth/Sol view">
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

            <button id="btn-audio" class="btn-icon" title="Toggle Cosmic Ambient Soundscape">
              🎵 Sound: Off
            </button>

            <button id="btn-exposure" class="btn-icon" title="Switch between a dark-adapted eye view and an enhanced optical exposure" aria-pressed="false">
              🌙 Eye Exposure
            </button>
            <button id="btn-sky-source" class="btn-icon" title="Switch the Milky Way between a procedural render and an ESO photographic reference" aria-pressed="false">
              Galaxy: Render
            </button>
          </div>
        </div>
      </header>

      <!-- SEARCH BAR -->
      <div class="search-container">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="search-input" placeholder="Search stars, brown dwarfs, planets, nebulae... [Press /]" autocomplete="off" />
          <div id="search-results" class="search-results hidden"></div>
        </div>
      </div>

      <!-- SINGLE AXIS ORIENTATION CONTROL HUD -->
      <div class="axis-hud-panel">
        <div class="axis-hud-title">📐 Single Axis Tilt & Orientation</div>
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
        <button class="btn-spectral" data-class="L" style="--sc-color: #d24836" title="L, T, Y Brown Dwarfs">🟤 BD (L/T/Y)</button>
      </div>

      <!-- HOVER TOOLTIP -->
      <div class="sky-credit hidden" id="sky-credit">
        Milky Way: <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener noreferrer">ESO/S. Brunier</a>
        · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>
      </div>
      <div id="tooltip" class="tooltip hidden"></div>

      <!-- OBJECT DETAIL SIDEBAR / MODAL -->
      <div id="detail-modal" class="detail-modal hidden">
        <button id="btn-close-modal" class="btn-close">&times;</button>
        <div id="modal-content"></div>
      </div>
    `;

    this.tooltipElem = document.getElementById('tooltip')!;
    this.modalElem = document.getElementById('detail-modal')!;
    this.searchInput = document.getElementById('search-input') as HTMLInputElement;
    this.searchResultsElem = document.getElementById('search-results')!;

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
    const yawRaw = ((Math.atan2(direction.z, direction.x) * (180 / Math.PI)) + 360) % 360;
    const yawDeg = Math.round(yawRaw) % 360;
    const rollDeg = Math.round(this.engine.cameraRoll * (180 / Math.PI));
    const radiusLy = this.engine.cameraRadius;

    let radText = `${radiusLy.toFixed(4)} ly`;
    if (radiusLy < 0.0001) {
      const au = radiusLy * 63241.077;
      radText = au < 0.1 ? `${(au * 149597870).toLocaleString(undefined, { maximumFractionDigits: 0 })} km` : `${au.toFixed(2)} AU`;
    }

    readout.textContent = `Pitch: ${pitchDeg}° | Yaw: ${yawDeg}° | Roll: ${rollDeg}° | View Scale: ${radText}`;
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
        }
        return;
      }

      if (e.key === '/' || (e.ctrlKey && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        this.searchInput.focus();
        return;
      }

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

    const btnAudio = document.getElementById('btn-audio')!;
    btnAudio.addEventListener('click', () => {
      const isPlaying = this.audioEngine.toggleAudio();
      btnAudio.textContent = isPlaying ? '🎵 Sound: Playing' : '🎵 Sound: Off';
      btnAudio.classList.toggle('active', isPlaying);
    });

    const btnExposure = document.getElementById('btn-exposure')!;
    document.querySelectorAll<HTMLButtonElement>('[data-planet]').forEach(button => {
      button.addEventListener('click', () => this.selectAndFlyToObject(button.dataset.planet!));
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
        this.engine.starRenderer.updateStars(this.engine.viewMode, this.engine.planeAlignment, specClass);
        this.engine.constellationRenderer.updateConstellations(
          this.engine.starRenderer,
          this.engine.viewMode,
          this.engine.planeAlignment
        );
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
    const q = query.trim().toLowerCase();
    if (q.length === 0) {
      this.searchResultsElem.classList.add('hidden');
      return;
    }

    const matches: Array<{ name: string; type: string; id: string; item: any }> = [];

    STARS_CATALOG.forEach(s => {
      if (s.name.toLowerCase().includes(q) || s.constellation.toLowerCase().includes(q) || (s.stellarType && s.stellarType.toLowerCase().includes(q))) {
        const badgeTag = s.isBrownDwarf ? 'Brown Dwarf' : `Star (${s.spectral})`;
        matches.push({ name: s.name, type: badgeTag, id: s.id, item: s });
      }
    });

    PLANET_EPHEMERIS.forEach(p => {
      if (p.name.toLowerCase().includes(q)) {
        matches.push({ name: p.name, type: 'Planet', id: p.id, item: p });
      }
    });

    DEEP_SPACE_OBJECTS.forEach(d => {
      if (d.name.toLowerCase().includes(q) || d.constellation.toLowerCase().includes(q)) {
        const type = d.type === 'nebula' ? 'Nebula' : d.type === 'galaxy' ? 'Galaxy' : 'Galactic feature';
        matches.push({ name: d.name, type, id: d.id, item: d });
      }
    });

    if (matches.length === 0) {
      this.searchResultsElem.innerHTML = `<div class="search-item-empty">No celestial objects found</div>`;
    } else {
      this.searchResultsElem.innerHTML = matches.slice(0, 8).map(m => `
        <div class="search-item" data-id="${m.id}" data-type="${m.type}">
          <span class="item-name">${m.name}</span>
          <span class="item-badge">${m.type}</span>
        </div>
      `).join('');

      const items = this.searchResultsElem.querySelectorAll('.search-item');
      items.forEach(el => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-id')!;
          this.selectAndFlyToObject(id);
          this.searchResultsElem.classList.add('hidden');
          this.searchInput.value = '';
        });
      });
    }

    this.searchResultsElem.classList.remove('hidden');
  }

  private selectTopSearchMatch() {
    const firstItem = this.searchResultsElem.querySelector('.search-item') as HTMLElement;
    if (firstItem) {
      const id = firstItem.getAttribute('data-id')!;
      this.selectAndFlyToObject(id);
      this.searchResultsElem.classList.add('hidden');
      this.searchInput.value = '';
    }
  }

  private selectAndFlyToObject(id: string) {
    const starNode = this.engine.starRenderer.starsMap.get(id);
    if (starNode) {
      this.focusStarObject(starNode.data, starNode.position);
      this.showDetailModal({ type: 'star', data: starNode.data, position: starNode.position });
      return;
    }

    const planetNode = this.engine.solSystemRenderer.planetsMap.get(id);
    if (planetNode) {
      this.engine.focusPlanet(id);
      document.querySelectorAll<HTMLElement>('[data-planet]').forEach(button => button.classList.toggle('active', button.dataset.planet === id));
      document.getElementById('btn-plane-align')!.textContent = '🪐 Plane: Ecliptic';
      this.showDetailModal({ type: 'planet', data: planetNode.data, position: planetNode.mesh.position });
      return;
    }

    const dsoNode = this.engine.deepSpaceRenderer.objectsMap.get(id);
    if (dsoNode) {
      this.focusDeepSpaceObject(dsoNode.data, dsoNode.position);
      this.showDetailModal({ type: 'deepSpace', data: dsoNode.data, position: dsoNode.position });
      return;
    }
  }

  private focusStarObject(data: StarData, position: Vector3) {
    if (this.engine.viewMode === 'realistic') {
      this.engine.focusSkyDirection(position, 12);
      return;
    }
    this.engine.flyToPosition(position, Math.max(10, scaleDistance(data.dist, this.engine.viewMode) * 0.5));
  }

  private focusDeepSpaceObject(data: DeepSpaceObjectData, position: Vector3) {
    const angularSize = data.galaxy?.majorArcmin ?? data.angularSizeArcmin;

    if (this.engine.viewMode === 'realistic') {
      this.engine.focusSkyObject(position, angularSize);
      return;
    }

    const renderedDiameter = angularDiameterToWorldSize(angularSize, Math.max(position.length(), 0.001));
    if (this.engine.viewMode === 'logarithmic') {
      // Logarithmic mode keeps each object's catalogue angular size while
      // compressing its distance. Focus from that rendered diameter.
      this.engine.flyToPosition(position, Math.max(2, renderedDiameter * 1.4));
      return;
    }

    const physicalDiameter = data.galaxy?.physicalDiameterLy;
    const focusRadius = physicalDiameter
      ? Math.max(20, physicalDiameter * 0.8)
      : Math.max(0.5, renderedDiameter * 1.4);
    this.engine.flyToPosition(position, focusRadius);
  }

  private bindEngineCallbacks() {
    this.engine.onHoverObject = (hovered, screenPos) => {
      if (!hovered) {
        this.tooltipElem.classList.add('hidden');
        return;
      }

      const d = hovered.data;
      const specColor = d.spectral ? getSpectralCssColor(d.spectral) : '#00e5ff';

      this.tooltipElem.innerHTML = `
        <div class="tooltip-header">
          <span class="tooltip-title">${d.name}</span>
          ${d.spectral ? `<span class="spec-badge" style="background:${specColor}">${d.spectral}</span>` : ''}
        </div>
        <div class="tooltip-body">
          <span>Type: <strong>${d.stellarType || d.type || 'Star'}</strong></span>
          <span>Distance: <strong>${d.dist !== undefined ? d.dist + ' ly' : (d.a ? d.a + ' AU' : 'Sol System')}</strong></span>
          <span>Constellation: <strong>${d.constellation || 'Solar System'}</strong></span>
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
    const d = selection.data;
    const content = document.getElementById('modal-content')!;

    if (selection.type === 'planet') {
      const appearance = PLANET_APPEARANCE[d.id];
      content.innerHTML = `
        <div class="modal-header planet-detail-header" style="--planet-colour:${d.color}">
          <span class="modal-type-badge">${appearance.kind}</span><h2>${d.name}</h2>
          <p class="planet-detail-subtitle">SOLAR SYSTEM / ${d.id === 'pluto' ? 'DWARF PLANET' : 'PLANET'}</p>
        </div>
        <p class="modal-description">${appearance.summary}</p>
        <div class="modal-grid">
          <div class="stat-box"><span class="stat-label">Diameter</span><span class="stat-value">${Math.round(d.radiusKm*2).toLocaleString()} km</span></div>
          <div class="stat-box"><span class="stat-label">Distance from Sun</span><span class="stat-value">${(selection.position.length()/LY_PER_AU).toFixed(2)} AU</span></div>
          <div class="stat-box"><span class="stat-label">Orbital period</span><span class="stat-value">${d.periodYears < 2 ? Math.round(d.periodYears*365.25)+' days' : d.periodYears.toFixed(1)+' years'}</span></div>
          <div class="stat-box"><span class="stat-label">Orbital inclination</span><span class="stat-value">${d.i.toFixed(2)}°</span></div>
        </div>
        <p class="planet-model-note">Illustrative surface detail · enlarged for visibility.<br>Drag to orbit. Scroll to explore the surface.</p>
        <div class="modal-actions"><button id="btn-inspect-planet" class="btn-action">Inspect ${d.name}</button><button id="btn-planet-home" class="btn-action secondary-action">Solar System</button></div>
      `;
      document.getElementById('btn-inspect-planet')!.addEventListener('click', () => this.engine.focusPlanet(d.id));
      document.getElementById('btn-planet-home')!.addEventListener('click', () => {
        document.getElementById('btn-view-sol')!.click();
        this.modalElem.classList.add('hidden');
      });
      this.modalElem.classList.remove('hidden');
      return;
    }

    let typeTag = selection.type?.toUpperCase();
    if (d.type === 'nebula') typeTag = 'NEBULA';
    if (d.type === 'galaxy') typeTag = 'GALAXY';
    if (d.type === 'galacticFeature') typeTag = 'GALACTIC FEATURE';
    if (d.isBrownDwarf) typeTag = 'BROWN DWARF';
    let spectralCss = d.spectral ? getSpectralCssColor(d.spectral) : '#00e5ff';

    content.innerHTML = `
      <div class="modal-header">
        <span class="modal-type-badge">${typeTag}</span>
        <h2>${d.name}</h2>
        ${d.spectral ? `<span class="spec-badge-lg" style="background:${spectralCss}">${d.spectral}</span>` : ''}
      </div>

      <div class="modal-grid">
        <div class="stat-box">
          <span class="stat-label">Classification</span>
          <span class="stat-value">${d.stellarType || 'Celestial Object'}</span>
        </div>

        <div class="stat-box">
          <span class="stat-label">Distance</span>
          <span class="stat-value">${d.dist !== undefined ? d.dist + ' Light-Years' : (d.a ? d.a + ' AU' : '0 AU')}</span>
        </div>

        <div class="stat-box">
          <span class="stat-label">Constellation</span>
          <span class="stat-value">${d.constellation || 'Solar System'}</span>
        </div>

        ${d.temp ? `
        <div class="stat-box">
          <span class="stat-label">Surface Temp</span>
          <span class="stat-value">${d.temp.toLocaleString()} K (${Math.round(d.temp - 273.15)}°C)</span>
        </div>` : ''}

        ${d.metallicity !== undefined ? `
        <div class="stat-box">
          <span class="stat-label">Metallicity [Fe/H]</span>
          <span class="stat-value">${d.metallicity >= 0 ? '+' : ''}${d.metallicity} dex</span>
        </div>` : ''}

        ${d.ageGyr !== undefined ? `
        <div class="stat-box">
          <span class="stat-label">Stellar Age</span>
          <span class="stat-value">${d.ageGyr} Gyr</span>
        </div>` : ''}

        ${d.lum ? `
        <div class="stat-box">
          <span class="stat-label">Luminosity</span>
          <span class="stat-value">${d.lum} L☉</span>
        </div>` : ''}

        ${d.rotationPeriodDays ? `
        <div class="stat-box">
          <span class="stat-label">Rotation Period</span>
          <span class="stat-value">${d.rotationPeriodDays} days</span>
        </div>` : ''}

        ${d.radialVelocityKmS !== undefined ? `
        <div class="stat-box">
          <span class="stat-label">Radial Velocity</span>
          <span class="stat-value">${d.radialVelocityKmS > 0 ? '+' : ''}${d.radialVelocityKmS} km/s</span>
        </div>` : ''}

        ${d.properMotionMasYr !== undefined ? `
        <div class="stat-box">
          <span class="stat-label">Proper Motion</span>
          <span class="stat-value">${d.properMotionMasYr} mas/yr</span>
        </div>` : ''}

        ${d.variableType ? `
        <div class="stat-box">
          <span class="stat-label">Variable Class</span>
          <span class="stat-value">${d.variableType}</span>
        </div>` : ''}

        ${d.exoplanets !== undefined ? `
        <div class="stat-box">
          <span class="stat-label">Known Exoplanets</span>
          <span class="stat-value">${d.exoplanets}</span>
        </div>` : ''}

        ${d.galaxy ? `
        <div class="stat-box">
          <span class="stat-label">Morphology</span>
          <span class="stat-value">${d.galaxy.morphology}</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Angular Extent</span>
          <span class="stat-value">${d.galaxy.majorArcmin}&prime; × ${d.galaxy.minorArcmin}&prime;</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Position Angle</span>
          <span class="stat-value">${d.galaxy.positionAngleDeg}&deg; east of north</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Visual Magnitude</span>
          <span class="stat-value">V ${d.galaxy.apparentMagnitudeV}</span>
        </div>` : ''}
      </div>

      <p class="modal-description">${d.description || 'Astronomical telemetry data.'}</p>

      ${d.galaxy?.source ? `<p class="modal-source">Appearance data: ${d.galaxy.source}.</p>` : ''}

      <div class="modal-actions">
        <button id="btn-fly-focus" class="btn-action">🎯 Center Camera View</button>
      </div>
    `;

    document.getElementById('btn-fly-focus')!.addEventListener('click', () => {
      if (selection.type === 'deepSpace') {
        this.focusDeepSpaceObject(d as DeepSpaceObjectData, selection.position);
      } else if (selection.type === 'star') {
        this.focusStarObject(d as StarData, selection.position);
      } else if (selection.type === 'constellation' && this.engine.viewMode === 'realistic') {
        this.engine.focusSkyDirection(selection.position, 35);
      } else {
        this.engine.flyToPosition(selection.position, selection.type === 'planet' ? 0.00005 : 15);
      }
    });

    this.modalElem.classList.remove('hidden');
  }
}

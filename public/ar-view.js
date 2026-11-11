/**
 * BRUSH — Augmented Reality & 3D Wall Studio Engine (ar-view.js)
 * 
 * Production-grade Augmented Reality poster visualization engine.
 * 
 * Architecture:
 * - Native Apple AR Quick Look where Safari supports rel="ar", using a generated product-specific USDZ.
 * - Genuine Spatial AR where WebXR immersive-ar and hit-testing are available (vertical-wall pose filtering,
 *   select tap mounting, and spatial anchoring).
 * - 3D Room Studio mockup for unsupported devices; its metric geometry is not live room tracking.
 * - Capability-gated Quick Look and WebXR routes, with no separate LiDAR mode.
 * - 100% on-device disposal of WebGL, media, and XR resources.
 */

(function () {
  'use strict';

  // Explicit AR Lifecycle State Machine
  const AR_STATES = {
    UNINITIALIZED: 'uninitialized',
    INITIALIZING: 'initializing',
    SCANNING: 'scanning',
    SURFACE_DETECTED: 'surface_detected',
    MOUNTED: 'mounted',
    STUDIO_MODE: 'studio_mode',
    CLOSED: 'closed'
  };

  // Exact physical print dimensions in metric meters (nominal artwork area)
  const POSTER_SIZES = {
    A5: {
      id: 'A5',
      name: 'A5',
      label: 'A5 (14.8 × 21 cm)',
      metric: '14.8 × 21 cm',
      imperial: '5.8 × 8.3 in',
      widthM: 0.148,
      heightM: 0.210,
      aspect: 0.148 / 0.210
    },
    A4: {
      id: 'A4',
      name: 'A4',
      label: 'A4 (21 × 29.7 cm)',
      metric: '21 × 29.7 cm',
      imperial: '8.3 × 11.7 in',
      widthM: 0.210,
      heightM: 0.297,
      aspect: 0.210 / 0.297
    },
    A3: {
      id: 'A3',
      name: 'A3',
      label: 'A3 (29.7 × 42 cm)',
      metric: '29.7 × 42 cm',
      imperial: '11.7 × 16.5 in',
      widthM: 0.297,
      heightM: 0.420,
      aspect: 0.297 / 0.420
    },
    '12x18': {
      id: '12x18',
      name: '12×18″',
      label: '12 × 18″ (30.5 × 45.7 cm)',
      metric: '30.5 × 45.7 cm',
      imperial: '12 × 18 in',
      widthM: 0.3048,
      heightM: 0.4572,
      aspect: 0.3048 / 0.4572
    },
    '13x19': {
      id: '13x19',
      name: '13×19″',
      label: '13 × 19″ (33 × 48.3 cm)',
      metric: '33 × 48.3 cm',
      imperial: '13 × 19 in',
      widthM: 0.3302,
      heightM: 0.4826,
      aspect: 0.3302 / 0.4826
    }
  };

  // Frame specifications (meters)
  const FRAME_CONFIG = {
    // Illustrative frame dimensions; catalogue frame measurements are not configured.
    mouldingWidth: 0.022,
    mouldingDepth: 0.024,
    mattingWidth: 0.024,
    colors: {
      black: { name: 'Black', hex: 0x141416, roughness: 0.45, metalness: 0.05 },
      white: { name: 'White', hex: 0xf5f5f5, roughness: 0.40, metalness: 0.0 },
    }
  };

  // Curated 3D Room Wall Studio Backdrops
  const STUDIO_WALLS = [
    { id: 'loft', name: 'Loft Brick Wall', url: '/posters/packs/mockups/loft-wall.webp' },
    { id: 'studio', name: 'Modern Studio', url: '/posters/packs/mockups/studio-wall.webp' },
    { id: 'spacious', name: 'Gallery Wall', url: '/posters/packs/mockups/spacious-wall.webp' }
  ];

  const state = {
    status: AR_STATES.UNINITIALIZED,
    isOpen: false,
    image: '',
    name: 'Art Poster',
    size: 'A4',
    frame: 'framed',
    frameColor: 'black',
    productId: '',
    usdzAssets: {},
    isLandscape: false,
    mode: 'studio-3d', // 'apple-quicklook' | 'webxr' | 'studio-3d'
    webXRAvailable: false,
    isPlaced: false,
    facingMode: 'environment',
    stream: null,
    xrSession: null,
    xrHitTestSource: null,
    xrRefSpace: null,
    xrViewerSpace: null,
    xrViewerPose: null,
    xrAnchor: null,
    latestXRHit: null,
    latestXRHitPose: null,
    deviceOrientationSupported: false,
    wallDistanceMeters: 1.35,
    currentStudioWallIndex: 0,
    placedPosition: null,
    placedQuaternion: null,
    currentOrientationQuaternion: null,
    usdzUrl: '',
    availableSizes: Object.keys(POSTER_SIZES),
    frameColorsBySize: {}
  };

  // DOM Elements
  let overlayEl = null;
  let videoEl = null;
  let threeCanvas = null;
  let wallCanvasFallback = null;
  let scanningPill = null;
  let arkitBtnEl = null;
  let infoDimsEl = null;
  let infoTitleEl = null;
  let appleHeroBanner = null;
  let desktopQrModal = null;

  // Three.js Scene Variables
  let renderer = null;
  let scene = null;
  let camera = null;
  let posterGroup = null;
  let reticleMesh = null;
  let posterTexture = null;
  let contactShadowTex = null;
  let animFrameId = null;
  let usdzExportVersion = 0;
  let openRequestVersion = 0;

  // Accurate Browser & Hardware Capability Checks
  function checkQuickLookSupport() {
    if (typeof document === 'undefined') return false;
    const a = document.createElement('a');
    return !!(a.relList && a.relList.supports && a.relList.supports('ar'));
  }

  async function checkWebXRSupport() {
    if (typeof navigator === 'undefined' || !navigator.xr || !navigator.xr.isSessionSupported) return false;
    try {
      return await navigator.xr.isSessionSupported('immersive-ar');
    } catch (_) {
      return false;
    }
  }

  function isMobileDevice() {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  // Lazy-load Three.js and the USDZ exporter used by native Quick Look.
  let librariesLoadedPromise = null;
  function ensureLibraries() {
    if (window.THREE && (!checkQuickLookSupport() || (window.THREE.USDZExporter && window.fflate))) return Promise.resolve();
    if (librariesLoadedPromise) return librariesLoadedPromise;

    librariesLoadedPromise = new Promise((resolve) => {
      function loadScript(src) {
        return new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = src;
          s.onload = res;
          s.onerror = rej;
          document.head.appendChild(s);
        });
      }

      const pThree = window.THREE ? Promise.resolve() : loadScript('/vendor/three.min.js');
      pThree
        .then(() => {
          if (!checkQuickLookSupport()) return null;
          return window.fflate ? null : loadScript('/vendor/fflate.min.js');
        })
        .then(() => {
          if (!checkQuickLookSupport() || window.THREE.USDZExporter) return null;
          return loadScript('/vendor/USDZExporter.js');
        })
        .then(resolve)
        .catch(err => {
          console.warn('Library loading note:', err);
          resolve();
        });
    });

    return librariesLoadedPromise;
  }

  function getDimensions(sizeKey, isLandscape) {
    const base = POSTER_SIZES[sizeKey] || POSTER_SIZES.A4;
    return {
      name: base.name,
      label: base.label,
      metric: base.metric,
      imperial: base.imperial,
      widthM: isLandscape ? base.heightM : base.widthM,
      heightM: isLandscape ? base.widthM : base.heightM,
      aspect: isLandscape ? (1 / base.aspect) : base.aspect
    };
  }

  /**
   * Generates a soft procedural ambient contact shadow texture
   */
  function getContactShadowTexture() {
    if (contactShadowTex) return contactShadowTex;
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');

    const grad = ctx.createRadialGradient(64, 64, 12, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    grad.addColorStop(0.35, 'rgba(0, 0, 0, 0.45)');
    grad.addColorStop(0.7, 'rgba(0, 0, 0, 0.15)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);

    contactShadowTex = new THREE.CanvasTexture(c);
    contactShadowTex.wrapS = THREE.ClampToEdgeWrapping;
    contactShadowTex.wrapT = THREE.ClampToEdgeWrapping;
    return contactShadowTex;
  }

  /**
   * Generates a clean procedural fallback texture if artwork fails to load
   */
  function createFallbackTexture(name) {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 848;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 600, 848);
    grad.addColorStop(0, '#1c1c24');
    grad.addColorStop(1, '#0e0e12');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 848);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 12;
    ctx.strokeRect(20, 20, 560, 808);

    ctx.fillStyle = '#ff6b35';
    ctx.font = '700 36px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BRUSH ART', 300, 400);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = '500 20px Inter, sans-serif';
    ctx.fillText(name || 'Premium Wall Poster', 300, 440);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function createMattingGeometry(outerW, outerH, innerW, innerH) {
    const shape = new THREE.Shape();
    const hw = outerW / 2;
    const hh = outerH / 2;
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();

    const hole = new THREE.Path();
    const ihw = innerW / 2;
    const ihh = innerH / 2;
    hole.moveTo(-ihw, -ihh);
    hole.lineTo(ihw, -ihh);
    hole.lineTo(ihw, ihh);
    hole.lineTo(-ihw, ihh);
    hole.closePath();
    shape.holes.push(hole);

    return new THREE.ShapeGeometry(shape);
  }

  /**
   * Builds the shallow 3D framed or unframed poster model in world-space meters.
   * Coordinate conventions:
   * - Front of poster faces +Z.
   * - Rear surface sits flush against Z = 0 (the wall plane).
   * - Up is +Y, Right is +X.
   */
  function buildPoster3DModel() {
    if (!scene || !posterTexture) return;

    if (posterGroup) {
      scene.remove(posterGroup);
      disposeHierarchy(posterGroup);
      posterGroup = null;
    }

    const group = new THREE.Group();
    group.name = 'posterRoot';

    const dim = getDimensions(state.size, state.isLandscape);
    const pw = dim.widthM;
    const ph = dim.heightM;

    if (state.frame === 'unframed') {
      // 1. Thin print surface (0.6mm thickness)
      const printGeo = new THREE.BoxGeometry(pw, ph, 0.0006);
      const printMat = new THREE.MeshStandardMaterial({
        map: posterTexture,
        roughness: 0.85,
        metalness: 0.0
      });
      const printMesh = new THREE.Mesh(printGeo, printMat);
      printMesh.position.z = 0.0015;
      group.add(printMesh);

      // 2. Soft contact drop shadow against wall
      const shadowGeo = new THREE.PlaneGeometry(pw + 0.016, ph + 0.016);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: getContactShadowTexture(),
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      });
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.position.set(0, -0.002, 0.0004);
      group.add(shadowMesh);
    } else {
      // ===== FRAMED POSTER =====
      const mW = FRAME_CONFIG.mouldingWidth;
      const mD = FRAME_CONFIG.mouldingDepth;
      const matW = FRAME_CONFIG.mattingWidth;

      const innerW = pw;
      const innerH = ph;
      const mattingOuterW = innerW + matW * 2;
      const mattingOuterH = innerH + matW * 2;
      const frameOuterW = mattingOuterW + mW * 2;
      const frameOuterH = mattingOuterH + mW * 2;

      const fCfg = FRAME_CONFIG.colors[state.frameColor] || FRAME_CONFIG.colors.black;
      const frameMat = new THREE.MeshStandardMaterial({
        color: fCfg.hex,
        roughness: fCfg.roughness,
        metalness: fCfg.metalness
      });

      // Frame Moulding Bars
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(frameOuterW, mW, mD), frameMat);
      topBar.position.set(0, (frameOuterH - mW) / 2, mD / 2);
      group.add(topBar);

      const bottomBar = new THREE.Mesh(new THREE.BoxGeometry(frameOuterW, mW, mD), frameMat);
      bottomBar.position.set(0, -(frameOuterH - mW) / 2, mD / 2);
      group.add(bottomBar);

      const sideH = frameOuterH - mW * 2;
      const leftBar = new THREE.Mesh(new THREE.BoxGeometry(mW, sideH, mD), frameMat);
      leftBar.position.set(-(frameOuterW - mW) / 2, 0, mD / 2);
      group.add(leftBar);

      const rightBar = new THREE.Mesh(new THREE.BoxGeometry(mW, sideH, mD), frameMat);
      rightBar.position.set((frameOuterW - mW) / 2, 0, mD / 2);
      group.add(rightBar);

      // Museum Archival Matting
      const mattingMat = new THREE.MeshStandardMaterial({
        color: 0xf7f5ee,
        roughness: 0.90,
        metalness: 0.0
      });
      const mattingGeo = createMattingGeometry(mattingOuterW, mattingOuterH, innerW, innerH);
      const mattingMesh = new THREE.Mesh(mattingGeo, mattingMat);
      mattingMesh.position.z = mD - 0.007;
      group.add(mattingMesh);

      // Recessed Poster Artwork
      const artGeo = new THREE.PlaneGeometry(innerW, innerH);
      const artMat = new THREE.MeshStandardMaterial({
        map: posterTexture,
        roughness: 0.82,
        metalness: 0.0
      });
      const artMesh = new THREE.Mesh(artGeo, artMat);
      artMesh.position.z = mD - 0.008;
      group.add(artMesh);

      // Protective Glare Glass Plane
      const glassGeo = new THREE.PlaneGeometry(mattingOuterW, mattingOuterH);
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.08
      });
      const glassMesh = new THREE.Mesh(glassGeo, glassMat);
      glassMesh.position.z = mD - 0.002;
      group.add(glassMesh);

      // Wall Contact Shadow
      const shadowGeo = new THREE.PlaneGeometry(frameOuterW + 0.045, frameOuterH + 0.045);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: getContactShadowTexture(),
        transparent: true,
        opacity: 0.62,
        depthWrite: false
      });
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.position.set(0, -0.008, 0.0006);
      group.add(shadowMesh);
    }

    // Invisible drag hit plane for smooth interaction
    const hitW = (state.frame === 'framed' ? pw + 0.10 : pw) + 0.14;
    const hitH = (state.frame === 'framed' ? ph + 0.10 : ph) + 0.14;
    const hitGeo = new THREE.PlaneGeometry(hitW, hitH);
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitMesh = new THREE.Mesh(hitGeo, hitMat);
    hitMesh.name = 'dragHitPlane';
    hitMesh.position.z = 0.026;
    group.add(hitMesh);

    posterGroup = group;
    scene.add(posterGroup);

    // If placed, restore exact coordinates; else hide until mounted
    if (state.isPlaced && state.placedPosition && state.placedQuaternion) {
      posterGroup.position.copy(state.placedPosition);
      posterGroup.quaternion.copy(state.placedQuaternion);
      posterGroup.visible = true;
    } else {
      posterGroup.visible = false;
    }

    if (state.isOpen && checkQuickLookSupport()) updateUSDZPayload().catch(console.warn);

  }

  function setQuickLookAsset(url) {
    const heroLink = document.getElementById('ar-ios-direct-link');
    const candidates = [arkitBtnEl, heroLink].filter(Boolean);
    let assetUrl = '';
    try {
      if (typeof url === 'string' && /^data:model\/vnd\.usdz\+zip;base64,[a-z0-9+/]+=*$/i.test(url)) {
        assetUrl = `${url.split('#')[0]}#allowsContentScaling=0&canonicalWebPageURL=${encodeURIComponent(location.href)}`;
      }
      const parsed = new URL(url || '', location.href);
      const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(location.hostname) && parsed.origin === location.origin;
      if (!assetUrl && (parsed.protocol === 'https:' || isLocalDevelopment) && /\.usdz$/i.test(parsed.pathname)) {
        parsed.hash = 'allowsContentScaling=0';
        assetUrl = parsed.href;
      }
    } catch (_) {}

    state.usdzUrl = assetUrl;
    candidates.forEach(link => {
      if (assetUrl) link.href = assetUrl;
      else link.removeAttribute('href');
      link.style.display = assetUrl && checkQuickLookSupport() ? 'inline-flex' : 'none';
    });
    if (appleHeroBanner) appleHeroBanner.style.display = assetUrl && checkQuickLookSupport() ? 'flex' : 'none';
    return assetUrl;
  }

  async function updateUSDZPayload() {
    if (!posterGroup || !window.THREE || !window.THREE.USDZExporter || !window.fflate) return null;
    const exportVersion = ++usdzExportVersion;
    try {
      const exportModel = posterGroup.clone(true);
      exportModel.position.set(0, 0, 0);
      exportModel.quaternion.identity();
      exportModel.scale.set(1, 1, 1);
      exportModel.updateMatrixWorld(true);
      const bytes = await new THREE.USDZExporter().parse(exportModel);
      if (!state.isOpen || exportVersion !== usdzExportVersion) return null;
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 8192, bytes.length)));
      }
      const dataUri = `data:model/vnd.usdz+zip;base64,${btoa(binary)}`;
      return setQuickLookAsset(dataUri);
    } catch (err) {
      if (exportVersion === usdzExportVersion) setQuickLookAsset('');
      console.warn('USDZ generation failed:', err);
      return null;
    }
  }

  function syncQuickLookVariant() {
    const key = `${state.size}|${state.frame}|${state.frameColor}`;
    setQuickLookAsset(state.usdzAssets[key] || '');
  }

  /**
   * Builds the 3D Wall-Alignment Reticle matching the active product dimensions
   */
  function buildReticle() {
    if (reticleMesh && scene) {
      scene.remove(reticleMesh);
      disposeHierarchy(reticleMesh);
      reticleMesh = null;
    }

    const group = new THREE.Group();
    group.name = 'reticleGroup';

    const dim = getDimensions(state.size, state.isLandscape);
    const boxW = (dim.widthM / 2) + (state.frame === 'framed' ? 0.024 : 0.008);
    const boxH = (dim.heightM / 2) + (state.frame === 'framed' ? 0.024 : 0.008);
    const bracketSize = Math.min(boxW, boxH) * 0.38;

    // Center Ring
    const ringGeo = new THREE.RingGeometry(0.038, 0.045, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff4c24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });
    group.add(new THREE.Mesh(ringGeo, ringMat));

    // Center Dot
    const dotGeo = new THREE.CircleGeometry(0.005, 16);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide
    });
    group.add(new THREE.Mesh(dotGeo, dotMat));

    // Wall Footprint Surface Plane
    const footprintGeo = new THREE.PlaneGeometry(boxW * 2, boxH * 2);
    const footprintMat = new THREE.MeshBasicMaterial({
      color: 0xff4c24,
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    group.add(new THREE.Mesh(footprintGeo, footprintMat));

    // Corner Brackets
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95
    });

    const corners = [
      [-boxW, -boxH, 1, 1],
      [boxW, -boxH, -1, 1],
      [boxW, boxH, -1, -1],
      [-boxW, boxH, 1, -1]
    ];

    corners.forEach(([cx, cy, dx, dy]) => {
      const points = [
        new THREE.Vector3(cx + dx * bracketSize, cy, 0.001),
        new THREE.Vector3(cx, cy, 0.001),
        new THREE.Vector3(cx, cy + dy * bracketSize, 0.001)
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      group.add(new THREE.Line(geo, lineMat));
    });

    group.matrixAutoUpdate = true;
    group.visible = false;
    scene.add(group);
    reticleMesh = group;
  }

  function disposeHierarchy(obj) {
    if (!obj) return;
    obj.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach(m => m.dispose());
        } else {
          node.material.dispose();
        }
      }
    });
  }

  function initDOM() {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'brush-ar-overlay';
    overlayEl.className = 'brush-ar-overlay';
    overlayEl.setAttribute('role', 'dialog');
    overlayEl.setAttribute('aria-modal', 'true');
    overlayEl.setAttribute('aria-label', 'Augmented Reality Wall View');

    overlayEl.innerHTML = `
      <!-- Camera Video Feed (Used only in WebXR / mobile camera mode) -->
      <video id="ar-video-feed" class="ar-video-feed" playsinline webkit-playsinline autoplay muted style="display:none;"></video>

      <!-- Three.js 3D WebGL Canvas -->
      <canvas id="ar-three-canvas" class="ar-three-canvas"></canvas>

      <!-- Calibrated Wall Backdrop (3D Studio Room) -->
      <div id="ar-wall-backdrop" class="ar-wall-backdrop" style="display:block;"></div>

      <!-- Flash Overlay for Snapshot -->
      <div id="ar-camera-flash" class="ar-camera-flash"></div>

      <!-- Top Header Bar -->
      <header class="ar-top-bar">
        <button type="button" class="ar-bar-btn ar-exit-btn" id="ar-exit-btn" aria-label="Exit AR mode" title="Exit">
          <i class="fa-solid fa-arrow-left"></i>
          <span class="ar-btn-text">Exit</span>
        </button>

        <div class="ar-info-pill" id="ar-info-pill">
          <span class="ar-info-title" id="ar-info-title">Art Poster</span>
          <span class="ar-info-sep">•</span>
          <span class="ar-info-dims" id="ar-info-dims">A4 • Framed</span>
        </div>

        <div class="ar-top-actions">
          <!-- Apple AR Quick Look Button (Displayed ONLY on supported Apple devices) -->
          <a rel="ar" class="ar-bar-btn ar-arkit-btn" id="ar-arkit-btn" aria-label="View this poster on your wall in AR" title="View on Your Wall in AR" style="display:none; text-decoration:none;">
            <img id="ar-arkit-icon-img" src="/img/preview/poster-1.jpg" style="width:18px;height:18px;border-radius:3px;object-fit:cover;" alt="View this poster on your wall in AR">
          </a>

          <!-- QR Code Button for Desktop Users to View on Mobile -->
          <button type="button" class="ar-bar-btn" id="ar-desktop-qr-btn" title="Open this product on a mobile device">
            <i class="fa-solid fa-mobile-screen"></i>
            <span class="ar-btn-text">Open on mobile</span>
          </button>

          <button type="button" class="ar-bar-btn" id="ar-live-ar-btn" title="Start tracked live AR" style="display:none;">
            <i class="fa-solid fa-cube"></i>
            <span class="ar-btn-text">Start live AR</span>
          </button>

          <!-- Studio Wall Cycle Button -->
          <button type="button" class="ar-bar-btn" id="ar-room-wall-btn" title="Change Studio Room Wall">
            <i class="fa-solid fa-image"></i>
            <span class="ar-btn-text" id="ar-room-wall-text">Wall</span>
          </button>
        </div>
      </header>

      <!-- Center Guidance Hint / Status Banner -->
      <div class="ar-guidance-hint" id="ar-guidance-hint">
        <i class="fa-solid fa-circle-notch fa-spin"></i>
        <span id="ar-guidance-text">3D Wall Studio • Metric scale in a room mockup</span>
      </div>

      <!-- iOS Hero Quick Look Card (Prompts native Apple AR on iPhone/iPad) -->
      <div id="ar-ios-hero-banner" class="ar-fallback-card" style="display:none; bottom: auto; top: calc(100px + env(safe-area-inset-top, 0px));">
        <div class="ar-fallback-icon"><i class="fa-brands fa-apple"></i></div>
        <div class="ar-fallback-content">
          <h3>View on Your Wall</h3>
          <p>Point your camera at any wall in your room to anchor this poster at 1:1 real-world dimensions.</p>
        </div>
        <div class="ar-fallback-actions">
          <a rel="ar" id="ar-ios-direct-link" class="ar-action-btn ar-cam-btn" aria-label="Place this poster on my wall" style="text-decoration:none; display:none;">
            <img id="ar-hero-icon-img" src="/img/preview/poster-1.jpg" style="width:24px;height:24px;border-radius:4px;object-fit:cover;" alt="Place this poster on my wall">
          </a>
          <button type="button" class="ar-action-btn" id="ar-ios-dismiss-btn">
            Explore in 3D Wall Studio
          </button>
        </div>
      </div>

      <!-- Desktop Mobile AR QR Code Modal -->
      <div id="ar-desktop-qr-modal" class="ar-fallback-card" style="display:none;">
        <button type="button" class="ar-fallback-close-btn" id="ar-qr-close-btn" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="ar-fallback-icon"><i class="fa-solid fa-qrcode"></i></div>
        <div class="ar-fallback-content">
          <h3>Open This Product on Mobile</h3>
          <p>Scan to open this product page on your phone. Spatial placement is available only on supported AR devices.</p>
          <div id="ar-qr-container" style="margin: 12px auto; width: 180px; height: 180px; background: #fff; padding: 10px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
            <img id="ar-qr-img" src="" alt="Scan for AR" style="width: 160px; height: 160px; display: block;">
          </div>
        </div>
      </div>

      <!-- Bottom Floating Controls Shelf -->
      <footer class="ar-bottom-dock" id="ar-bottom-dock">
        <div class="ar-controls-shelf">
          <!-- Size Selector (All 5 Store Sizes) -->
          <div class="ar-segment-group" role="radiogroup" aria-label="Poster Size">
            <button type="button" class="ar-seg-btn" data-size="A5" id="ar-size-a5">A5</button>
            <button type="button" class="ar-seg-btn active" data-size="A4" id="ar-size-a4">A4</button>
            <button type="button" class="ar-seg-btn" data-size="A3" id="ar-size-a3">A3</button>
            <button type="button" class="ar-seg-btn" data-size="12x18" id="ar-size-12x18">12×18″</button>
            <button type="button" class="ar-seg-btn" data-size="13x19" id="ar-size-13x19">13×19″</button>
          </div>

          <div class="ar-shelf-divider"></div>

          <!-- Framing Toggle -->
          <div class="ar-segment-group" role="radiogroup" aria-label="Framing Type">
            <button type="button" class="ar-seg-btn" data-frame="unframed" id="ar-frame-none" title="Unframed Print">Unframed</button>
            <button type="button" class="ar-seg-btn active" data-frame="framed" id="ar-frame-framed" title="Illustrative frame preview; actual outer dimensions may vary">Framed</button>
          </div>

          <!-- Frame Finish Palette -->
          <div class="ar-frame-color-group" id="ar-frame-color-group">
            <button type="button" class="ar-color-dot active" data-color="black" title="Satin Black Frame" style="background:#141416;"></button>
            <button type="button" class="ar-color-dot" data-color="white" title="Nordic White Frame" style="background:#f4f4f4; border: 1px solid rgba(0,0,0,0.15);"></button>
          </div>

          <div class="ar-shelf-divider"></div>

          <!-- Wall Distance Calibrator -->
          <button type="button" class="ar-seg-btn" id="ar-dist-btn" title="Cycle Wall Distance (1.0m, 1.4m, 2.0m)">
            <i class="fa-solid fa-ruler-horizontal"></i> <span id="ar-dist-text">1.4m Wall</span>
          </button>
        </div>

        <!-- Action Row: Re-mount, Shutter Button, Recenter -->
        <div class="ar-action-dock">
          <button type="button" class="ar-action-tool-btn" id="ar-remount-btn" title="Reposition poster on wall">
            <i class="fa-solid fa-arrows-up-down-left-right"></i>
            <span>Move</span>
          </button>

          <button type="button" class="ar-shutter-btn" id="ar-shutter-btn" title="Capture photo of your wall with poster" aria-label="Take Wall Snapshot">
            <div class="ar-shutter-ring"></div>
            <div class="ar-shutter-core"><i class="fa-solid fa-camera"></i></div>
          </button>

          <button type="button" class="ar-action-tool-btn" id="ar-recenter-btn" title="Reset poster to center">
            <i class="fa-solid fa-arrows-to-dot"></i>
            <span>Center</span>
          </button>
        </div>
      </footer>
    `;

    document.body.appendChild(overlayEl);

    videoEl = document.getElementById('ar-video-feed');
    threeCanvas = document.getElementById('ar-three-canvas');
    wallCanvasFallback = document.getElementById('ar-wall-backdrop');
    scanningPill = document.getElementById('ar-guidance-hint');
    arkitBtnEl = document.getElementById('ar-arkit-btn');
    infoDimsEl = document.getElementById('ar-info-dims');
    infoTitleEl = document.getElementById('ar-info-title');
    appleHeroBanner = document.getElementById('ar-ios-hero-banner');
    desktopQrModal = document.getElementById('ar-desktop-qr-modal');

    attachEvents();
  }

  function attachEvents() {
    // Exit button
    document.getElementById('ar-exit-btn').addEventListener('click', close);

    // Room Wall Cycle Button
    const roomWallBtn = document.getElementById('ar-room-wall-btn');
    if (roomWallBtn) {
      roomWallBtn.addEventListener('click', cycleStudioWall);
    }

    // Size Selector Buttons
    document.querySelectorAll('.ar-segment-group [data-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        setSize(btn.dataset.size);
      });
    });

    // Frame Selector Buttons
    document.querySelectorAll('.ar-segment-group [data-frame]').forEach(btn => {
      btn.addEventListener('click', () => {
        setFrame(btn.dataset.frame);
      });
    });

    // Frame Color Dots
    document.querySelectorAll('.ar-frame-color-group [data-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        setFrameColor(btn.dataset.color);
      });
    });

    // Wall Distance Toggle Button
    const distBtn = document.getElementById('ar-dist-btn');
    if (distBtn) {
      distBtn.addEventListener('click', cycleWallDistance);
    }

    // Re-mount / Move Poster Button
    const remountBtn = document.getElementById('ar-remount-btn');
    if (remountBtn) {
      remountBtn.addEventListener('click', () => {
        if (state.xrAnchor && typeof state.xrAnchor.delete === 'function') {
          try { state.xrAnchor.delete(); } catch (_) {}
        }
        state.xrAnchor = null;
        state.isPlaced = false;
        state.status = AR_STATES.SCANNING;
        if (posterGroup) posterGroup.visible = false;
        if (reticleMesh) reticleMesh.visible = true;
        updateScanningGuidance('Point at wall • Tap to mount poster', 'fa-hand-pointer');
      });
    }

    // Recenter Button
    const recenterBtn = document.getElementById('ar-recenter-btn');
    if (recenterBtn) {
      recenterBtn.addEventListener('click', () => {
        if (camera) {
          const forward = new THREE.Vector3(0, 0, -state.wallDistanceMeters);
          forward.applyQuaternion(camera.quaternion).add(camera.position);
          if (!state.placedPosition) state.placedPosition = new THREE.Vector3();
          if (!state.placedQuaternion) state.placedQuaternion = new THREE.Quaternion();
          state.placedPosition.copy(forward);
          state.placedQuaternion.copy(camera.quaternion);
          state.isPlaced = true;
          state.status = AR_STATES.MOUNTED;
          if (reticleMesh) reticleMesh.visible = false;
          if (posterGroup) {
            posterGroup.position.copy(state.placedPosition);
            posterGroup.quaternion.copy(state.placedQuaternion);
            posterGroup.visible = true;
            triggerMountSnapAnimation();
          }
          updateScanningGuidance('Poster centered on wall • Drag to adjust', 'fa-check');
        }
      });
    }

    // Shutter / Snapshot Button
    const shutterBtn = document.getElementById('ar-shutter-btn');
    if (shutterBtn) {
      shutterBtn.addEventListener('click', takeWallSnapshot);
    }

    // Desktop QR Button
    const qrBtn = document.getElementById('ar-desktop-qr-btn');
    if (qrBtn) {
      qrBtn.addEventListener('click', () => {
        if (desktopQrModal) {
          const qrImg = document.getElementById('ar-qr-img');
          const targetUrl = `https://www.brush-art.in/shop/?product=${encodeURIComponent(state.productId || state.name)}&ar=1`;
          if (qrImg) {
            qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(targetUrl)}&color=141416`;
          }
          desktopQrModal.style.display = 'flex';
        }
      });
    }

    const qrCloseBtn = document.getElementById('ar-qr-close-btn');
    if (qrCloseBtn && desktopQrModal) {
      qrCloseBtn.addEventListener('click', () => {
        desktopQrModal.style.display = 'none';
      });
    }

    const liveArBtn = document.getElementById('ar-live-ar-btn');
    if (liveArBtn) {
      liveArBtn.addEventListener('click', () => {
        liveArBtn.disabled = true;
        startWebXRSession().then(started => {
          if (!started) {
            liveArBtn.disabled = false;
            updateScanningGuidance('Live AR could not start; the room mockup remains available.', 'fa-circle-exclamation');
          }
        });
      });
    }

    const iosDismissBtn = document.getElementById('ar-ios-dismiss-btn');
    if (iosDismissBtn && appleHeroBanner) {
      iosDismissBtn.addEventListener('click', () => {
        appleHeroBanner.style.display = 'none';
      });
    }

    // Screen Tap & Wall-Plane Drag Interaction
    let pointerDownPos = { x: 0, y: 0 };
    let isDragging = false;
    let dragPlane = null;
    let dragOffset = null;

    threeCanvas.addEventListener('pointerdown', (e) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
      isDragging = false;
      if (!state.isOpen || state.mode !== 'studio-3d' || !camera || typeof THREE === 'undefined') return;

      if (!state.isPlaced || !posterGroup) return;

      const rect = threeCanvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const hits = raycaster.intersectObjects(posterGroup.children, true);
      if (hits.length > 0) {
        isDragging = true;
        try { threeCanvas.setPointerCapture(e.pointerId); } catch (_) {}
        if (!dragOffset) dragOffset = new THREE.Vector3();
        const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(posterGroup.quaternion);
        dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, posterGroup.position);
        const hitPt = new THREE.Vector3();
        if (raycaster.ray.intersectPlane(dragPlane, hitPt)) {
          dragOffset.copy(posterGroup.position).sub(hitPt);
        }
      }
    });

    threeCanvas.addEventListener('pointermove', (e) => {
      if (!isDragging || state.mode !== 'studio-3d' || !dragPlane || !posterGroup || !camera) return;
      const rect = threeCanvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
      const hitPt = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(dragPlane, hitPt)) {
        posterGroup.position.copy(hitPt).add(dragOffset);
        if (state.placedPosition) state.placedPosition.copy(posterGroup.position);
      }
    });

    const finishPointer = (e) => {
      if (isDragging) {
        isDragging = false;
        dragPlane = null;
        try { threeCanvas.releasePointerCapture(e.pointerId); } catch (_) {}
        return;
      }
      const dx = Math.abs(e.clientX - pointerDownPos.x);
      const dy = Math.abs(e.clientY - pointerDownPos.y);
      if (dx < 12 && dy < 12) {
        onCanvasTap(e);
      }
    };

    threeCanvas.addEventListener('pointerup', finishPointer);
    threeCanvas.addEventListener('pointercancel', finishPointer);

    // Escape Key to exit
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isOpen) {
        close();
      }
    });
  }

  function cycleStudioWall() {
    state.currentStudioWallIndex = (state.currentStudioWallIndex + 1) % STUDIO_WALLS.length;
    const w = STUDIO_WALLS[state.currentStudioWallIndex];
    if (wallCanvasFallback) {
      wallCanvasFallback.style.backgroundImage = `url('${w.url}')`;
      wallCanvasFallback.style.display = 'block';
    }
    if (videoEl) videoEl.style.display = 'none';
    state.mode = 'studio-3d';
    state.status = AR_STATES.STUDIO_MODE;
    const textEl = document.getElementById('ar-room-wall-text');
    if (textEl) textEl.textContent = w.name.split(' ')[0];
    updateScanningGuidance(`Studio Wall: ${w.name}`, 'fa-image');
  }

  function cycleWallDistance() {
    if (state.wallDistanceMeters < 1.2) {
      state.wallDistanceMeters = 1.35;
    } else if (state.wallDistanceMeters < 1.7) {
      state.wallDistanceMeters = 2.0;
    } else {
      state.wallDistanceMeters = 1.0;
    }
    const distText = document.getElementById('ar-dist-text');
    if (distText) distText.textContent = `${state.wallDistanceMeters.toFixed(1)}m Wall`;

    if (state.isPlaced && posterGroup && camera) {
      const forward = new THREE.Vector3(0, 0, -state.wallDistanceMeters);
      forward.applyQuaternion(camera.quaternion).add(camera.position);
      if (state.placedPosition) state.placedPosition.copy(forward);
      posterGroup.position.copy(forward);
    }
    updateScanningGuidance(`Viewing distance: ${state.wallDistanceMeters.toFixed(1)}m`, 'fa-ruler-horizontal');
  }

  function triggerMountSnapAnimation() {
    if (!posterGroup) return;
    const startScale = 0.88;
    posterGroup.scale.set(startScale, startScale, startScale);
    const start = performance.now();
    const duration = 280;

    function animateMount(time) {
      const elapsed = time - start;
      const progress = Math.min(elapsed / duration, 1);
      const s = 1 + Math.sin(progress * Math.PI) * 0.08 * (1 - progress);
      const curr = startScale + (1 - startScale) * progress;
      const finalScale = curr * s;
      if (posterGroup) {
        posterGroup.scale.set(finalScale, finalScale, finalScale);
      }
      if (progress < 1) {
        requestAnimationFrame(animateMount);
      } else if (posterGroup) {
        posterGroup.scale.set(1, 1, 1);
      }
    }
    requestAnimationFrame(animateMount);
  }

  function updateScanningGuidance(text, iconClass = 'fa-circle-notch fa-spin') {
    const textEl = document.getElementById('ar-guidance-text');
    const hint = document.getElementById('ar-guidance-hint');
    if (textEl) textEl.textContent = text;
    if (hint) {
      const icon = hint.querySelector('i');
      if (icon) icon.className = `fa-solid ${iconClass}`;
      hint.classList.remove('fade-out');
    }
  }

  /**
   * Initializes Three.js WebGL Scene & Camera
   */
  function initThreeScene() {
    if (renderer) return;

    scene = new THREE.Scene();

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Calibrated Perspective Camera (63° vertical FOV)
    camera = new THREE.PerspectiveCamera(63, w / h, 0.01, 20);
    camera.position.set(0, 0, 0);

    state.placedPosition = new THREE.Vector3(0, 0, -state.wallDistanceMeters);
    state.placedQuaternion = new THREE.Quaternion();

    // Soft Warm Directional Key Light
    const dirLight = new THREE.DirectionalLight(0xfff8ed, 1.25);
    dirLight.position.set(0.6, 1.6, 1.2);
    scene.add(dirLight);

    // Ambient Light
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd0c9be, 0.85);
    hemiLight.position.set(0, 2, 0);
    scene.add(hemiLight);

    // Renderer
    renderer = new THREE.WebGLRenderer({
      canvas: threeCanvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    buildReticle();

    window.addEventListener('resize', onWindowResize);
  }

  function onWindowResize() {
    if (!renderer || !camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  /**
   * Screen Tap Handler: Places the poster on the wall
   */
  function onCanvasTap(e) {
    if (state.mode !== 'studio-3d') return;
    if (!scene || !camera || !posterGroup) return;

    if (state.isPlaced) return;

    // Raycast onto virtual wall plane
    const rect = threeCanvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    const wallNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
    const wallPoint = new THREE.Vector3(0, 0, -state.wallDistanceMeters).applyQuaternion(camera.quaternion).add(camera.position);
    const wallPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(wallNormal, wallPoint);

    const hitPoint = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(wallPlane, hitPoint)) {
      if (!state.placedPosition) state.placedPosition = new THREE.Vector3();
      if (!state.placedQuaternion) state.placedQuaternion = new THREE.Quaternion();
      state.placedPosition.copy(hitPoint);
      state.placedQuaternion.copy(camera.quaternion);
      posterGroup.position.copy(hitPoint);
      posterGroup.quaternion.copy(camera.quaternion);
      posterGroup.visible = true;
      state.isPlaced = true;
      state.status = AR_STATES.MOUNTED;
      if (reticleMesh) reticleMesh.visible = false;

      triggerMountSnapAnimation();
      if (navigator.vibrate) navigator.vibrate([20, 25, 40]);
      updateScanningGuidance('Poster mounted on wall • Drag to adjust', 'fa-check');
      setTimeout(() => {
        const hint = document.getElementById('ar-guidance-hint');
        if (hint) hint.classList.add('fade-out');
      }, 3000);
    }
  }

  /**
   * WebXR Tap Selection Handler (Handles genuine Android Chrome select taps)
   */
  function onXRSelect(e) {
    if (state.mode !== 'webxr') return;
    if (state.isPlaced) return;

    if (state.latestXRHitPose && posterGroup) {
      const placement = getVerticalWallPose(state.latestXRHitPose);
      if (!placement) return;
      posterGroup.position.copy(placement.position);
      posterGroup.quaternion.copy(placement.quaternion);

      if (!state.placedPosition) state.placedPosition = new THREE.Vector3();
      if (!state.placedQuaternion) state.placedQuaternion = new THREE.Quaternion();
      state.placedPosition.copy(posterGroup.position);
      state.placedQuaternion.copy(posterGroup.quaternion);

      // Create stable WebXR spatial anchor if supported
      if (state.latestXRHit && typeof state.latestXRHit.createAnchor === 'function') {
        state.latestXRHit.createAnchor().then(anchor => {
          if (!state.isOpen || !state.isPlaced || state.mode !== 'webxr') {
            if (typeof anchor.delete === 'function') anchor.delete();
            return;
          }
          state.xrAnchor = anchor;
        }).catch(console.warn);
      }

      state.isPlaced = true;
      state.status = AR_STATES.MOUNTED;
      posterGroup.visible = true;
      if (reticleMesh) reticleMesh.visible = false;

      triggerMountSnapAnimation();
      if (navigator.vibrate) navigator.vibrate([25, 30, 45]);
      updateScanningGuidance('Mounted on wall • Walk around to inspect', 'fa-check');
      setTimeout(() => {
        const hint = document.getElementById('ar-guidance-hint');
        if (hint) hint.classList.add('fade-out');
      }, 3500);
    }
  }

  /**
   * Starts a WebXR Immersive AR Session after an explicit user tap.
   */
  async function startWebXRSession() {
    if (!navigator.xr || !renderer) return false;

    let requestedSession = null;
    try {
      // Invoke requestSession directly from the Start Live AR click handler so
      // the browser still sees the required transient user activation.
      const sessionRequest = navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'anchors', 'light-estimation', 'plane-detection'],
        domOverlay: { root: overlayEl }
      });
      const session = requestedSession = await sessionRequest;

      state.xrSession = session;
      renderer.xr.enabled = true;
      await renderer.xr.setSession(session);

      state.xrRefSpace = await session.requestReferenceSpace('local');
      state.xrViewerSpace = await session.requestReferenceSpace('viewer');

      try {
        state.xrHitTestSource = await session.requestHitTestSource({
          space: state.xrViewerSpace,
          entityTypes: ['plane']
        });
      } catch (_) {
        state.xrHitTestSource = await session.requestHitTestSource({ space: state.xrViewerSpace });
      }

      session.addEventListener('select', onXRSelect);

      session.addEventListener('end', () => {
        state.xrSession = null;
        state.xrHitTestSource = null;
        state.xrAnchor = null;
        renderer.xr.enabled = false;
        close();
      });

      state.mode = 'webxr';
      state.status = AR_STATES.SCANNING;
      state.webXRAvailable = true;
      const liveArBtn = document.getElementById('ar-live-ar-btn');
      if (liveArBtn) liveArBtn.style.display = 'none';
      setStudioOnlyControlsVisible(false);
      updateScanningGuidance('Scan wall slowly, then tap to place', 'fa-circle-notch fa-spin');
      startWebXRRenderLoop();
      return true;
    } catch (err) {
      if (requestedSession) {
        try { requestedSession.end(); } catch (_) {}
      }
      state.xrSession = null;
      state.xrHitTestSource = null;
      state.xrAnchor = null;
      if (renderer) renderer.xr.enabled = false;
      console.warn('WebXR session failed to start:', err);
      return false;
    }
  }

  function startWebXRRenderLoop() {
    renderer.setAnimationLoop((timestamp, frame) => {
      if (!frame || !state.isOpen) return;
      state.xrViewerPose = frame.getViewerPose(state.xrRefSpace);

      if (!state.isPlaced && state.xrHitTestSource && reticleMesh) {
        const hitResults = frame.getHitTestResults(state.xrHitTestSource);
        let wallHit = null;
        for (const hit of hitResults) {
          const pose = hit.getPose(state.xrRefSpace);
          if (pose && getVerticalWallPose(pose)) {
            wallHit = { hit, pose };
            break;
          }
        }
        if (wallHit) {
            state.latestXRHit = wallHit.hit;
            state.latestXRHitPose = wallHit.pose;
            const placement = getVerticalWallPose(wallHit.pose);
            reticleMesh.visible = true;
            reticleMesh.position.copy(placement.position);
            reticleMesh.quaternion.copy(placement.quaternion);
            reticleMesh.matrixAutoUpdate = true;
            state.status = AR_STATES.SURFACE_DETECTED;
            updateScanningGuidance('Wall detected! Tap to mount poster', 'fa-hand-pointer');
        } else {
          state.latestXRHit = null;
          state.latestXRHitPose = null;
          reticleMesh.visible = false;
          state.status = AR_STATES.SCANNING;
          updateScanningGuidance('Aim at a vertical wall and scan slowly', 'fa-circle-notch fa-spin');
        }
      } else if (state.isPlaced && state.xrAnchor) {
        const anchorPose = frame.getPose(state.xrAnchor.anchorSpace, state.xrRefSpace);
        if (anchorPose && posterGroup) {
          const placement = getVerticalWallPose(anchorPose);
          if (placement) {
            posterGroup.position.copy(placement.position);
            posterGroup.quaternion.copy(placement.quaternion);
          }
        }
      }

      renderer.render(scene, camera);
    });
  }

  function getVerticalWallPose(pose) {
    const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const surfaceNormal = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix).sub(new THREE.Vector3().setFromMatrixPosition(matrix)).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(surfaceNormal.dot(worldUp)) > Math.sin(20 * Math.PI / 180)) return null;

    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    const toViewer = state.xrViewerPose ? new THREE.Vector3().copy(state.xrViewerPose.transform.position).sub(position) : new THREE.Vector3();
    if (toViewer.lengthSq() && surfaceNormal.dot(toViewer) < 0) surfaceNormal.negate();
    const right = new THREE.Vector3().crossVectors(worldUp, surfaceNormal).normalize();
    const rotation = new THREE.Matrix4().makeBasis(right, worldUp, surfaceNormal);
    return { position, quaternion: new THREE.Quaternion().setFromRotationMatrix(rotation) };
  }

  function setStudioOnlyControlsVisible(visible) {
    ['ar-room-wall-btn', 'ar-dist-btn', 'ar-recenter-btn', 'ar-shutter-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? '' : 'none';
    });
  }

  /**
   * 3D Room Studio Render Loop
   */
  function startStudioRenderLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);

    function render() {
      if (!state.isOpen) return;

      if (!state.isPlaced) {
        if (posterGroup) posterGroup.visible = false;

        if (reticleMesh && camera) {
          reticleMesh.visible = true;
          const wallPoint = new THREE.Vector3(0, 0, -state.wallDistanceMeters);
          wallPoint.applyQuaternion(camera.quaternion).add(camera.position);
          reticleMesh.position.copy(wallPoint);
          reticleMesh.quaternion.copy(camera.quaternion);

          const t = Date.now() * 0.0035;
          const s = 1 + Math.sin(t) * 0.025;
          reticleMesh.scale.set(s, s, 1);
        }
      } else {
        if (reticleMesh) reticleMesh.visible = false;
        if (posterGroup && state.placedPosition && state.placedQuaternion) {
          posterGroup.visible = true;
          posterGroup.position.copy(state.placedPosition);
          posterGroup.quaternion.copy(state.placedQuaternion);
        }
      }

      renderer.render(scene, camera);
      animFrameId = requestAnimationFrame(render);
    }

    animFrameId = requestAnimationFrame(render);
  }

  function setSize(newSize) {
    if (!POSTER_SIZES[newSize] || !state.availableSizes.includes(newSize)) return;
    state.size = newSize;
    const availableFrameColors = state.frameColorsBySize[newSize] || [];
    if (state.frame === 'framed' && (!availableFrameColors.length || !availableFrameColors.includes(state.frameColor))) {
      state.frame = availableFrameColors.length ? 'framed' : 'unframed';
      state.frameColor = availableFrameColors[0] || 'black';
    }
    syncQuickLookVariant();

    document.querySelectorAll('.ar-segment-group [data-size]').forEach(btn => {
      const isActive = btn.dataset.size === newSize;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      btn.style.display = state.availableSizes.includes(btn.dataset.size) ? '' : 'none';
    });
    document.querySelectorAll('.ar-segment-group [data-frame]').forEach(btn => {
      const isActive = btn.dataset.frame === state.frame;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      btn.style.display = btn.dataset.frame === 'framed' && !availableFrameColors.length ? 'none' : '';
    });
    document.querySelectorAll('.ar-frame-color-group [data-color]').forEach(btn => {
      btn.style.display = availableFrameColors.includes(btn.dataset.color) ? '' : 'none';
    });

    const dim = getDimensions(state.size, state.isLandscape);
    if (infoDimsEl) {
      infoDimsEl.textContent = `${dim.name} • ${state.frame === 'framed' ? 'Framed' : 'Unframed'}`;
    }

    buildPoster3DModel();
    buildReticle();

    if (typeof state.onVariantChange === 'function') {
      state.onVariantChange(state.size, state.frame, state.frameColor);
    }
  }

  function setFrame(newFrame) {
    if (newFrame === 'framed' && !(state.frameColorsBySize[state.size] || []).length) return;
    state.frame = (newFrame === 'framed') ? 'framed' : 'unframed';
    const availableFrameColors = state.frameColorsBySize[state.size] || [];
    if (state.frame === 'framed' && !availableFrameColors.includes(state.frameColor)) state.frameColor = availableFrameColors[0];
    syncQuickLookVariant();

    document.querySelectorAll('.ar-segment-group [data-frame]').forEach(btn => {
      const isActive = btn.dataset.frame === state.frame;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });

    const colorGroup = document.getElementById('ar-frame-color-group');
    if (colorGroup) {
      colorGroup.style.display = (state.frame === 'framed') ? 'inline-flex' : 'none';
    }
    document.querySelectorAll('.ar-frame-color-group [data-color]').forEach(btn => {
      btn.style.display = availableFrameColors.includes(btn.dataset.color) ? '' : 'none';
      btn.classList.toggle('active', btn.dataset.color === state.frameColor);
    });

    const dim = getDimensions(state.size, state.isLandscape);
    if (infoDimsEl) {
      infoDimsEl.textContent = `${dim.name} • ${state.frame === 'framed' ? 'Framed' : 'Unframed'}`;
    }

    buildPoster3DModel();
    buildReticle();

    if (typeof state.onVariantChange === 'function') {
      state.onVariantChange(state.size, state.frame, state.frameColor);
    }
  }

  function setFrameColor(colorKey) {
    if (!FRAME_CONFIG.colors[colorKey]) return;
    if (state.frame === 'framed' && !(state.frameColorsBySize[state.size] || []).includes(colorKey)) return;
    state.frameColor = colorKey;
    syncQuickLookVariant();

    document.querySelectorAll('.ar-frame-color-group [data-color]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.color === colorKey);
    });

    buildPoster3DModel();

    if (typeof state.onVariantChange === 'function') {
      state.onVariantChange(state.size, state.frame, state.frameColor);
    }
  }

  /**
   * Shutter Snapshot: High-DPI composite of room backdrop & 3D WebGL poster
   */
  async function takeWallSnapshot() {
    const flashEl = document.getElementById('ar-camera-flash');
    if (flashEl) {
      flashEl.classList.remove('flash-active');
      void flashEl.offsetWidth;
      flashEl.classList.add('flash-active');
    }

    try {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w * 2;
      canvas.height = h * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);

      // Draw backdrop
      if (videoEl && videoEl.srcObject && videoEl.videoWidth) {
        const vW = videoEl.videoWidth;
        const vH = videoEl.videoHeight;
        const scale = Math.max(w / vW, h / vH);
        const sW = vW * scale;
        const sH = vH * scale;
        ctx.drawImage(videoEl, (w - sW) / 2, (h - sH) / 2, sW, sH);
      } else {
        const bgImg = new Image();
        bgImg.crossOrigin = 'anonymous';
        await new Promise(r => {
          bgImg.onload = r;
          bgImg.onerror = r;
          const currentWall = STUDIO_WALLS[state.currentStudioWallIndex] || STUDIO_WALLS[0];
          bgImg.src = currentWall.url;
        });
        if (bgImg.naturalWidth) {
          const bScale = Math.max(w / bgImg.naturalWidth, h / bgImg.naturalHeight);
          ctx.drawImage(bgImg, (w - bgImg.naturalWidth * bScale) / 2, (h - bgImg.naturalHeight * bScale) / 2, bgImg.naturalWidth * bScale, bgImg.naturalHeight * bScale);
        }
      }

      // Render 3D Scene
      if (renderer) {
        renderer.render(scene, camera);
        ctx.drawImage(threeCanvas, 0, 0, w, h);
      }

      // Watermark
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      if (ctx.roundRect) ctx.roundRect(16, h - 42, 190, 28, 6);
      else ctx.fillRect(16, h - 42, 190, 28);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '600 12px Inter, sans-serif';
      ctx.fillText('BRUSH • www.brush-art.in', 26, h - 24);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.94);
      const downloadLink = document.createElement('a');
      downloadLink.download = `Brush-${state.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-WallStudio.jpg`;
      downloadLink.href = dataUrl;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      if (window.Cart && Cart.toast) {
        Cart.toast('Saved photo of your wall preview!');
      }

      return dataUrl;
    } catch (err) {
      console.warn('Snapshot error:', err);
      return null;
    }
  }

  /**
   * Main Public Entry: Opens AR / Wall Studio for a product
   */
  async function open(options = {}) {
    const requestVersion = ++openRequestVersion;
    initDOM();

    let imgSrc = options.image || '';
    if (imgSrc && !imgSrc.startsWith('/') && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:')) {
      imgSrc = '/' + imgSrc;
    }

    state.image = imgSrc;
    state.name = options.name || 'Art Poster';
    state.availableSizes = Array.isArray(options.availableSizes)
      ? options.availableSizes.filter(size => POSTER_SIZES[size])
      : Object.keys(POSTER_SIZES);
    if (!state.availableSizes.length) state.availableSizes = ['A4'];
    state.frameColorsBySize = options.frameColorsBySize || {};
    if (!Object.keys(state.frameColorsBySize).length) {
      state.availableSizes.forEach(size => { state.frameColorsBySize[size] = []; });
    }
    state.size = state.availableSizes.includes(options.size) ? options.size : state.availableSizes[0];
    state.frame = (options.frame === 'unframed') ? 'unframed' : 'framed';
    state.frameColor = (options.frameColor && FRAME_CONFIG.colors[options.frameColor]) ? options.frameColor : 'black';
    const initialFrameColors = state.frameColorsBySize[state.size] || [];
    if (state.frame === 'framed' && !initialFrameColors.length) state.frame = 'unframed';
    if (state.frame === 'framed' && !initialFrameColors.includes(state.frameColor)) state.frameColor = initialFrameColors[0];
    state.productId = options.productId || options.id || options.name || '';
    state.usdzAssets = { ...(options.usdzAssets || {}) };
    if (options.usdzUrl || options.usdz) {
      state.usdzAssets[`${state.size}|${state.frame}|${state.frameColor}`] = options.usdzUrl || options.usdz;
    }
    state.onVariantChange = (typeof options.onVariantChange === 'function') ? options.onVariantChange : null;
    state.isPlaced = false;
    state.isOpen = true;
    state.status = AR_STATES.INITIALIZING;

    if (infoTitleEl) infoTitleEl.textContent = state.name;

    // Update artwork thumbnails and bind only a valid Quick Look asset.
    const iconThumb = document.getElementById('ar-arkit-icon-img');
    if (iconThumb && state.image) iconThumb.src = state.image;
    const heroThumb = document.getElementById('ar-hero-icon-img');
    if (heroThumb && state.image) heroThumb.src = state.image;
    syncQuickLookVariant();

    overlayEl.classList.add('open');
    document.body.classList.add('ar-mode-active');

    // Capability Routing:
    const supportsWebXR = await checkWebXRSupport();
    state.webXRAvailable = supportsWebXR;
    const liveArBtn = document.getElementById('ar-live-ar-btn');
    if (liveArBtn) {
      liveArBtn.style.display = 'none';
      liveArBtn.disabled = false;
    }
    const mobile = isMobileDevice();

    // 2. Desktop QR button (ONLY on non-mobile devices)
    const qrBtn = document.getElementById('ar-desktop-qr-btn');
    if (qrBtn) {
      qrBtn.style.display = mobile ? 'none' : 'inline-flex';
    }

    try {
      await ensureLibraries();
      if (requestVersion !== openRequestVersion) return;
      initThreeScene();

      // Load Artwork Texture
      const textureLoader = new THREE.TextureLoader();
      textureLoader.crossOrigin = 'anonymous';
      const loadedTexture = await new Promise((resolve) => {
        if (!state.image) {
          resolve(createFallbackTexture(state.name));
          return;
        }
        textureLoader.load(
          state.image,
          (tex) => resolve(tex),
          undefined,
          () => resolve(createFallbackTexture(state.name))
        );
      });
      if (requestVersion !== openRequestVersion) {
        if (loadedTexture && loadedTexture.dispose) loadedTexture.dispose();
        return;
      }
      posterTexture = loadedTexture;
      posterTexture.colorSpace = THREE.SRGBColorSpace;
      posterTexture.anisotropy = 8;

      const imgWidth = posterTexture.image.naturalWidth || posterTexture.image.width;
      const imgHeight = posterTexture.image.naturalHeight || posterTexture.image.height;
      state.isLandscape = (imgWidth > imgHeight * 1.05);

      setSize(state.size);
      setFrame(state.frame);
      setFrameColor(state.frameColor);

      // Show the honest mockup immediately. A second explicit tap starts WebXR
      // so requestSession is called while transient user activation is present.
      setupStudioMode();

    } catch (err) {
      if (requestVersion !== openRequestVersion) return;
      console.warn('AR initialization note:', err);
      setupStudioMode();
    }
  }

  function setupStudioMode() {
    state.mode = 'studio-3d';
    state.status = AR_STATES.STUDIO_MODE;
    if (!renderer || !scene || !camera) {
      setStudioOnlyControlsVisible(false);
      const liveArBtn = document.getElementById('ar-live-ar-btn');
      if (liveArBtn) liveArBtn.style.display = 'none';
      updateScanningGuidance('Preview could not initialize. Exit to continue shopping.', 'fa-circle-exclamation');
      return;
    }
    setStudioOnlyControlsVisible(true);
    const liveArBtn = document.getElementById('ar-live-ar-btn');
    if (liveArBtn) liveArBtn.style.display = state.webXRAvailable ? 'inline-flex' : 'none';
    if (wallCanvasFallback) {
      const wall = STUDIO_WALLS[state.currentStudioWallIndex] || STUDIO_WALLS[0];
      wallCanvasFallback.style.backgroundImage = `url('${wall.url}')`;
      wallCanvasFallback.style.display = 'block';
    }
    if (videoEl) videoEl.style.display = 'none';

    // Mount poster automatically in studio room center
    if (posterGroup && camera) {
      const forward = new THREE.Vector3(0, 0, -state.wallDistanceMeters);
      forward.applyQuaternion(camera.quaternion).add(camera.position);
      if (!state.placedPosition) state.placedPosition = new THREE.Vector3();
      if (!state.placedQuaternion) state.placedQuaternion = new THREE.Quaternion();
      state.placedPosition.copy(forward);
      state.placedQuaternion.copy(camera.quaternion);
      state.isPlaced = true;
      posterGroup.position.copy(state.placedPosition);
      posterGroup.quaternion.copy(state.placedQuaternion);
      posterGroup.visible = true;
      if (reticleMesh) reticleMesh.visible = false;
    }

    startStudioRenderLoop();

    const isApple = checkQuickLookSupport() && Boolean(state.usdzUrl);
    if (isApple) {
      updateScanningGuidance('3D Wall Studio • Static room mockup; use View in AR for spatial placement', 'fa-house');
    } else if (isMobileDevice()) {
      updateScanningGuidance('3D Wall Studio • Metric scale in a room mockup', 'fa-house');
    } else {
      updateScanningGuidance('3D Wall Studio • Drag to reposition • Metric scale mockup', 'fa-house');
    }
  }

  /**
   * Closes AR view and disposes all resources cleanly
   */
  function close() {
    openRequestVersion += 1;
    usdzExportVersion += 1;
    state.isOpen = false;
    state.isPlaced = false;
    state.status = AR_STATES.CLOSED;

    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }

    const anchorToDelete = state.xrAnchor;
    state.xrAnchor = null;
    if (anchorToDelete && typeof anchorToDelete.delete === 'function') {
      try { anchorToDelete.delete(); } catch (_) {}
    }

    if (state.xrSession) {
      try { state.xrSession.end(); } catch (e) {}
      state.xrSession = null;
      state.xrHitTestSource = null;
      state.xrViewerPose = null;
    }

    if (state.stream) {
      state.stream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      state.stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
      videoEl.style.display = 'none';
    }

    if (posterGroup) {
      scene.remove(posterGroup);
      disposeHierarchy(posterGroup);
      posterGroup = null;
    }

    if (reticleMesh) {
      scene.remove(reticleMesh);
      disposeHierarchy(reticleMesh);
      reticleMesh = null;
    }

    if (posterTexture) {
      posterTexture.dispose();
      posterTexture = null;
    }

    if (renderer) {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer = null;
      scene = null;
      camera = null;
    }

    if (overlayEl) {
      overlayEl.classList.remove('open');
    }

    if (appleHeroBanner) {
      appleHeroBanner.style.display = 'none';
    }

    if (desktopQrModal) {
      desktopQrModal.style.display = 'none';
    }

    document.body.classList.remove('ar-mode-active');
  }

  // Public API
  window.BrushAR = {
    open,
    close,
    setSize,
    setFrame,
    setFrameColor,
    takeSnapshot: takeWallSnapshot,
    POSTER_SIZES,
    AR_STATES,
    getState: () => ({ ...state }),
    checkQuickLookSupport,
    checkWebXRSupport,
    setQuickLookAsset,
    updateUSDZPayload,
    getVerticalWallPose
  };

})();

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ActiveColor,
  CameraPreset,
  canPlayCard,
  ClientRoomState,
  COLOR_HEX,
  UnoCard,
} from '../types/uno';
import {
  getCardBackTexture,
  getCardFrontTexture,
  getTableFeltTexture,
} from './cardTextures';
import { soundEngine } from '../audio/soundEngine';

interface UnoScene3DProps {
  room: ClientRoomState | null;
  cameraPreset: CameraPreset;
  selectedCardId: string | null;
  onSelectCard: (card: UnoCard) => void;
  onDrawCard: () => void;
}

// Reusable math objects outside render loop (Zero GC in tick)
const _vec3 = new THREE.Vector3();
const _targetPos = new THREE.Vector3();
const _lookAtPos = new THREE.Vector3();
const _color = new THREE.Color();

export const UnoScene3D: React.FC<UnoScene3DProps> = ({
  room,
  cameraPreset,
  selectedCardId,
  onSelectCard,
  onDrawCard,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<ClientRoomState | null>(room);
  const presetRef = useRef<CameraPreset>(cameraPreset);
  const selectedCardRef = useRef<string | null>(selectedCardId);
  const onSelectCardRef = useRef(onSelectCard);
  const onDrawCardRef = useRef(onDrawCard);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    presetRef.current = cameraPreset;
  }, [cameraPreset]);

  useEffect(() => {
    selectedCardRef.current = selectedCardId;
  }, [selectedCardId]);

  useEffect(() => {
    onSelectCardRef.current = onSelectCard;
  }, [onSelectCard]);

  useEffect(() => {
    onDrawCardRef.current = onDrawCard;
  }, [onDrawCard]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.032);

    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 100);
    camera.position.set(0, 6.2, 8.8);
    camera.lookAt(0, 0.4, 0.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

    // 2. Studio Environment Map (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 3. Balanced 3-Point Warm/Cool Studio Lighting
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x090d16, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    keyLight.position.set(5, 11, 6);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 25;
    const d = 7.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.65);
    rimLight.position.set(-6, 5, -7);
    scene.add(rimLight);

    const activeAccentLight = new THREE.PointLight(0xef4444, 2.2, 9);
    activeAccentLight.position.set(0, 1.4, 0);
    scene.add(activeAccentLight);

    // 4. Composite Multi-Part 3D Casino Table Group
    const tableGroup = new THREE.Group();
    scene.add(tableGroup);

    // Part 1: Felt Playfield Surface
    const feltGeo = new THREE.CylinderGeometry(4.8, 4.8, 0.24, 64);
    const feltMat = new THREE.MeshStandardMaterial({
      map: getTableFeltTexture(maxAnisotropy),
      roughness: 0.78,
      metalness: 0.05,
    });
    const feltMesh = new THREE.Mesh(feltGeo, feltMat);
    feltMesh.position.y = -0.12;
    feltMesh.receiveShadow = true;
    tableGroup.add(feltMesh);

    // Part 2: Carved Mahogany Outer Rim
    const rimGeo = new THREE.TorusGeometry(4.88, 0.34, 24, 64);
    rimGeo.rotateX(Math.PI / 2);
    const rimMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b190b,
      roughness: 0.24,
      metalness: 0.12,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.y = 0.04;
    rimMesh.castShadow = true;
    rimMesh.receiveShadow = true;
    tableGroup.add(rimMesh);

    // Part 3: Brushed Gold Inner Inlay Ring
    const brassGeo = new THREE.TorusGeometry(4.52, 0.055, 16, 64);
    brassGeo.rotateX(Math.PI / 2);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.2,
      metalness: 0.92,
    });
    const brassMesh = new THREE.Mesh(brassGeo, brassMat);
    brassMesh.position.y = 0.02;
    tableGroup.add(brassMesh);

    // Part 4: Pedestal Column & Base
    const pedestalGeo = new THREE.CylinderGeometry(1.4, 2.1, 2.4, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1e1b18,
      roughness: 0.5,
      metalness: 0.3,
    });
    const pedestalMesh = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestalMesh.position.y = -1.4;
    tableGroup.add(pedestalMesh);

    // Part 5: 8 Gold Stud Ornaments around Rim
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const stud = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.14, 0.08, 16),
        brassMat
      );
      stud.position.set(Math.cos(angle) * 4.88, 0.36, Math.sin(angle) * 4.88);
      tableGroup.add(stud);
    }

    // 5. Center Direction Ring & Orbiting Arrows
    const directionGroup = new THREE.Group();
    directionGroup.position.y = 0.03;
    scene.add(directionGroup);

    const glowRingGeo = new THREE.TorusGeometry(1.75, 0.045, 16, 64);
    glowRingGeo.rotateX(Math.PI / 2);
    const glowRingMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.5,
    });
    const glowRingMesh = new THREE.Mesh(glowRingGeo, glowRingMat);
    directionGroup.add(glowRingMesh);

    const arrowCones: THREE.Mesh[] = [];
    const arrowGeo = new THREE.ConeGeometry(0.13, 0.34, 12);
    arrowGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const arrow = new THREE.Mesh(arrowGeo, glowRingMat);
      const a = (i / 4) * Math.PI * 2;
      arrow.position.set(Math.cos(a) * 1.75, 0.02, Math.sin(a) * 1.75);
      directionGroup.add(arrow);
      arrowCones.push(arrow);
    }

    // 6. Shared Card Geometry & Helper Factory
    const cardGeo = new THREE.BoxGeometry(1.08, 1.62, 0.028);
    const cardEdgeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.35,
      metalness: 0.05,
    });
    const cardBackMat = new THREE.MeshStandardMaterial({
      map: getCardBackTexture(maxAnisotropy),
      roughness: 0.25,
      metalness: 0.08,
    });

    function createCardMesh(
      color: UnoCard['color'],
      value: UnoCard['value'],
      chosenColor?: ActiveColor,
      faceDown = false
    ): THREE.Mesh {
      const frontMat = faceDown
        ? cardBackMat
        : new THREE.MeshStandardMaterial({
            map: getCardFrontTexture(color, value, chosenColor, maxAnisotropy),
            roughness: 0.22,
            metalness: 0.08,
          });

      const materials = [
        cardEdgeMat, // right
        cardEdgeMat, // left
        cardEdgeMat, // top
        cardEdgeMat, // bottom
        frontMat, // front (+Z)
        cardBackMat, // back (-Z)
      ];
      const mesh = new THREE.Mesh(cardGeo, materials);
      mesh.castShadow = !isSoftwareGl;
      mesh.receiveShadow = !isSoftwareGl;
      return mesh;
    }

    // 7. 3D Draw Pile Group (Left of Center)
    const drawPileGroup = new THREE.Group();
    drawPileGroup.position.set(-0.92, 0.02, -0.1);
    scene.add(drawPileGroup);

    const drawDeckLayers: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const layer = createCardMesh('red', '0', undefined, true);
      layer.rotation.x = -Math.PI / 2;
      layer.rotation.z = Math.sin(i * 1.7) * 0.03;
      layer.position.y = i * 0.022;
      layer.layers.enable(1);
      layer.userData = { isDrawDeck: true };
      drawPileGroup.add(layer);
      drawDeckLayers.push(layer);
    }

    // Draw Pile Highlight Base
    const drawHaloGeo = new THREE.RingGeometry(0.68, 0.82, 32);
    drawHaloGeo.rotateX(-Math.PI / 2);
    const drawHaloMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
    });
    const drawHaloMesh = new THREE.Mesh(drawHaloGeo, drawHaloMat);
    drawHaloMesh.position.y = 0.01;
    drawPileGroup.add(drawHaloMesh);

    // 8. 3D Discard Pile Group (Right of Center)
    const discardGroup = new THREE.Group();
    discardGroup.position.set(0.82, 0.02, 0.05);
    scene.add(discardGroup);

    // 9. Dynamic Groups for Hand Cards, Opponents, and Title Showcase
    const myHandGroup = new THREE.Group();
    scene.add(myHandGroup);

    const opponentsGroup = new THREE.Group();
    scene.add(opponentsGroup);

    const flyingCardGroup = new THREE.Group();
    scene.add(flyingCardGroup);

    const titleShowcaseGroup = new THREE.Group();
    scene.add(titleShowcaseGroup);

    // Populate Title Screen 3D Floating Card Ring
    const demoCards: {
      mesh: THREE.Mesh;
      angle: number;
      radius: number;
      yBase: number;
      speed: number;
    }[] = [];
    const sampleSpecs: { c: UnoCard['color']; v: UnoCard['value'] }[] = [
      { c: 'red', v: '7' },
      { c: 'yellow', v: 'reverse' },
      { c: 'green', v: 'draw2' },
      { c: 'blue', v: 'skip' },
      { c: 'wild', v: 'wild4' },
      { c: 'red', v: '0' },
      { c: 'blue', v: '9' },
      { c: 'yellow', v: 'wild' },
    ];
    sampleSpecs.forEach((spec, idx) => {
      const m = createCardMesh(spec.c, spec.v);
      const angle = (idx / sampleSpecs.length) * Math.PI * 2;
      titleShowcaseGroup.add(m);
      demoCards.push({
        mesh: m,
        angle,
        radius: 2.35,
        yBase: 1.25 + (idx % 2) * 0.35,
        speed: 0.45,
      });
    });

    // Opponent Turn Spotlight Disc
    const seatSpotlightGeo = new THREE.RingGeometry(0.55, 0.78, 32);
    seatSpotlightGeo.rotateX(-Math.PI / 2);
    const seatSpotlightMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const seatSpotlight = new THREE.Mesh(seatSpotlightGeo, seatSpotlightMat);
    seatSpotlight.position.y = 0.02;
    seatSpotlight.visible = false;
    scene.add(seatSpotlight);

    // Pre-compile shaders on hardware WebGL
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Track state diffs to rebuild card meshes only when hand/discard changes
    let lastHandSignature = '';
    let lastDiscardSignature = '';
    let lastOpponentsSignature = '';
    let lastAnimTimestamp = 0;

    let activeFlyingMesh: THREE.Mesh | null = null;
    let flyingStartPos = new THREE.Vector3();
    let flyingProgress = 1;

    const myCardMeshes = new Map<string, THREE.Mesh>();
    let hoveredCardId: string | null = null;
    let hoveredDrawDeck = false;

    function getSeatWorldPosition(
      relativeIndex: number,
      totalPlayers: number
    ): THREE.Vector3 {
      if (relativeIndex === 0) {
        return new THREE.Vector3(0, 0.5, 4.1);
      }
      // Spread opponents across the far semi-circle of the table
      const oppIndex = relativeIndex - 1;
      const oppCount = Math.max(1, totalPlayers - 1);
      const startAngle = Math.PI * 1.18;
      const endAngle = Math.PI * 1.82;
      const t = oppCount === 1 ? 0.5 : oppIndex / (oppCount - 1);
      const angle = startAngle + t * (endAngle - startAngle);
      const radius = 3.55;
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        0.35,
        Math.sin(angle) * radius
      );
    }

    function syncSceneWithRoom(currentRoom: ClientRoomState | null) {
      if (!currentRoom || currentRoom.status === 'LOBBY') {
        titleShowcaseGroup.visible = true;
        myHandGroup.visible = false;
        opponentsGroup.visible = false;
        discardGroup.visible = false;
        seatSpotlight.visible = false;
        return;
      }

      titleShowcaseGroup.visible = false;
      myHandGroup.visible = true;
      opponentsGroup.visible = true;
      discardGroup.visible = true;

      // Update Draw Deck stack height
      const visibleLayers = Math.max(
        1,
        Math.min(drawDeckLayers.length, Math.ceil(currentRoom.drawPileCount / 6))
      );
      drawDeckLayers.forEach((layer, idx) => {
        layer.visible = idx < visibleLayers;
      });

      // Rebuild Discard Pile if changed
      const discardSig = currentRoom.discardHistory
        .map((c) => `${c.id}:${c.chosenColor || ''}`)
        .join('|');
      if (discardSig !== lastDiscardSignature) {
        lastDiscardSignature = discardSig;
        while (discardGroup.children.length > 0) {
          discardGroup.remove(discardGroup.children[0]);
        }
        currentRoom.discardHistory.forEach((c, idx) => {
          const mesh = createCardMesh(c.color, c.value, c.chosenColor, false);
          mesh.rotation.x = -Math.PI / 2;
          // Deterministic organic yaw based on card id
          let hash = 0;
          for (let k = 0; k < c.id.length; k++) {
            hash = (hash * 31 + c.id.charCodeAt(k)) % 1000;
          }
          mesh.rotation.z = ((hash / 1000) - 0.5) * 0.45;
          mesh.position.y = idx * 0.026;
          discardGroup.add(mesh);
        });
      }

      // Trigger Flying Card Animation if new play occurred
      if (
        currentRoom.lastPlayedAnim &&
        currentRoom.lastPlayedAnim.timestamp !== lastAnimTimestamp
      ) {
        lastAnimTimestamp = currentRoom.lastPlayedAnim.timestamp;
        while (flyingCardGroup.children.length > 0) {
          flyingCardGroup.remove(flyingCardGroup.children[0]);
        }
        const { card, fromSeat } = currentRoom.lastPlayedAnim;
        activeFlyingMesh = createCardMesh(
          card.color,
          card.value,
          card.chosenColor,
          false
        );
        const myIdx = Math.max(
          0,
          currentRoom.players.findIndex(
            (p) =>
              p.username.trim().toLowerCase() ===
              currentRoom.myUsername.trim().toLowerCase()
          )
        );
        const total = currentRoom.players.length;
        const relSeat =
          fromSeat < 0 ? 0 : (((fromSeat - myIdx) % total) + total) % total;
        flyingStartPos =
          fromSeat < 0
            ? new THREE.Vector3(-0.92, 0.5, -0.1)
            : getSeatWorldPosition(relSeat, total);
        activeFlyingMesh.position.copy(flyingStartPos);
        flyingCardGroup.add(activeFlyingMesh);
        flyingProgress = 0;
        soundEngine.playCardSlam(
          card.color === 'wild' ||
            card.value === 'draw2' ||
            card.value === 'skip' ||
            card.value === 'reverse'
        );
      }

      // Rebuild My 3D Hand if changed
      const handSig = currentRoom.myHand.map((c) => c.id).join(',');
      if (handSig !== lastHandSignature) {
        lastHandSignature = handSig;
        myCardMeshes.clear();
        while (myHandGroup.children.length > 0) {
          myHandGroup.remove(myHandGroup.children[0]);
        }
        currentRoom.myHand.forEach((c) => {
          const mesh = createCardMesh(c.color, c.value, c.chosenColor, false);
          mesh.layers.enable(1);
          mesh.userData = { cardId: c.id, card: c };
          myHandGroup.add(mesh);
          myCardMeshes.set(c.id, mesh);
        });
      }

      // Rebuild Opponents 3D Hands if counts changed
      const oppSig = currentRoom.players
        .map((p) => `${p.username}:${p.cardCount}`)
        .join('|');
      if (oppSig !== lastOpponentsSignature) {
        lastOpponentsSignature = oppSig;
        while (opponentsGroup.children.length > 0) {
          opponentsGroup.remove(opponentsGroup.children[0]);
        }

        const myIdx = Math.max(
          0,
          currentRoom.players.findIndex(
            (p) =>
              p.username.trim().toLowerCase() ===
              currentRoom.myUsername.trim().toLowerCase()
          )
        );
        const total = currentRoom.players.length;

        currentRoom.players.forEach((p, absIdx) => {
          const relIdx = (((absIdx - myIdx) % total) + total) % total;
          if (relIdx === 0) return; // Skip self

          const seatPos = getSeatWorldPosition(relIdx, total);
          const oppHolder = new THREE.Group();
          oppHolder.position.copy(seatPos);
          oppHolder.lookAt(0, 0.35, 0);

          const visibleCards = Math.min(10, p.cardCount);
          for (let cIdx = 0; cIdx < visibleCards; cIdx++) {
            const offset = cIdx - (visibleCards - 1) / 2;
            const cardMesh = createCardMesh('red', '0', undefined, true);
            cardMesh.scale.setScalar(0.68);
            cardMesh.position.set(offset * 0.22, Math.abs(offset) * -0.02, cIdx * 0.01);
            cardMesh.rotation.z = -offset * 0.09;
            oppHolder.add(cardMesh);
          }

          opponentsGroup.add(oppHolder);
        });
      }
    }

    // Raycasting for 3D Hand & 3D Draw Deck
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2(-99, -99);
    let lastRaycastMs = 0;

    function updatePointer(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    function performHoverRaycast() {
      const now = performance.now();
      if (now - lastRaycastMs < 40) return;
      lastRaycastMs = now;

      const currentRoom = roomRef.current;
      if (!currentRoom || currentRoom.status !== 'PLAYING') {
        hoveredCardId = null;
        hoveredDrawDeck = false;
        renderer.domElement.style.cursor = 'default';
        return;
      }

      raycaster.setFromCamera(pointer, camera);
      const targets = [...myHandGroup.children, ...drawPileGroup.children];
      const hits = raycaster.intersectObjects(targets, false);

      if (hits.length > 0) {
        const hitObj = hits[0].object;
        if (hitObj.userData?.cardId) {
          if (hoveredCardId !== hitObj.userData.cardId) {
            hoveredCardId = hitObj.userData.cardId;
            soundEngine.playCardHover();
          }
          hoveredDrawDeck = false;
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
        if (hitObj.userData?.isDrawDeck) {
          hoveredCardId = null;
          hoveredDrawDeck = true;
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }

      hoveredCardId = null;
      hoveredDrawDeck = false;
      renderer.domElement.style.cursor = 'default';
    }

    const onPointerMove = (e: PointerEvent) => {
      updatePointer(e.clientX, e.clientY);
      performHoverRaycast();
    };

    const onPointerDown = (e: PointerEvent) => {
      updatePointer(e.clientX, e.clientY);
      const currentRoom = roomRef.current;
      if (!currentRoom || currentRoom.status !== 'PLAYING') return;

      raycaster.setFromCamera(pointer, camera);
      const targets = [...myHandGroup.children, ...drawPileGroup.children];
      const hits = raycaster.intersectObjects(targets, false);

      if (hits.length > 0) {
        const hitObj = hits[0].object;
        if (hitObj.userData?.card) {
          onSelectCardRef.current(hitObj.userData.card as UnoCard);
          return;
        }
        if (hitObj.userData?.isDrawDeck) {
          onDrawCardRef.current();
          return;
        }
      }
    };

    const domElem = renderer.domElement;
    domElem.addEventListener('pointermove', onPointerMove);
    domElem.addEventListener('pointerdown', onPointerDown);

    // Resize listener
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // Software WebGL fenceSync pacing helper
    let frameId = 0;
    let isDisposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || !gl.fenceSync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const clock = new THREE.Clock();

    function tick() {
      if (isDisposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const elapsed = clock.getElapsedTime();

      const currentRoom = roomRef.current;
      syncSceneWithRoom(currentRoom);

      // 1. Camera choreography based on preset & screen aspect
      const isPortrait = camera.aspect < 0.85;
      const preset = presetRef.current;
      if (!currentRoom || currentRoom.status === 'LOBBY') {
        _targetPos.set(
          Math.sin(elapsed * 0.25) * 6.8,
          4.2,
          Math.cos(elapsed * 0.25) * 6.8
        );
        _lookAtPos.set(0, 0.7, 0);
      } else if (preset === 'overhead') {
        _targetPos.set(0, 10.5, 2.2);
        _lookAtPos.set(0, 0, 0.4);
      } else if (preset === 'cinema') {
        _targetPos.set(
          Math.sin(elapsed * 0.18) * 3.2,
          5.2,
          7.6 + Math.cos(elapsed * 0.18) * 0.6
        );
        _lookAtPos.set(0, 0.4, 0.5);
      } else {
        // Default ergonomic player view (adjusted for mobile portrait vs desktop)
        _targetPos.set(0, isPortrait ? 6.9 : 5.4, isPortrait ? 9.6 : 7.8);
        _lookAtPos.set(0, 0.35, isPortrait ? 1.15 : 0.75);
      }

      camera.position.lerp(_targetPos, 1 - Math.exp(-5 * dt));
      camera.lookAt(_lookAtPos);

      // 2. Animate Title Screen Showcase Cards
      if (titleShowcaseGroup.visible) {
        demoCards.forEach((dc, i) => {
          const a = dc.angle + elapsed * dc.speed;
          dc.mesh.position.set(
            Math.cos(a) * dc.radius,
            dc.yBase + Math.sin(elapsed * 2 + i) * 0.18,
            Math.sin(a) * dc.radius
          );
          dc.mesh.rotation.y = -a + Math.PI / 2;
          dc.mesh.rotation.x = Math.sin(elapsed * 1.5 + i) * 0.15;
        });
      }

      // 3. Animate Center Direction Ring & Active Color Lighting
      const activeCol: ActiveColor = currentRoom?.activeColor || 'red';
      _color.set(COLOR_HEX[activeCol]);
      glowRingMat.color.lerp(_color, 1 - Math.exp(-8 * dt));
      glowRingMat.emissive.lerp(_color, 1 - Math.exp(-8 * dt));
      activeAccentLight.color.lerp(_color, 1 - Math.exp(-8 * dt));

      const dir = currentRoom?.direction || 1;
      directionGroup.rotation.y -= dir * dt * 0.85;
      arrowCones.forEach((cone, idx) => {
        const a = (idx / 4) * Math.PI * 2;
        // Point cone along tangent of direction
        cone.rotation.y = -a + (dir === 1 ? 0 : Math.PI);
      });

      // 4. Animate Flying Played Card
      if (activeFlyingMesh && flyingProgress < 1) {
        flyingProgress = Math.min(1, flyingProgress + dt * 3.4);
        const ease = 1 - Math.pow(1 - flyingProgress, 3);
        const targetEnd = _vec3.set(
          discardGroup.position.x,
          0.18 + (currentRoom?.discardHistory.length || 1) * 0.026,
          discardGroup.position.z
        );
        activeFlyingMesh.position.lerpVectors(flyingStartPos, targetEnd, ease);
        // Parabolic arc height
        activeFlyingMesh.position.y += Math.sin(flyingProgress * Math.PI) * 1.65;
        activeFlyingMesh.rotation.x =
          -Math.PI / 2 + (1 - ease) * Math.PI * 1.2;
        activeFlyingMesh.rotation.z = (1 - ease) * Math.PI * 2;
        if (flyingProgress >= 1) {
          activeFlyingMesh.visible = false;
        }
      }

      // 5. Smoothly Position & Elevate Local Player's 3D Hand Cards
      if (currentRoom && currentRoom.status === 'PLAYING') {
        const myIdx = currentRoom.players.findIndex(
          (p) =>
            p.username.trim().toLowerCase() ===
            currentRoom.myUsername.trim().toLowerCase()
        );
        const isMyTurn = myIdx === currentRoom.currentTurnIndex;

        // Pulse Draw Deck Halo if it's my turn
        drawHaloMat.opacity = isMyTurn
          ? hoveredDrawDeck
            ? 0.85
            : 0.35 + Math.sin(elapsed * 4) * 0.15
          : 0.0;

        // Position Active Player Spotlight
        const total = currentRoom.players.length;
        if (myIdx >= 0 && total > 0) {
          const relTurn =
            (((currentRoom.currentTurnIndex - myIdx) % total) + total) % total;
          const spotPos = getSeatWorldPosition(relTurn, total);
          seatSpotlight.visible = true;
          seatSpotlight.position.x = THREE.MathUtils.damp(
            seatSpotlight.position.x,
            spotPos.x,
            8,
            dt
          );
          seatSpotlight.position.z = THREE.MathUtils.damp(
            seatSpotlight.position.z,
            spotPos.z,
            8,
            dt
          );
        }

        const count = currentRoom.myHand.length;
        const maxSpread = isPortrait ? 3.2 : 5.4;
        const step = count > 1 ? Math.min(0.56, maxSpread / (count - 1)) : 0;

        currentRoom.myHand.forEach((card, idx) => {
          const mesh = myCardMeshes.get(card.id);
          if (!mesh) return;

          const playable =
            isMyTurn &&
            canPlayCard(card, currentRoom.activeColor, currentRoom.activeValue);
          const isHovered =
            hoveredCardId === card.id || selectedCardRef.current === card.id;

          const centerOffset = idx - (count - 1) / 2;
          const targetX = centerOffset * step;
          const archY = -Math.pow(centerOffset * 0.14, 2) * 0.45;
          const baseZ = isPortrait ? 4.95 : 4.35;
          const baseY = isPortrait ? 1.55 : 1.35;

          const liftY = (playable ? 0.18 : 0) + (isHovered ? 0.36 : 0);
          const pullZ = (playable ? 0.14 : 0) + (isHovered ? 0.28 : 0) + idx * 0.012;

          mesh.position.x = THREE.MathUtils.damp(
            mesh.position.x,
            targetX,
            12,
            dt
          );
          mesh.position.y = THREE.MathUtils.damp(
            mesh.position.y,
            baseY + archY + liftY,
            12,
            dt
          );
          mesh.position.z = THREE.MathUtils.damp(
            mesh.position.z,
            baseZ + pullZ,
            12,
            dt
          );

          const targetRotZ = isHovered ? 0 : -centerOffset * 0.065;
          const targetRotX = isHovered ? -0.32 : -0.42;
          mesh.rotation.z = THREE.MathUtils.damp(
            mesh.rotation.z,
            targetRotZ,
            12,
            dt
          );
          mesh.rotation.x = THREE.MathUtils.damp(
            mesh.rotation.x,
            targetRotX,
            12,
            dt
          );
        });
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      domElem.removeEventListener('pointermove', onPointerMove);
      domElem.removeEventListener('pointerdown', onPointerDown);
      renderer.dispose();
      if (domElem.parentNode === container) {
        container.removeChild(domElem);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full overflow-hidden z-0"
      aria-label="Bàn chơi UNO 3D"
    />
  );
};

import * as THREE from 'three';
import { ActiveColor, CardColor, CardValue } from '../types/uno';

const textureCache = new Map<string, THREE.CanvasTexture>();
let backTextureCache: THREE.CanvasTexture | null = null;
let feltTextureCache: THREE.CanvasTexture | null = null;

const PALETTE: Record<
  ActiveColor,
  { primary: string; deep: string; glow: string; badge: string }
> = {
  red: {
    primary: '#EF4444',
    deep: '#7F1D1D',
    glow: '#FCA5A5',
    badge: '#DC2626',
  },
  yellow: {
    primary: '#F59E0B',
    deep: '#78350F',
    glow: '#FDE68A',
    badge: '#D97706',
  },
  green: {
    primary: '#10B981',
    deep: '#064E3B',
    glow: '#6EE7B7',
    badge: '#059669',
  },
  blue: {
    primary: '#3B82F6',
    deep: '#1E3A8A',
    glow: '#93C5FD',
    badge: '#2563EB',
  },
};

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function getDisplaySymbol(value: CardValue): string {
  switch (value) {
    case 'skip':
      return '⊘';
    case 'reverse':
      return '⇄';
    case 'draw2':
      return '+2';
    case 'wild':
      return '★';
    case 'wild4':
      return '+4';
    default:
      return value;
  }
}

export function getCardFrontTexture(
  color: CardColor,
  value: CardValue,
  chosenColor?: ActiveColor,
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const key = `${color}_${value}_${chosenColor || 'none'}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;

  // 1. Crisp Pearl White Outer Card Frame
  ctx.fillStyle = '#F8FAFC';
  drawRoundedRect(ctx, 0, 0, 512, 768, 44);
  ctx.fill();

  // 2. Inner Colored Card Field
  const effectiveColor: ActiveColor =
    color === 'wild' ? chosenColor || 'red' : color;
  const pal = PALETTE[effectiveColor];

  ctx.save();
  drawRoundedRect(ctx, 24, 24, 464, 720, 32);
  ctx.clip();

  if (color === 'wild' && !chosenColor) {
    const grad = ctx.createRadialGradient(256, 384, 30, 256, 384, 420);
    grad.addColorStop(0, '#1E293B');
    grad.addColorStop(1, '#090D16');
    ctx.fillStyle = grad;
    ctx.fillRect(24, 24, 464, 720);
  } else {
    const grad = ctx.createRadialGradient(256, 384, 40, 256, 384, 440);
    grad.addColorStop(0, pal.primary);
    grad.addColorStop(1, pal.deep);
    ctx.fillStyle = grad;
    ctx.fillRect(24, 24, 464, 720);
  }

  // Subtle luxury guilloche diagonal pattern
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 3;
  for (let i = -768; i < 768; i += 28) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 512, 768);
    ctx.stroke();
  }

  // Gold foil inner pinstripe border
  ctx.strokeStyle = 'rgba(253, 230, 138, 0.45)';
  ctx.lineWidth = 3;
  drawRoundedRect(ctx, 38, 38, 436, 692, 24);
  ctx.stroke();

  // 3. Center Tilted UNO Oval
  ctx.save();
  ctx.translate(256, 384);
  ctx.rotate(-0.32);

  // Outer gold/white ring
  ctx.beginPath();
  ctx.ellipse(0, 0, 178, 256, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#FDE68A';
  ctx.stroke();

  // Inner oval fill
  ctx.beginPath();
  ctx.ellipse(0, 0, 160, 236, 0, 0, Math.PI * 2);
  if (color === 'wild') {
    ctx.save();
    ctx.clip();
    // 4-color UNO Wild quadrants
    ctx.fillStyle = '#EF4444';
    ctx.fillRect(-200, -260, 200, 260);
    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(0, -260, 200, 260);
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(-200, 0, 200, 260);
    ctx.fillStyle = '#10B981';
    ctx.fillRect(0, 0, 200, 260);

    // If a color was chosen on this wild card, highlight center ring in chosen color
    if (chosenColor) {
      ctx.beginPath();
      ctx.arc(0, 0, 96, 0, Math.PI * 2);
      ctx.fillStyle = PALETTE[chosenColor].primary;
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    }
    ctx.restore();
  } else {
    const innerGrad = ctx.createLinearGradient(-120, -200, 120, 200);
    innerGrad.addColorStop(0, '#FFFFFF');
    innerGrad.addColorStop(1, '#F1F5F9');
    ctx.fillStyle = innerGrad;
    ctx.fill();
  }
  ctx.restore();

  // 4. Center Big Symbol / Numeral
  const symbol = getDisplaySymbol(value);
  ctx.save();
  ctx.translate(256, 392);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const isLongSymbol = symbol.length > 1;
  ctx.font = `800 ${isLongSymbol ? 168 : 230}px "Bricolage Grotesque", sans-serif`;

  // Deep 3D Extruded Shadow
  ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
  ctx.fillText(symbol, 10, 14);

  // Main Center Fill
  ctx.fillStyle = color === 'wild' ? '#FFFFFF' : pal.badge;
  ctx.fillText(symbol, 0, 0);

  ctx.lineWidth = 6;
  ctx.strokeStyle = color === 'wild' ? '#090D16' : '#FFFFFF';
  ctx.strokeText(symbol, 0, 0);

  // Underline for 6 and 9 so they are unambiguous in 3D space
  if (value === '6' || value === '9') {
    ctx.fillStyle = pal.badge;
    ctx.fillRect(-55, 105, 110, 16);
  }
  ctx.restore();

  // 5. Top-Left & Bottom-Right Corner Indices
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;

  ctx.font = `800 ${isLongSymbol ? 66 : 82}px "Bricolage Grotesque", sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(symbol, 52, 48);

  // Bottom-Right Inverted Corner
  ctx.save();
  ctx.translate(512 - 52, 768 - 48);
  ctx.rotate(Math.PI);
  ctx.fillText(symbol, 0, 0);
  ctx.restore();

  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;

  textureCache.set(key, texture);
  return texture;
}

export function getCardBackTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  if (backTextureCache) return backTextureCache;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d')!;

  // White frame
  ctx.fillStyle = '#F8FAFC';
  drawRoundedRect(ctx, 0, 0, 512, 768, 44);
  ctx.fill();

  // Obsidian inner casing
  ctx.save();
  drawRoundedRect(ctx, 24, 24, 464, 720, 32);
  ctx.clip();

  const bgGrad = ctx.createRadialGradient(256, 384, 20, 256, 384, 440);
  bgGrad.addColorStop(0, '#1E293B');
  bgGrad.addColorStop(1, '#090D16');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(24, 24, 464, 720);

  // Gold diamond lattice
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.16)';
  ctx.lineWidth = 2;
  for (let i = -768; i < 768; i += 36) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 512, 768);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i + 512, 0);
    ctx.lineTo(i, 768);
    ctx.stroke();
  }

  // Gold inner border
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 4;
  drawRoundedRect(ctx, 42, 42, 428, 684, 22);
  ctx.stroke();

  // Crimson & Gold Center Oval
  ctx.save();
  ctx.translate(256, 384);
  ctx.rotate(-0.32);

  ctx.beginPath();
  ctx.ellipse(0, 0, 174, 246, 0, 0, Math.PI * 2);
  const ovalGrad = ctx.createLinearGradient(-150, -200, 150, 200);
  ovalGrad.addColorStop(0, '#EF4444');
  ovalGrad.addColorStop(1, '#991B1B');
  ctx.fillStyle = ovalGrad;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#FDE68A';
  ctx.stroke();

  // UNO 3D Wordmark
  ctx.rotate(0.15);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 112px "Bricolage Grotesque", sans-serif';
  ctx.fillStyle = '#090D16';
  ctx.fillText('UNO', 8, 10);

  const goldGrad = ctx.createLinearGradient(0, -60, 0, 60);
  goldGrad.addColorStop(0, '#FEF08A');
  goldGrad.addColorStop(0.5, '#F59E0B');
  goldGrad.addColorStop(1, '#B45309');
  ctx.fillStyle = goldGrad;
  ctx.fillText('UNO', 0, 0);

  ctx.font = '700 32px "JetBrains Mono", monospace';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText('ROYAL 3D', 0, 76);

  ctx.restore();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;

  backTextureCache = texture;
  return texture;
}

export function getTableFeltTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  if (feltTextureCache) return feltTextureCache;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(512, 512, 60, 512, 512, 520);
  grad.addColorStop(0, '#134E4A');
  grad.addColorStop(0.55, '#0F292E');
  grad.addColorStop(1, '#09151B');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 1024);

  // Concentric casino table gold rings
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.22)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(512, 512, 430, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(245, 158, 11, 0.14)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(512, 512, 260, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  feltTextureCache = tex;
  return tex;
}

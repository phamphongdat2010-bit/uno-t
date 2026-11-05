import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

type CardColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
type ActiveColor = 'red' | 'yellow' | 'green' | 'blue';
type CardValue =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4';

interface UnoCard {
  id: string;
  color: CardColor;
  value: CardValue;
  chosenColor?: ActiveColor;
}

interface ServerPlayer {
  username: string;
  seatIndex: number;
  hand: UnoCard[];
  isBot: boolean;
  connected: boolean;
  calledUno: boolean;
  score: number;
  avatarHue: number;
  lastActionText?: string;
}

interface ReactionEvent {
  id: string;
  username: string;
  seatIndex: number;
  kind: 'emoji' | 'comment';
  content: string;
  timestamp: number;
}

interface GameActionLog {
  id: string;
  text: string;
  timestamp: number;
  type: 'play' | 'draw' | 'uno' | 'penalty' | 'system';
}

interface SheetSyncConfig {
  enabled: boolean;
  scriptUrl: string;
  lastSyncedAt: number | null;
  status: 'idle' | 'syncing' | 'synced' | 'error';
  lastError?: string;
}

interface ServerRoom {
  code: string;
  hostUsername: string;
  status: 'LOBBY' | 'PLAYING' | 'ROUND_OVER';
  players: ServerPlayer[];
  deck: UnoCard[];
  discardPile: UnoCard[];
  direction: 1 | -1;
  currentTurnIndex: number;
  activeColor: ActiveColor;
  activeValue: CardValue;
  drawnCardIdThisTurn: string | null;
  winnerUsername: string | null;
  turnStartedAt: number;
  version: number;
  lastUpdatedAt: number;
  actionLogs: GameActionLog[];
  reactions: ReactionEvent[];
  sheetSync: SheetSyncConfig;
  lastPlayedAnim?: {
    card: UnoCard;
    fromSeat: number;
    timestamp: number;
  };
}

const BACKUP_FILE = '/tmp/uno_3d_royal_rooms.json';
const rooms = new Map<string, ServerRoom>();

// Load persisted rooms from disk if server restarted
try {
  if (fs.existsSync(BACKUP_FILE)) {
    const raw = fs.readFileSync(BACKUP_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as ServerRoom[];
    for (const r of parsed) {
      rooms.set(r.code, r);
    }
  }
} catch {
  // Ignore corrupt backup
}

function saveRoomsBackup() {
  try {
    const list = Array.from(rooms.values());
    fs.writeFileSync(BACKUP_FILE, JSON.stringify(list), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

const AVATAR_HUES = [12, 38, 152, 205, 268, 330];
const BOT_NAMES = ['Bot Cáo Đỏ', 'Bot Sói Bạc', 'Bot Đại Bàng', 'Bot Hổ Vàng', 'Bot Rồng Xanh'];

function randomId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!rooms.has(code)) return code;
  }
  return 'UNO' + Math.floor(100 + Math.random() * 900);
}

function buildOfficialUnoDeck(): UnoCard[] {
  const colors: ActiveColor[] = ['red', 'yellow', 'green', 'blue'];
  const cards: UnoCard[] = [];
  let seq = 1;

  for (const color of colors) {
    // One '0' per color
    cards.push({ id: `c_${seq++}`, color, value: '0' });
    // Two of each 1..9, skip, reverse, draw2
    const doubled: CardValue[] = [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'skip',
      'reverse',
      'draw2',
    ];
    for (const val of doubled) {
      cards.push({ id: `c_${seq++}`, color, value: val });
      cards.push({ id: `c_${seq++}`, color, value: val });
    }
  }

  // Four Wild and Four Wild Draw 4
  for (let i = 0; i < 4; i++) {
    cards.push({ id: `c_${seq++}`, color: 'wild', value: 'wild' });
    cards.push({ id: `c_${seq++}`, color: 'wild', value: 'wild4' });
  }

  return shuffle(cards);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function canPlayCard(card: UnoCard, activeColor: ActiveColor, activeValue: CardValue): boolean {
  if (card.color === 'wild') return true;
  if (card.color === activeColor) return true;
  if (card.value === activeValue) return true;
  return false;
}

function drawFromDeck(room: ServerRoom, count: number): UnoCard[] {
  const drawn: UnoCard[] = [];
  for (let i = 0; i < count; i++) {
    if (room.deck.length === 0) {
      if (room.discardPile.length > 1) {
        const top = room.discardPile.pop()!;
        const recycled = room.discardPile.map((c) => ({
          ...c,
          chosenColor: undefined,
        }));
        room.deck = shuffle(recycled);
        room.discardPile = [top];
      } else {
        room.deck = buildOfficialUnoDeck();
      }
    }
    const card = room.deck.pop();
    if (card) drawn.push(card);
  }
  return drawn;
}

function addLog(
  room: ServerRoom,
  text: string,
  type: GameActionLog['type'] = 'system'
) {
  room.actionLogs.unshift({
    id: randomId('log'),
    text,
    timestamp: Date.now(),
    type,
  });
  if (room.actionLogs.length > 35) {
    room.actionLogs.length = 35;
  }
}

function advanceTurn(room: ServerRoom, steps = 1) {
  const total = room.players.length;
  if (total === 0) return;
  const next =
    (((room.currentTurnIndex + room.direction * steps) % total) + total) % total;
  room.currentTurnIndex = next;
  room.drawnCardIdThisTurn = null;
  room.turnStartedAt = Date.now();
}

function calculateHandPoints(hand: UnoCard[]): number {
  let sum = 0;
  for (const c of hand) {
    if (c.value === 'wild' || c.value === 'wild4') sum += 50;
    else if (c.value === 'skip' || c.value === 'reverse' || c.value === 'draw2') sum += 20;
    else sum += parseInt(c.value, 10) || 0;
  }
  return sum;
}

function toClientState(room: ServerRoom, forUsername: string) {
  const normalizedUser = forUsername.trim().toLowerCase();
  const me = room.players.find((p) => p.username.trim().toLowerCase() === normalizedUser);
  const discardTop =
    room.discardPile.length > 0 ? room.discardPile[room.discardPile.length - 1] : null;
  const discardHistory = room.discardPile.slice(-6);

  return {
    code: room.code,
    hostUsername: room.hostUsername,
    status: room.status,
    players: room.players.map((p, idx) => ({
      username: p.username,
      seatIndex: idx,
      cardCount: p.hand.length,
      isBot: p.isBot,
      connected: p.connected,
      calledUno: p.calledUno,
      score: p.score,
      avatarHue: p.avatarHue,
      lastActionText: p.lastActionText,
    })),
    myHand: me ? me.hand : [],
    myUsername: me ? me.username : forUsername,
    direction: room.direction,
    currentTurnIndex: room.currentTurnIndex,
    activeColor: room.activeColor,
    activeValue: room.activeValue,
    discardTop,
    discardHistory,
    drawPileCount: room.deck.length,
    drawnCardIdThisTurn:
      room.players[room.currentTurnIndex]?.username.toLowerCase() === normalizedUser
        ? room.drawnCardIdThisTurn
        : null,
    winnerUsername: room.winnerUsername,
    turnStartedAt: room.turnStartedAt,
    version: room.version,
    lastUpdatedAt: room.lastUpdatedAt,
    actionLogs: room.actionLogs,
    reactions: room.reactions.slice(-12),
    sheetSync: room.sheetSync,
    lastPlayedAnim: room.lastPlayedAnim,
  };
}

// Track WebSocket clients per room & username
interface ClientConn {
  ws: WebSocket;
  roomCode: string;
  username: string;
}
const clients = new Set<ClientConn>();

function broadcastRoom(room: ServerRoom, latestReaction?: ReactionEvent) {
  room.version += 1;
  room.lastUpdatedAt = Date.now();
  saveRoomsBackup();

  for (const client of clients) {
    if (client.roomCode === room.code && client.ws.readyState === WebSocket.OPEN) {
      const payload = toClientState(room, client.username);
      client.ws.send(JSON.stringify({ type: 'ROOM_STATE', room: payload }));
    }
  }

  // Trigger non-blocking Google Sheet Apps Script sync if enabled
  if (room.sheetSync.enabled && room.sheetSync.scriptUrl) {
    void pushRoomToGoogleSheet(room, latestReaction);
  }
}

const syncInFlight = new Set<string>();
const syncPending = new Set<string>();

async function pushRoomToGoogleSheet(
  room: ServerRoom,
  latestReaction?: ReactionEvent
): Promise<{ ok: boolean; error?: string }> {
  const url = room.sheetSync.scriptUrl.trim();
  if (!url) return { ok: false, error: 'Chưa cấu hình URL Google Apps Script' };

  if (syncInFlight.has(room.code)) {
    syncPending.add(room.code);
    return { ok: true };
  }

  syncInFlight.add(room.code);
  room.sheetSync.status = 'syncing';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'syncRoom',
        room,
        latestReaction,
      }),
      redirect: 'follow',
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const text = await response.text();
    let parsed: { ok?: boolean; error?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      // If Apps Script returned HTML or redirect page, check status
      if (response.ok) parsed = { ok: true };
    }

    if (parsed.ok || response.ok) {
      room.sheetSync.status = 'synced';
      room.sheetSync.lastSyncedAt = Date.now();
      room.sheetSync.lastError = undefined;
      return { ok: true };
    } else {
      room.sheetSync.status = 'error';
      room.sheetSync.lastError = parsed.error || `HTTP ${response.status}`;
      return { ok: false, error: room.sheetSync.lastError };
    }
  } catch (err) {
    room.sheetSync.status = 'error';
    room.sheetSync.lastError = err instanceof Error ? err.message : String(err);
    return { ok: false, error: room.sheetSync.lastError };
  } finally {
    syncInFlight.delete(room.code);
    if (syncPending.has(room.code)) {
      syncPending.delete(room.code);
      setTimeout(() => {
        void pushRoomToGoogleSheet(room);
      }, 450);
    }
  }
}

async function pullRoomFromGoogleSheet(
  scriptUrl: string,
  code: string
): Promise<ServerRoom | null> {
  try {
    const target = new URL(scriptUrl.trim());
    target.searchParams.set('action', 'getRoom');
    target.searchParams.set('code', code.toUpperCase().trim());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(target.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = (await res.json()) as { ok?: boolean; room?: ServerRoom };
    if (data && data.ok && data.room && data.room.code) {
      return data.room;
    }
  } catch {
    // Ignore
  }
  return null;
}

const colorLabelVi: Record<ActiveColor, string> = {
  red: 'Đỏ',
  yellow: 'Vàng',
  green: 'Xanh Lá',
  blue: 'Xanh Dương',
};

function startGameInRoom(room: ServerRoom) {
  // Ensure at least 2 players (if solo, auto-add a friendly bot so game starts immediately)
  if (room.players.length < 2) {
    room.players.push({
      username: BOT_NAMES[0],
      seatIndex: 1,
      hand: [],
      isBot: true,
      connected: true,
      calledUno: false,
      score: 0,
      avatarHue: AVATAR_HUES[1],
      lastActionText: 'Sẵn sàng',
    });
  }

  room.deck = buildOfficialUnoDeck();
  room.discardPile = [];
  room.direction = 1;
  room.winnerUsername = null;
  room.drawnCardIdThisTurn = null;

  room.players.forEach((p, idx) => {
    p.seatIndex = idx;
    p.hand = drawFromDeck(room, 7);
    p.calledUno = false;
    p.lastActionText = 'Đã chia 7 lá';
  });

  // Draw initial non-wild card for discard pile
  let firstCard = drawFromDeck(room, 1)[0];
  while (firstCard && firstCard.color === 'wild') {
    room.deck.unshift(firstCard);
    room.deck = shuffle(room.deck);
    firstCard = drawFromDeck(room, 1)[0];
  }

  if (!firstCard) {
    firstCard = { id: 'init_0', color: 'red', value: '0' };
  }

  room.discardPile.push(firstCard);
  room.activeColor = firstCard.color === 'wild' ? 'red' : firstCard.color;
  room.activeValue = firstCard.value;
  room.currentTurnIndex = 0;
  room.turnStartedAt = Date.now();
  room.status = 'PLAYING';
  room.lastPlayedAnim = {
    card: firstCard,
    fromSeat: -1,
    timestamp: Date.now(),
  };

  addLog(
    room,
    `Ván mới bắt đầu! Lá mở màn: ${firstCard.value.toUpperCase()} (${colorLabelVi[room.activeColor]})`,
    'system'
  );
  broadcastRoom(room);
  scheduleBotTurnIfNeeded(room);
}

function handlePlayCard(
  room: ServerRoom,
  username: string,
  cardId: string,
  chosenColor?: ActiveColor
): { ok: boolean; error?: string } {
  if (room.status !== 'PLAYING') {
    return { ok: false, error: 'Ván chơi chưa bắt đầu.' };
  }

  const playerIndex = room.players.findIndex(
    (p) => p.username.trim().toLowerCase() === username.trim().toLowerCase()
  );
  if (playerIndex === -1) return { ok: false, error: 'Không tìm thấy người chơi.' };
  if (room.currentTurnIndex !== playerIndex) {
    return { ok: false, error: 'Chưa tới lượt của bạn!' };
  }

  const player = room.players[playerIndex];
  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx === -1) {
    return { ok: false, error: 'Lá bài không có trên tay.' };
  }

  const card = player.hand[cardIdx];
  if (!canPlayCard(card, room.activeColor, room.activeValue)) {
    return { ok: false, error: 'Lá bài không hợp lệ với màu hoặc số hiện tại!' };
  }

  // Remove card from hand
  player.hand.splice(cardIdx, 1);

  const nextColor: ActiveColor =
    card.color === 'wild' ? chosenColor || 'red' : card.color;
  const playedCard: UnoCard = {
    ...card,
    chosenColor: card.color === 'wild' ? nextColor : undefined,
  };

  room.discardPile.push(playedCard);
  room.activeColor = nextColor;
  room.activeValue = playedCard.value;
  room.drawnCardIdThisTurn = null;
  room.lastPlayedAnim = {
    card: playedCard,
    fromSeat: playerIndex,
    timestamp: Date.now(),
  };

  if (player.hand.length > 1) {
    player.calledUno = false;
  }

  // Check victory
  if (player.hand.length === 0) {
    room.status = 'ROUND_OVER';
    room.winnerUsername = player.username;
    let bonus = 0;
    for (const other of room.players) {
      if (other.username !== player.username) {
        bonus += calculateHandPoints(other.hand);
      }
    }
    player.score += Math.max(25, bonus);
    player.lastActionText = 'THẮNG VÁN NÀY! 🏆';
    addLog(
      room,
      `🎉 ${player.username} đã đánh hết bài và CHIẾN THẮNG (+${Math.max(25, bonus)} điểm)!`,
      'uno'
    );
    broadcastRoom(room);
    return { ok: true };
  }

  // Handle Special Cards
  const totalPlayers = room.players.length;

  if (playedCard.value === 'reverse') {
    if (totalPlayers === 2) {
      // In 2-player UNO, Reverse acts like Skip!
      player.lastActionText = `Đảo chiều (Mất lượt đối thủ)`;
      addLog(
        room,
        `${player.username} đánh ĐẢO CHIỀU (${colorLabelVi[nextColor]}) — đánh tiếp lượt!`,
        'play'
      );
      advanceTurn(room, 2);
    } else {
      room.direction = room.direction === 1 ? -1 : 1;
      player.lastActionText = `Đảo chiều vòng đánh`;
      addLog(
        room,
        `${player.username} đánh ĐẢO CHIỀU (${colorLabelVi[nextColor]})!`,
        'play'
      );
      advanceTurn(room, 1);
    }
  } else if (playedCard.value === 'skip') {
    const skippedIdx =
      (((room.currentTurnIndex + room.direction) % totalPlayers) + totalPlayers) %
      totalPlayers;
    const skippedPlayer = room.players[skippedIdx];
    skippedPlayer.lastActionText = 'Bị cấm lượt ⊘';
    player.lastActionText = `Cấm lượt ${skippedPlayer.username}`;
    addLog(
      room,
      `${player.username} đánh CẤM LƯỢT — ${skippedPlayer.username} mất lượt!`,
      'play'
    );
    advanceTurn(room, 2);
  } else if (playedCard.value === 'draw2') {
    const victimIdx =
      (((room.currentTurnIndex + room.direction) % totalPlayers) + totalPlayers) %
      totalPlayers;
    const victim = room.players[victimIdx];
    const penalty = drawFromDeck(room, 2);
    victim.hand.push(...penalty);
    victim.calledUno = false;
    victim.lastActionText = 'Bị rút +2 lá!';
    player.lastActionText = `Ép ${victim.username} +2 lá`;
    addLog(
      room,
      `${player.username} tung +2 (${colorLabelVi[nextColor]})! ${victim.username} phải rút 2 lá và mất lượt!`,
      'penalty'
    );
    advanceTurn(room, 2);
  } else if (playedCard.value === 'wild4') {
    const victimIdx =
      (((room.currentTurnIndex + room.direction) % totalPlayers) + totalPlayers) %
      totalPlayers;
    const victim = room.players[victimIdx];
    const penalty = drawFromDeck(room, 4);
    victim.hand.push(...penalty);
    victim.calledUno = false;
    victim.lastActionText = 'Ăn trọn +4 lá! 💣';
    player.lastActionText = `Đổi màu ${colorLabelVi[nextColor]} & +4`;
    addLog(
      room,
      `💣 ${player.username} tung WILD +4 (đổi sang màu ${colorLabelVi[nextColor]})! ${victim.username} rút 4 lá và mất lượt!`,
      'penalty'
    );
    advanceTurn(room, 2);
  } else if (playedCard.value === 'wild') {
    player.lastActionText = `Đổi sang màu ${colorLabelVi[nextColor]}`;
    addLog(
      room,
      `${player.username} đánh ĐỔI MÀU sang ${colorLabelVi[nextColor]}!`,
      'play'
    );
    advanceTurn(room, 1);
  } else {
    player.lastActionText = `Đánh ${playedCard.value} ${colorLabelVi[nextColor]}`;
    addLog(
      room,
      `${player.username} đánh lá ${playedCard.value} (${colorLabelVi[nextColor]}).`,
      'play'
    );
    advanceTurn(room, 1);
  }

  broadcastRoom(room);
  scheduleBotTurnIfNeeded(room);
  return { ok: true };
}

function handleDrawCard(
  room: ServerRoom,
  username: string
): { ok: boolean; error?: string } {
  if (room.status !== 'PLAYING') {
    return { ok: false, error: 'Ván chơi chưa bắt đầu.' };
  }

  const playerIndex = room.players.findIndex(
    (p) => p.username.trim().toLowerCase() === username.trim().toLowerCase()
  );
  if (playerIndex === -1) return { ok: false, error: 'Không tìm thấy người chơi.' };
  if (room.currentTurnIndex !== playerIndex) {
    return { ok: false, error: 'Chưa tới lượt của bạn!' };
  }

  const player = room.players[playerIndex];

  // If already drew a card this turn, pass turn
  if (room.drawnCardIdThisTurn) {
    player.lastActionText = 'Bỏ lượt sau khi rút';
    addLog(room, `${player.username} bỏ lượt.`, 'draw');
    advanceTurn(room, 1);
    broadcastRoom(room);
    scheduleBotTurnIfNeeded(room);
    return { ok: true };
  }

  const drawn = drawFromDeck(room, 1)[0];
  if (!drawn) return { ok: false, error: 'Bộ bài đã hết.' };

  player.hand.push(drawn);
  player.calledUno = false;

  // Check if drawn card can be played immediately
  if (canPlayCard(drawn, room.activeColor, room.activeValue)) {
    room.drawnCardIdThisTurn = drawn.id;
    player.lastActionText = 'Đã rút 1 lá (có thể đánh)';
    addLog(
      room,
      `${player.username} rút 1 lá từ nọc (có thể đánh ngay hoặc qua lượt).`,
      'draw'
    );
  } else {
    player.lastActionText = 'Rút 1 lá & qua lượt';
    addLog(room, `${player.username} rút 1 lá từ nọc và qua lượt.`, 'draw');
    advanceTurn(room, 1);
  }

  broadcastRoom(room);
  scheduleBotTurnIfNeeded(room);
  return { ok: true };
}

function handlePassTurn(
  room: ServerRoom,
  username: string
): { ok: boolean; error?: string } {
  if (room.status !== 'PLAYING') return { ok: false, error: 'Ván chưa bắt đầu.' };
  const playerIndex = room.players.findIndex(
    (p) => p.username.trim().toLowerCase() === username.trim().toLowerCase()
  );
  if (playerIndex !== room.currentTurnIndex) {
    return { ok: false, error: 'Chưa tới lượt của bạn.' };
  }
  if (!room.drawnCardIdThisTurn) {
    return { ok: false, error: 'Bạn phải rút bài trước khi bỏ lượt!' };
  }
  const player = room.players[playerIndex];
  player.lastActionText = 'Qua lượt';
  addLog(room, `${player.username} giữ lá vừa rút và qua lượt.`, 'draw');
  advanceTurn(room, 1);
  broadcastRoom(room);
  scheduleBotTurnIfNeeded(room);
  return { ok: true };
}

function handleCallUno(
  room: ServerRoom,
  username: string
): { ok: boolean; error?: string } {
  const player = room.players.find(
    (p) => p.username.trim().toLowerCase() === username.trim().toLowerCase()
  );
  if (!player) return { ok: false, error: 'Không tìm thấy người chơi.' };

  if (player.hand.length <= 2) {
    player.calledUno = true;
    player.lastActionText = 'HÔ UNO! 🔥';
    const reaction: ReactionEvent = {
      id: randomId('react'),
      username: player.username,
      seatIndex: player.seatIndex,
      kind: 'comment',
      content: 'UNO NÈ ANH EM ƠI! 🔥',
      timestamp: Date.now(),
    };
    room.reactions.push(reaction);
    addLog(room, `🔥 ${player.username} đã hô UNO thành công!`, 'uno');
    broadcastRoom(room, reaction);
    return { ok: true };
  }
  return { ok: false, error: 'Chỉ được hô UNO khi còn từ 1 đến 2 lá bài!' };
}

function handleCatchUno(
  room: ServerRoom,
  catcherUsername: string,
  targetUsername: string
): { ok: boolean; error?: string } {
  const target = room.players.find(
    (p) => p.username.trim().toLowerCase() === targetUsername.trim().toLowerCase()
  );
  if (!target) return { ok: false, error: 'Không tìm thấy người chơi.' };

  if (target.hand.length === 1 && !target.calledUno) {
    const penalty = drawFromDeck(room, 2);
    target.hand.push(...penalty);
    target.lastActionText = 'Quên hô UNO (+2 lá)!';
    addLog(
      room,
      `⚡ ${catcherUsername} bắt lỗi ${target.username} quên hô UNO! ${target.username} bị phạt rút +2 lá!`,
      'penalty'
    );
    broadcastRoom(room);
    return { ok: true };
  }
  return { ok: false, error: 'Người chơi này đã hô UNO hoặc có nhiều hơn 1 lá.' };
}

const botTimers = new Map<string, NodeJS.Timeout>();

function scheduleBotTurnIfNeeded(room: ServerRoom) {
  const existing = botTimers.get(room.code);
  if (existing) clearTimeout(existing);

  if (room.status !== 'PLAYING') return;
  const currentPlayer = room.players[room.currentTurnIndex];
  if (!currentPlayer || !currentPlayer.isBot) return;

  const timer = setTimeout(() => {
    if (room.status !== 'PLAYING') return;
    const bot = room.players[room.currentTurnIndex];
    if (!bot || !bot.isBot) return;

    // Bot calls UNO if <= 2 cards
    if (bot.hand.length <= 2 && !bot.calledUno) {
      bot.calledUno = true;
      addLog(room, `🤖 ${bot.username} hô UNO!`, 'uno');
    }

    // Find playable card (prefer action/number matching color first, save wild4 for last)
    const playable = bot.hand.filter((c) =>
      canPlayCard(c, room.activeColor, room.activeValue)
    );

    if (playable.length > 0) {
      playable.sort((a, b) => {
        if (a.color === 'wild' && b.color !== 'wild') return 1;
        if (a.color !== 'wild' && b.color === 'wild') return -1;
        return 0;
      });
      const chosen = playable[0];

      // Pick dominant color in bot's hand if playing wild
      const colorCounts: Record<ActiveColor, number> = {
        red: 0,
        yellow: 0,
        green: 0,
        blue: 0,
      };
      for (const c of bot.hand) {
        if (c.color !== 'wild') colorCounts[c.color] += 1;
      }
      const bestColor = (Object.keys(colorCounts) as ActiveColor[]).sort(
        (x, y) => colorCounts[y] - colorCounts[x]
      )[0];

      handlePlayCard(room, bot.username, chosen.id, bestColor);

      // Occasionally drop a funny bot emoji when playing +2 or +4
      if (chosen.value === 'draw2' || chosen.value === 'wild4') {
        const react: ReactionEvent = {
          id: randomId('react'),
          username: bot.username,
          seatIndex: bot.seatIndex,
          kind: 'emoji',
          content: chosen.value === 'wild4' ? '😂' : '😎',
          timestamp: Date.now(),
        };
        room.reactions.push(react);
        broadcastRoom(room, react);
      }
    } else {
      // Draw a card
      const drawn = drawFromDeck(room, 1)[0];
      if (drawn) {
        bot.hand.push(drawn);
        if (canPlayCard(drawn, room.activeColor, room.activeValue)) {
          handlePlayCard(room, bot.username, drawn.id, 'red');
          return;
        }
      }
      bot.lastActionText = 'Rút 1 lá';
      addLog(room, `${bot.username} rút 1 lá từ nọc và qua lượt.`, 'draw');
      advanceTurn(room, 1);
      broadcastRoom(room);
      scheduleBotTurnIfNeeded(room);
    }
  }, 950);

  botTimers.set(room.code, timer);
}

const DEFAULT_GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbz10vrItm3obLs8KHz8ZI7S6SyNit3jv23wVdPm4o2XVzGikL7LHum2RzmshR5rfYW3/exec';

async function findOrCreateRoomForJoin(
  code: string,
  username: string,
  scriptUrl?: string
): Promise<{ room: ServerRoom | null; reconnected: boolean; error?: string }> {
  const cleanCode = code.trim().toUpperCase();
  const cleanUsername = username.trim();
  if (!cleanUsername) return { room: null, reconnected: false, error: 'Vui lòng nhập Username.' };

  let room = rooms.get(cleanCode) || null;
  const effectiveScriptUrl = (scriptUrl || process.env.GOOGLE_SCRIPT_URL || DEFAULT_GOOGLE_SCRIPT_URL).trim();

  // If room not in memory, try restoring from Google Sheet!
  if (!room && effectiveScriptUrl) {
    const pulled = await pullRoomFromGoogleSheet(effectiveScriptUrl, cleanCode);
    if (pulled) {
      if (!pulled.sheetSync?.scriptUrl) {
        pulled.sheetSync = {
          enabled: true,
          scriptUrl: effectiveScriptUrl,
          lastSyncedAt: Date.now(),
          status: 'synced',
        };
      }
      rooms.set(cleanCode, pulled);
      room = pulled;
    }
  }

  if (!room) {
    return {
      room: null,
      reconnected: false,
      error: `Không tìm thấy phòng mã "${cleanCode}". Kiểm tra lại mã Code hoặc tạo phòng mới!`,
    };
  }

  // Check if player already exists in room (Reconnect flow!)
  const existingPlayer = room.players.find(
    (p) => p.username.trim().toLowerCase() === cleanUsername.toLowerCase()
  );

  if (existingPlayer) {
    existingPlayer.connected = true;
    existingPlayer.isBot = false;
    existingPlayer.lastActionText = 'Đã kết nối lại';
    addLog(
      room,
      `🔄 ${existingPlayer.username} đã khôi phục kết nối vào bàn chơi (còn ${existingPlayer.hand.length} lá)!`,
      'system'
    );
    broadcastRoom(room);
    return { room, reconnected: true };
  }

  // New player joining
  if (room.status !== 'LOBBY') {
    // Allow mid-game join if less than 6 players by dealing 7 cards immediately!
    if (room.players.length >= 6) {
      return {
        room: null,
        reconnected: false,
        error: 'Phòng đã đủ 6 người chơi. Nếu bạn bị văng, hãy nhập đúng Username cũ!',
      };
    }
    const newSeat = room.players.length;
    const hand = drawFromDeck(room, 7);
    room.players.push({
      username: cleanUsername,
      seatIndex: newSeat,
      hand,
      isBot: false,
      connected: true,
      calledUno: false,
      score: 0,
      avatarHue: AVATAR_HUES[newSeat % AVATAR_HUES.length],
      lastActionText: 'Vào bàn giữa hiệp (7 lá)',
    });
    addLog(room, `👋 ${cleanUsername} đã tham gia bàn chơi và được chia 7 lá!`, 'system');
    broadcastRoom(room);
    return { room, reconnected: false };
  }

  if (room.players.length >= 6) {
    return { room: null, reconnected: false, error: 'Phòng đã đủ tối đa 6 người chơi.' };
  }

  const newSeat = room.players.length;
  room.players.push({
    username: cleanUsername,
    seatIndex: newSeat,
    hand: [],
    isBot: false,
    connected: true,
    calledUno: false,
    score: 0,
    avatarHue: AVATAR_HUES[newSeat % AVATAR_HUES.length],
    lastActionText: 'Sẵn sàng',
  });

  addLog(room, `👋 ${cleanUsername} đã vào phòng chờ.`, 'system');
  broadcastRoom(room);
  return { room, reconnected: false };
}

function createNewRoom(
  hostUsername: string,
  customCode?: string,
  scriptUrl?: string,
  withBots = 1
): ServerRoom {
  const code =
    customCode && customCode.trim().length >= 3
      ? customCode.trim().toUpperCase().slice(0, 8)
      : generateRoomCode();

  const players: ServerPlayer[] = [
    {
      username: hostUsername.trim(),
      seatIndex: 0,
      hand: [],
      isBot: false,
      connected: true,
      calledUno: false,
      score: 0,
      avatarHue: AVATAR_HUES[0],
      lastActionText: 'Chủ phòng',
    },
  ];

  const botCount = Math.max(0, Math.min(3, withBots));
  for (let i = 0; i < botCount; i++) {
    players.push({
      username: BOT_NAMES[i],
      seatIndex: players.length,
      hand: [],
      isBot: true,
      connected: true,
      calledUno: false,
      score: 0,
      avatarHue: AVATAR_HUES[(i + 1) % AVATAR_HUES.length],
      lastActionText: 'Bot thông minh',
    });
  }

  const cleanScriptUrl = (
    scriptUrl ||
    process.env.GOOGLE_SCRIPT_URL ||
    DEFAULT_GOOGLE_SCRIPT_URL
  ).trim();

  const room: ServerRoom = {
    code,
    hostUsername: hostUsername.trim(),
    status: 'LOBBY',
    players,
    deck: [],
    discardPile: [],
    direction: 1,
    currentTurnIndex: 0,
    activeColor: 'red',
    activeValue: '0',
    drawnCardIdThisTurn: null,
    winnerUsername: null,
    turnStartedAt: Date.now(),
    version: 1,
    lastUpdatedAt: Date.now(),
    actionLogs: [
      {
        id: randomId('log'),
        text: `Phòng ${code} được tạo bởi ${hostUsername.trim()}. Chia sẻ mã Code cho bạn bè để cùng chơi!`,
        timestamp: Date.now(),
        type: 'system',
      },
    ],
    reactions: [],
    sheetSync: {
      enabled: Boolean(cleanScriptUrl),
      scriptUrl: cleanScriptUrl,
      lastSyncedAt: null,
      status: 'idle',
    },
  };

  rooms.set(code, room);
  saveRoomsBackup();
  if (room.sheetSync.enabled) {
    void pushRoomToGoogleSheet(room);
  }
  return room;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // REST API: List public/active rooms for quick lobby discovery
  app.get('/api/rooms', (_req, res) => {
    const list = Array.from(rooms.values())
      .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
      .slice(0, 12)
      .map((r) => ({
        code: r.code,
        hostUsername: r.hostUsername,
        status: r.status,
        playerCount: r.players.length,
        humanCount: r.players.filter((p) => !p.isBot).length,
        sheetSynced: r.sheetSync.enabled,
        updatedAt: r.lastUpdatedAt,
      }));
    res.json({ ok: true, rooms: list });
  });

  // REST API: Create Room
  app.post('/api/rooms/create', (req, res) => {
    const { username, customCode, scriptUrl, botCount } = req.body || {};
    if (!username || !String(username).trim()) {
      res.status(400).json({ ok: false, error: 'Vui lòng nhập Username của bạn.' });
      return;
    }
    const room = createNewRoom(
      String(username),
      customCode ? String(customCode) : undefined,
      scriptUrl ? String(scriptUrl) : undefined,
      typeof botCount === 'number' ? botCount : 1
    );
    res.json({
      ok: true,
      room: toClientState(room, String(username)),
    });
  });

  // REST API: Join or Reconnect by Username + Code
  app.post('/api/rooms/join', async (req, res) => {
    const { code, username, scriptUrl } = req.body || {};
    if (!code || !username) {
      res
        .status(400)
        .json({ ok: false, error: 'Vui lòng nhập đầy đủ Username và Mã phòng (Code).' });
      return;
    }
    const result = await findOrCreateRoomForJoin(
      String(code),
      String(username),
      scriptUrl ? String(scriptUrl) : undefined
    );
    if (!result.room) {
      res.status(404).json({ ok: false, error: result.error });
      return;
    }
    res.json({
      ok: true,
      reconnected: result.reconnected,
      room: toClientState(result.room, String(username)),
    });
  });

  // REST API: Poll room state (fallback for mobile networks)
  app.get('/api/rooms/:code/state', (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    const username = String(req.query.username || '');
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Không tìm thấy phòng.' });
      return;
    }
    res.json({ ok: true, room: toClientState(room, username) });
  });

  // REST API: Perform game action
  app.post('/api/rooms/:code/action', async (req, res) => {
    const code = String(req.params.code || '').toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      res.status(404).json({ ok: false, error: 'Không tìm thấy phòng.' });
      return;
    }

    const { type, username, cardId, chosenColor, kind, content, targetUsername, scriptUrl } =
      req.body || {};

    if (type === 'START_GAME') {
      startGameInRoom(room);
      res.json({ ok: true, room: toClientState(room, username) });
      return;
    }

    if (type === 'ADD_BOT') {
      if (room.players.length >= 6) {
        res.status(400).json({ ok: false, error: 'Bàn đã đủ tối đa 6 vị trí.' });
        return;
      }
      const nextBotName =
        BOT_NAMES.find((n) => !room.players.some((p) => p.username === n)) ||
        `Bot #${room.players.length}`;
      room.players.push({
        username: nextBotName,
        seatIndex: room.players.length,
        hand: room.status === 'PLAYING' ? drawFromDeck(room, 7) : [],
        isBot: true,
        connected: true,
        calledUno: false,
        score: 0,
        avatarHue: AVATAR_HUES[room.players.length % AVATAR_HUES.length],
        lastActionText: 'Bot mới vào',
      });
      addLog(room, `🤖 Đã thêm ${nextBotName} vào bàn chơi.`, 'system');
      broadcastRoom(room);
      res.json({ ok: true, room: toClientState(room, username) });
      return;
    }

    if (type === 'REMOVE_BOT') {
      const botIdx = room.players.map((p) => p.isBot).lastIndexOf(true);
      if (botIdx !== -1 && room.players.length > 1) {
        const removed = room.players.splice(botIdx, 1)[0];
        room.players.forEach((p, idx) => (p.seatIndex = idx));
        if (room.currentTurnIndex >= room.players.length) {
          room.currentTurnIndex = 0;
        }
        addLog(room, `Đã mời ${removed.username} rời bàn.`, 'system');
        broadcastRoom(room);
      }
      res.json({ ok: true, room: toClientState(room, username) });
      return;
    }

    if (type === 'PLAY_CARD') {
      const result = handlePlayCard(room, username, cardId, chosenColor);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json({ ok: true, room: toClientState(room, username) });
      return;
    }

    if (type === 'DRAW_CARD') {
      const result = handleDrawCard(room, username);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json({ ok: true, room: toClientState(room, username) });
      return;
    }

    if (type === 'PASS_TURN') {
      const result = handlePassTurn(room, username);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json({ ok: true, room: toClientState(room, username) });
      return;
    }

    if (type === 'CALL_UNO') {
      const result = handleCallUno(room, username);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json({ ok: true, room: toClientState(room, username) });
      return;
    }

    if (type === 'CATCH_UNO') {
      const result = handleCatchUno(room, username, targetUsername);
      if (!result.ok) {
        res.status(400).json(result);
        return;
      }
      res.json({ ok: true, room: toClientState(room, username) });
      return;
    }

    if (type === 'SEND_REACTION') {
      const playerIndex = room.players.findIndex(
        (p) => p.username.trim().toLowerCase() === String(username).trim().toLowerCase()
      );
      const seatIndex = playerIndex >= 0 ? playerIndex : 0;
      const reaction: ReactionEvent = {
        id: randomId('react'),
        username: String(username),
        seatIndex,
        kind: kind === 'comment' ? 'comment' : 'emoji',
        content: String(content || '😂').slice(0, 90),
        timestamp: Date.now(),
      };
      room.reactions.push(reaction);
      if (room.reactions.length > 30) {
        room.reactions.shift();
      }
      broadcastRoom(room, reaction);
      res.json({ ok: true, room: toClientState(room, username) });
      return;
    }

    if (type === 'SET_SHEET_URL') {
      const cleanUrl = String(scriptUrl || '').trim();
      room.sheetSync.scriptUrl = cleanUrl;
      room.sheetSync.enabled = Boolean(cleanUrl);
      room.sheetSync.status = cleanUrl ? 'syncing' : 'idle';
      if (cleanUrl) {
        const syncRes = await pushRoomToGoogleSheet(room);
        broadcastRoom(room);
        res.json({
          ok: syncRes.ok,
          error: syncRes.error,
          room: toClientState(room, username),
        });
        return;
      }
      broadcastRoom(room);
      res.json({ ok: true, room: toClientState(room, username) });
      return;
    }

    if (type === 'FORCE_SYNC_SHEET') {
      const syncRes = await pushRoomToGoogleSheet(room);
      broadcastRoom(room);
      res.json({
        ok: syncRes.ok,
        error: syncRes.error,
        room: toClientState(room, username),
      });
      return;
    }

    res.status(400).json({ ok: false, error: 'Hành động không hợp lệ.' });
  });

  // Test Google Sheet Apps Script endpoint directly
  app.post('/api/sheet-sync/test', async (req, res) => {
    const { scriptUrl } = req.body || {};
    if (!scriptUrl || !String(scriptUrl).trim()) {
      res.status(400).json({ ok: false, error: 'Vui lòng dán URL Web App (Apps Script).' });
      return;
    }
    try {
      const url = new URL(String(scriptUrl).trim());
      url.searchParams.set('action', 'ping');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(url.toString(), {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const text = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(text);
      } catch {
        if (response.ok) {
          data = { ok: true, spreadsheetName: 'Google Sheet Connected' };
        }
      }
      if (data.ok || response.ok) {
        res.json({
          ok: true,
          spreadsheetName: data.spreadsheetName || 'Google Sheet (Apps Script)',
          spreadsheetUrl: data.spreadsheetUrl || '',
        });
      } else {
        res.status(400).json({
          ok: false,
          error: String(data.error || 'Apps Script trả về lỗi kết nối.'),
        });
      }
    } catch (err) {
      res.status(400).json({
        ok: false,
        error:
          err instanceof Error
            ? `Không thể kết nối: ${err.message}`
            : 'Không thể kết nối tới URL Apps Script.',
      });
    }
  });

  const server = http.createServer(app);

  // Attach WebSocket Server on `/ws` so it never conflicts with Vite internal paths
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let currentClient: ClientConn | null = null;

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'BIND_SESSION') {
          const roomCode = String(msg.code || '').toUpperCase().trim();
          const username = String(msg.username || '').trim();
          if (!roomCode || !username) return;

          if (currentClient) {
            clients.delete(currentClient);
          }
          currentClient = { ws, roomCode, username };
          clients.add(currentClient);

          const room = rooms.get(roomCode);
          if (room) {
            const p = room.players.find(
              (pl) => pl.username.trim().toLowerCase() === username.toLowerCase()
            );
            if (p && !p.connected) {
              p.connected = true;
              broadcastRoom(room);
            } else {
              ws.send(
                JSON.stringify({
                  type: 'ROOM_STATE',
                  room: toClientState(room, username),
                })
              );
            }
          }
        }
      } catch {
        // Ignore malformed WS packets
      }
    });

    ws.on('close', () => {
      if (currentClient) {
        const { roomCode, username } = currentClient;
        clients.delete(currentClient);
        currentClient = null;

        // Check if user still has another tab open
        const stillConnected = Array.from(clients).some(
          (c) =>
            c.roomCode === roomCode &&
            c.username.trim().toLowerCase() === username.trim().toLowerCase()
        );
        if (!stillConnected) {
          const room = rooms.get(roomCode);
          if (room) {
            const p = room.players.find(
              (pl) => pl.username.trim().toLowerCase() === username.trim().toLowerCase()
            );
            if (p && !p.isBot) {
              p.connected = false;
              p.lastActionText = 'Tạm mất kết nối (Chờ tải lại)';
              broadcastRoom(room);
            }
          }
        }
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`UNO 3D Royal Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

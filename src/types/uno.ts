export type CardColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
export type ActiveColor = 'red' | 'yellow' | 'green' | 'blue';

export type CardValue =
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

export interface UnoCard {
  id: string;
  color: CardColor;
  value: CardValue;
  chosenColor?: ActiveColor;
}

export interface PlayerPublicState {
  username: string;
  seatIndex: number;
  cardCount: number;
  isBot: boolean;
  connected: boolean;
  calledUno: boolean;
  score: number;
  avatarHue: number;
  lastActionText?: string;
}

export interface ReactionEvent {
  id: string;
  username: string;
  seatIndex: number;
  kind: 'emoji' | 'comment';
  content: string;
  timestamp: number;
}

export interface GameActionLog {
  id: string;
  text: string;
  timestamp: number;
  type: 'play' | 'draw' | 'uno' | 'penalty' | 'system';
}

export interface SheetSyncConfig {
  enabled: boolean;
  scriptUrl: string;
  lastSyncedAt: number | null;
  status: 'idle' | 'syncing' | 'synced' | 'error';
  lastError?: string;
  sheetRowCount?: number;
}

export interface ClientRoomState {
  code: string;
  hostUsername: string;
  status: 'LOBBY' | 'PLAYING' | 'ROUND_OVER';
  players: PlayerPublicState[];
  myHand: UnoCard[];
  myUsername: string;
  direction: 1 | -1;
  currentTurnIndex: number;
  activeColor: ActiveColor;
  activeValue: CardValue;
  discardTop: UnoCard | null;
  discardHistory: UnoCard[];
  drawPileCount: number;
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

export type CameraPreset = 'player' | 'overhead' | 'cinema';

export function canPlayCard(
  card: UnoCard,
  activeColor: ActiveColor,
  activeValue: CardValue
): boolean {
  if (card.color === 'wild') return true;
  if (card.color === activeColor) return true;
  if (card.value === activeValue) return true;
  return false;
}

export const COLOR_LABELS_VI: Record<ActiveColor, string> = {
  red: 'Đỏ Ruby',
  yellow: 'Vàng Hoàng Kim',
  green: 'Xanh Ngọc Lục',
  blue: 'Xanh Lam Bảo',
};

export const COLOR_HEX: Record<ActiveColor, string> = {
  red: '#EF4444',
  yellow: '#F59E0B',
  green: '#10B981',
  blue: '#3B82F6',
};

export const VALUE_LABELS_VI: Record<CardValue, string> = {
  '0': '0',
  '1': '1',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  skip: 'Cấm Lượt (⊘)',
  reverse: 'Đảo Chiều (⇄)',
  draw2: 'Rút +2',
  wild: 'Đổi Màu (★)',
  wild4: 'Đổi Màu +4',
};

export const QUICK_EMOJIS = [
  { id: 'haha', icon: '😂', label: 'Haha!' },
  { id: 'rofl', icon: '🤣', label: 'Cười xỉu' },
  { id: 'fire', icon: '🔥', label: 'Cháy quá!' },
  { id: 'plus4', icon: '💣', label: 'Ăn +4 nè!' },
  { id: 'cry', icon: '😭', label: 'Tha mạng!' },
  { id: 'cool', icon: '😎', label: 'UNO nha!' },
  { id: 'angry', icon: '😤', label: 'Cay thế!' },
  { id: 'clap', icon: '👏', label: 'Hay lắm!' },
];

export const QUICK_COMMENTS = [
  'Haha ăn +4 vui vẻ nha! 😂',
  'Đổi màu hộ cái bạn ơi!',
  'Đừng đánh mình, còn 1 lá thôi 😭',
  'Nhanh tay lên nào bạn ơi!',
  'Phòng này căng cực 🔥',
  'Xin lỗi nhưng mình thắng trước nhé 😎',
];

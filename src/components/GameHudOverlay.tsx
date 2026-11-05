import React, { useEffect, useState } from 'react';
import {
  Bot,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  LogOut,
  MessageCircle,
  Play,
  Plus,
  RotateCcw,
  Send,
  Share2,
  Smile,
  Sparkles,
  Trophy,
  UserMinus,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  ActiveColor,
  CameraPreset,
  canPlayCard,
  ClientRoomState,
  COLOR_HEX,
  COLOR_LABELS_VI,
  QUICK_COMMENTS,
  QUICK_EMOJIS,
  UnoCard,
  VALUE_LABELS_VI,
} from '../types/uno';

interface GameHudOverlayProps {
  room: ClientRoomState;
  cameraPreset: CameraPreset;
  muted: boolean;
  pendingWildCard: UnoCard | null;
  onChangeCameraPreset: () => void;
  onToggleMute: () => void;
  onStartGame: () => void;
  onAddBot: () => void;
  onRemoveBot: () => void;
  onCardClick: (card: UnoCard) => void;
  onConfirmWildColor: (color: ActiveColor) => void;
  onCancelWild: () => void;
  onDrawCard: () => void;
  onPassTurn: () => void;
  onCallUno: () => void;
  onCatchUno: (targetUsername: string) => void;
  onSendReaction: (kind: 'emoji' | 'comment', content: string) => void;
  onOpenSheetModal: () => void;
  onLeaveRoom: () => void;
}

export const GameHudOverlay: React.FC<GameHudOverlayProps> = ({
  room,
  cameraPreset,
  muted,
  pendingWildCard,
  onChangeCameraPreset,
  onToggleMute,
  onStartGame,
  onAddBot,
  onRemoveBot,
  onCardClick,
  onConfirmWildColor,
  onCancelWild,
  onDrawCard,
  onPassTurn,
  onCallUno,
  onCatchUno,
  onSendReaction,
  onOpenSheetModal,
  onLeaveRoom,
}) => {
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showReactionTray, setShowReactionTray] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());

  // Tick every 500ms to prune expired floating reactions (>3.6s)
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // Keyboard shortcut 'H' to toggle bottom control dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'h') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const myIndex = room.players.findIndex(
    (p) => p.username.trim().toLowerCase() === room.myUsername.trim().toLowerCase()
  );
  const isMyTurn =
    room.status === 'PLAYING' && myIndex === room.currentTurnIndex;
  const currentTurnPlayer = room.players[room.currentTurnIndex];
  const me = room.players[myIndex];

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyShareLink = async () => {
    try {
      const shareUrl = `${window.location.origin}${window.location.pathname}?code=${encodeURIComponent(
        room.code
      )}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleSendCommentForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    onSendReaction('comment', commentInput.trim());
    setCommentInput('');
    setShowReactionTray(false);
  };

  const recentReactions = room.reactions.filter(
    (r) => nowTs - r.timestamp < 3600
  );

  const cameraLabel: Record<CameraPreset, string> = {
    player: 'Góc nhìn 3D Chuẩn',
    overhead: 'Góc nhìn Từ Trên',
    cinema: 'Góc nhìn Điện Ảnh',
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2.5 sm:p-4 select-none overflow-hidden">
      {/* 1. TOP PERIMETER STATUS & OPPONENT SEATS */}
      <div className="w-full max-w-7xl mx-auto space-y-2">
        {/* Top Row: Room Code, Active Color/Turn Readout, and Utility Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
          {/* Left: Room Code + Share + Reconnect Identity */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-[#0F172A]/95 border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg">
            <span className="text-xs font-extrabold text-amber-400 font-display tracking-tight">
              UNO 3D
            </span>
            <span className="text-slate-600">·</span>
            <button
              onClick={handleCopyCode}
              title="Chép mã Code phòng"
              className="flex items-center gap-1 text-xs font-mono font-bold text-white hover:text-amber-300 transition-colors"
            >
              <span>Mã: {room.code}</span>
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>
            <span className="text-slate-600">·</span>
            <button
              onClick={handleCopyShareLink}
              className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {copiedLink ? 'Đã chép Link!' : 'Mời bạn'}
              </span>
            </button>
            <span className="hidden md:inline text-slate-600">·</span>
            <span className="hidden md:inline text-xs text-slate-300 truncate max-w-[130px]">
              Bạn: <strong className="text-white">{room.myUsername}</strong>
            </span>
          </div>

          {/* Center: Live Active Color, Value & Turn Banner */}
          {room.status === 'PLAYING' && (
            <div className="flex items-center gap-2.5 bg-[#0F172A]/95 border border-slate-800 px-3.5 py-1.5 rounded-xl shadow-lg">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-3.5 h-3.5 rounded-sm border border-white/80 shrink-0"
                  style={{ backgroundColor: COLOR_HEX[room.activeColor] }}
                />
                <span className="text-xs font-bold text-white whitespace-nowrap">
                  {COLOR_LABELS_VI[room.activeColor]}
                </span>
              </div>
              <span className="text-slate-600">·</span>
              <span className="text-xs font-mono font-bold text-amber-300 whitespace-nowrap">
                {VALUE_LABELS_VI[room.activeValue]}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs font-medium text-slate-300 whitespace-nowrap">
                {room.direction === 1 ? '↻ Thuận chiều' : '↺ Ngược chiều'}
              </span>
              <span className="text-slate-600 hidden sm:inline">·</span>
              <span
                className={`text-xs font-bold whitespace-nowrap ${
                  isMyTurn ? 'text-emerald-400' : 'text-amber-300'
                }`}
              >
                {isMyTurn
                  ? '⚡ TỚI LƯỢT BẠN!'
                  : `Lượt: ${currentTurnPlayer?.username || ''}`}
              </span>
            </div>
          )}

          {/* Right: Google Sheet Sync, Camera Preset, Audio, Leave */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenSheetModal}
              className="px-2.5 py-1.5 rounded-xl bg-[#0F172A]/95 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title="Cấu hình đồng bộ Google Sheet (Apps Script)"
            >
              <Database className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">
                {room.sheetSync.enabled ? 'Sheet: Đã nối' : 'Google Sheet'}
              </span>
            </button>

            <button
              onClick={onChangeCameraPreset}
              className="px-2.5 py-1.5 rounded-xl bg-[#0F172A]/95 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              title="Đổi góc máy 3D"
            >
              <Camera className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">{cameraLabel[cameraPreset]}</span>
            </button>

            <button
              onClick={onToggleMute}
              className="p-2 rounded-xl bg-[#0F172A]/95 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors"
              aria-label="Âm thanh"
            >
              {muted ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
            </button>

            <button
              onClick={onLeaveRoom}
              className="p-2 rounded-xl bg-[#0F172A]/95 hover:bg-rose-950 border border-slate-800 text-slate-300 hover:text-rose-300 transition-colors"
              title="Rời bàn (Có thể nhập lại Username + Code để vào lại)"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Second Row: Compact Player / Opponent Perimeter Strip with Live Floating Emoji & Comment Bubbles */}
        <div className="flex items-center justify-center gap-2 flex-wrap pointer-events-auto">
          {room.players.map((p, idx) => {
            const isTurn =
              room.status === 'PLAYING' && idx === room.currentTurnIndex;
            const isMe =
              p.username.trim().toLowerCase() ===
              room.myUsername.trim().toLowerCase();
            const playerReactions = recentReactions.filter(
              (r) =>
                r.username.trim().toLowerCase() ===
                p.username.trim().toLowerCase()
            );
            const canCatchUno =
              room.status === 'PLAYING' &&
              !isMe &&
              p.cardCount === 1 &&
              !p.calledUno;

            return (
              <div
                key={p.username}
                className={`relative flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-colors ${
                  isTurn
                    ? 'bg-slate-900 border-amber-400 shadow-md'
                    : 'bg-[#0F172A]/90 border-slate-800/90'
                }`}
              >
                {/* Avatar Initial Circle */}
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold text-slate-950 shrink-0"
                  style={{
                    backgroundColor: `hsl(${p.avatarHue}, 85%, 60%)`,
                  }}
                >
                  {p.username.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white leading-tight">
                    <span className="truncate max-w-[96px]">{p.username}</span>
                    {isMe && (
                      <span className="text-[10px] font-normal text-amber-300">
                        (Bạn)
                      </span>
                    )}
                    {!p.connected && !p.isBot && (
                      <span className="text-[10px] text-rose-400 font-normal">
                        (Tạm văng)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono tabular-nums leading-tight">
                    <span className="text-amber-300 font-bold">
                      {p.cardCount} lá
                    </span>
                    <span>·</span>
                    <span>{p.score}đ</span>
                    {p.calledUno && p.cardCount <= 2 && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-400 font-bold">UNO!</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Catch Forgotten UNO Button */}
                {canCatchUno && (
                  <button
                    onClick={() => onCatchUno(p.username)}
                    className="ml-1 px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-extrabold whitespace-nowrap shrink-0"
                    title="Bắt lỗi quên hô UNO (Phạt +2 lá)"
                  >
                    Bắt lỗi UNO!
                  </button>
                )}

                {/* Floating Emoji / Comment Bubbles right under/over the player seat badge */}
                {playerReactions.length > 0 && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 pointer-events-none flex flex-col items-center gap-1">
                    {playerReactions.slice(-2).map((react) => (
                      <div
                        key={react.id}
                        className="animate-reaction-float px-3 py-1.5 rounded-2xl bg-amber-400 text-slate-950 font-bold text-xs shadow-xl border border-white whitespace-nowrap flex items-center gap-1.5"
                      >
                        {react.kind === 'emoji' ? (
                          <span className="text-xl leading-none">
                            {react.content}
                          </span>
                        ) : (
                          <span>💬 {react.content}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. CENTER MODAL STATES (LOBBY WAITING / WILD COLOR PICKER / VICTORY) */}
      <div className="my-auto flex items-center justify-center pointer-events-none">
        {/* A. LOBBY ROOM SETUP */}
        {room.status === 'LOBBY' && (
          <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#0F172A]/95 border border-slate-800 p-6 shadow-2xl text-center space-y-4">
            <div className="space-y-1">
              <div className="text-xs font-mono uppercase tracking-wider text-amber-400">
                Phòng chờ UNO 3D
              </div>
              <h2 className="text-2xl font-extrabold text-white font-display">
                Mã Phòng: <span className="text-amber-400 font-mono">{room.code}</span>
              </h2>
              <p className="text-xs text-slate-400">
                Gửi mã Code hoặc Link phòng cho bạn bè. Khi lỡ văng có thể nhập lại Username + Code để vào lại ngay!
              </p>
            </div>

            <div className="flex items-center justify-center gap-2">
              <button
                onClick={handleCopyCode}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition-colors"
              >
                {copiedCode ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedCode ? 'Đã chép mã' : 'Chép mã Code'}</span>
              </button>
              <button
                onClick={handleCopyShareLink}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-emerald-400 flex items-center gap-1.5 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copiedLink ? 'Đã chép Link!' : 'Chép Link mời bạn'}</span>
              </button>
            </div>

            {/* Bot Adjusters */}
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={onAddBot}
                disabled={room.players.length >= 6}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors"
              >
                <Bot className="w-3.5 h-3.5 text-amber-400" />
                <Plus className="w-3 h-3" />
                <span>Thêm Bot</span>
              </button>
              {room.players.some((p) => p.isBot) && (
                <button
                  onClick={onRemoveBot}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-400 flex items-center gap-1.5 transition-colors"
                >
                  <UserMinus className="w-3.5 h-3.5 text-rose-400" />
                  <span>Bớt Bot</span>
                </button>
              )}
            </div>

            <button
              onClick={onStartGame}
              className="w-full py-3 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Bắt Đầu Chia Bài 3D ({room.players.length} người chơi)</span>
            </button>
          </div>
        )}

        {/* B. WILD CARD COLOR SELECTOR MODAL */}
        {pendingWildCard && (
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-[#0F172A]/95 border border-slate-700 p-5 shadow-2xl text-center space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white font-display">
                Chọn màu cho lá {VALUE_LABELS_VI[pendingWildCard.value]}
              </h3>
              <p className="text-xs text-slate-400">
                Màu bạn chọn sẽ áp dụng cho lượt đánh tiếp theo trên bàn 3D
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {(['red', 'yellow', 'green', 'blue'] as ActiveColor[]).map((col) => (
                <button
                  key={col}
                  onClick={() => onConfirmWildColor(col)}
                  className="py-3 px-4 rounded-xl font-bold text-xs text-white shadow-md flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform cursor-pointer border border-white/20"
                  style={{ backgroundColor: COLOR_HEX[col] }}
                >
                  <span className="w-3 h-3 rounded-full bg-white" />
                  <span>{COLOR_LABELS_VI[col]}</span>
                </button>
              ))}
            </div>
            <button
              onClick={onCancelWild}
              className="text-xs text-slate-400 hover:text-white underline"
            >
              Hủy chọn
            </button>
          </div>
        )}

        {/* C. ROUND OVER / VICTORY MODAL */}
        {room.status === 'ROUND_OVER' && (
          <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-[#0F172A]/95 border border-amber-500/50 p-6 shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center mx-auto text-amber-400">
              <Trophy className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-mono text-amber-400 uppercase">
                Kết thúc hiệp đấu
              </div>
              <h2 className="text-2xl font-extrabold text-white font-display">
                {room.winnerUsername} Chiến Thắng!
              </h2>
              <p className="text-xs text-slate-400">
                Điểm số đã được cộng và lưu vào phiên phòng {room.code}.
              </p>
            </div>

            <div className="bg-slate-950 rounded-xl p-3 border border-slate-800 space-y-1.5 text-left">
              <div className="text-[11px] font-semibold text-slate-400 uppercase">
                Bảng xếp hạng phòng {room.code}
              </div>
              {[...room.players]
                .sort((a, b) => b.score - a.score)
                .map((p, idx) => (
                  <div
                    key={p.username}
                    className="flex items-center justify-between text-xs py-1 border-b border-slate-900 last:border-0"
                  >
                    <span className="font-semibold text-slate-200">
                      {idx + 1}. {p.username}
                    </span>
                    <span className="font-mono font-bold text-amber-400 tabular-nums">
                      {p.score} điểm
                    </span>
                  </div>
                ))}
            </div>

            <button
              onClick={onStartGame}
              className="w-full py-3 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Chơi Ván Tiếp Theo</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. COLLAPSIBLE BOTTOM CONTROL DOCK (3D Skill Directive §5: Zero Side-Panel Clutter) */}
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center pointer-events-auto">
        {/* Emoji & Live Comment Popover Tray */}
        {showReactionTray && (
          <div className="mb-2 w-full max-w-md rounded-2xl bg-[#0F172A]/95 border border-slate-700 p-3.5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300">
                Thả cảm xúc Haha &amp; Bình luận trực tiếp lên bàn 3D
              </span>
              <button
                onClick={() => setShowReactionTray(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Đóng
              </button>
            </div>

            {/* Quick Emojis Grid */}
            <div className="grid grid-cols-4 gap-1.5">
              {QUICK_EMOJIS.map((em) => (
                <button
                  key={em.id}
                  onClick={() => {
                    onSendReaction('emoji', `${em.icon} ${em.label}`);
                    setShowReactionTray(false);
                  }}
                  className="py-1.5 px-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                >
                  <span className="text-base leading-none">{em.icon}</span>
                  <span className="truncate text-[11px]">{em.label}</span>
                </button>
              ))}
            </div>

            {/* Quick Preset Comments */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {QUICK_COMMENTS.map((txt, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onSendReaction('comment', txt);
                    setShowReactionTray(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 whitespace-nowrap shrink-0 transition-colors"
                >
                  {txt}
                </button>
              ))}
            </div>

            {/* Custom Comment Input */}
            <form onSubmit={handleSendCommentForm} className="flex items-center gap-2">
              <input
                type="text"
                maxLength={70}
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                placeholder="Nhập câu bình luận vui nhộn..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Gửi</span>
              </button>
            </form>
          </div>
        )}

        {/* Collapse / Expand Toggle Handle */}
        <button
          onClick={() => setDockCollapsed((prev) => !prev)}
          className="px-3.5 py-1 rounded-t-xl bg-[#0F172A]/95 border border-b-0 border-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5 text-amber-400" />
              <span>Hiện khay bài &amp; điều khiển (Phím H)</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              <span>Thu gọn khay để ngắm bàn 3D (Phím H)</span>
            </>
          )}
        </button>

        {/* Main Bottom Dock */}
        {!dockCollapsed && (
          <div className="w-full rounded-2xl bg-[#0F172A]/95 border border-slate-800 px-3 py-2.5 sm:px-4 sm:py-3 shadow-2xl space-y-2.5">
            {/* Mobile-Friendly Quick Touch Card Strip (mirrors 3D hand for 100% accurate mobile tapping) */}
            {room.status === 'PLAYING' && room.myHand.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 px-1">
                {room.myHand.map((card) => {
                  const playable =
                    isMyTurn &&
                    canPlayCard(card, room.activeColor, room.activeValue);
                  const bgHex =
                    card.color === 'wild'
                      ? '#1E293B'
                      : COLOR_HEX[card.color];

                  return (
                    <button
                      key={card.id}
                      onClick={() => onCardClick(card)}
                      disabled={!playable}
                      style={{ backgroundColor: bgHex }}
                      className={`relative px-2.5 py-2 rounded-xl border text-white font-display font-extrabold text-xs min-w-[52px] flex flex-col items-center justify-center shrink-0 transition-transform ${
                        playable
                          ? 'border-white shadow-md hover:-translate-y-1 cursor-pointer ring-2 ring-amber-400/70'
                          : 'border-white/20 opacity-45 cursor-not-allowed'
                      }`}
                      title={
                        playable
                          ? `Đánh lá ${VALUE_LABELS_VI[card.value]}`
                          : 'Chưa thể đánh lá này'
                      }
                    >
                      <span className="text-sm leading-none">
                        {card.value === 'skip'
                          ? '⊘'
                          : card.value === 'reverse'
                          ? '⇄'
                          : card.value === 'draw2'
                          ? '+2'
                          : card.value === 'wild'
                          ? '★'
                          : card.value === 'wild4'
                          ? '+4'
                          : card.value}
                      </span>
                      <span className="text-[9px] font-sans font-semibold opacity-90 mt-0.5 uppercase">
                        {card.color === 'wild' ? 'Đổi màu' : card.color}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Primary Action Controls & Live Log Line */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Left: Latest Match Event Log */}
              <div className="text-xs text-slate-300 truncate max-w-xs sm:max-w-md">
                {room.actionLogs[0]?.text || 'Sẵn sàng trên bàn UNO 3D Royal.'}
              </div>

              {/* Right: Game Action Buttons + Haha Emoji & Chat Triggers */}
              <div className="flex items-center gap-2 ml-auto">
                {room.status === 'PLAYING' && (
                  <>
                    <button
                      onClick={onDrawCard}
                      disabled={!isMyTurn}
                      className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-xs font-bold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Rút Nọc ({room.drawPileCount})
                    </button>

                    {isMyTurn && room.drawnCardIdThisTurn && (
                      <button
                        onClick={onPassTurn}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Qua Lượt
                      </button>
                    )}

                    {room.myHand.length <= 2 &&
                      room.myHand.length > 0 &&
                      !me?.calledUno && (
                        <button
                          onClick={onCallUno}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold flex items-center gap-1 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>HÔ UNO!</span>
                        </button>
                      )}
                  </>
                )}

                {/* Instant 1-Tap "Haha 😂" Button */}
                <button
                  onClick={() => onSendReaction('emoji', '😂 Haha!')}
                  className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Thả nhanh cảm xúc Haha!"
                >
                  <span className="text-sm leading-none">😂</span>
                  <span>Haha!</span>
                </button>

                {/* Open Full Emoji & Comment Tray */}
                <button
                  onClick={() => setShowReactionTray((prev) => !prev)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Smile className="w-3.5 h-3.5 text-amber-400" />
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">Bình luận</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

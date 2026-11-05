import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Database,
  Play,
  RotateCcw,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';

interface ActiveRoomSummary {
  code: string;
  hostUsername: string;
  status: 'LOBBY' | 'PLAYING' | 'ROUND_OVER';
  playerCount: number;
  humanCount: number;
  sheetSynced: boolean;
  updatedAt: number;
}

interface TitleLobbyScreenProps {
  initialUsername: string;
  initialCode: string;
  savedSession: { username: string; code: string } | null;
  errorMsg: string | null;
  loading: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onCreateRoom: (username: string, customCode: string, botCount: number) => void;
  onJoinOrReconnect: (username: string, code: string) => void;
  onOpenSheetModal: () => void;
}

export const TitleLobbyScreen: React.FC<TitleLobbyScreenProps> = ({
  initialUsername,
  initialCode,
  savedSession,
  errorMsg,
  loading,
  muted,
  onToggleMute,
  onCreateRoom,
  onJoinOrReconnect,
  onOpenSheetModal,
}) => {
  const [mode, setMode] = useState<'join' | 'create'>(
    initialCode ? 'join' : 'create'
  );
  const [username, setUsername] = useState(initialUsername);
  const [roomCode, setRoomCode] = useState(initialCode);
  const [customCode, setCustomCode] = useState('');
  const [botCount, setBotCount] = useState(1);
  const [publicRooms, setPublicRooms] = useState<ActiveRoomSummary[]>([]);

  useEffect(() => {
    if (initialCode) {
      setRoomCode(initialCode);
      setMode('join');
    }
  }, [initialCode]);

  useEffect(() => {
    let mounted = true;
    const fetchRooms = async () => {
      try {
        const res = await fetch('/api/rooms');
        const data = await res.json();
        if (mounted && data.ok && Array.isArray(data.rooms)) {
          setPublicRooms(data.rooms);
        }
      } catch {
        // ignore
      }
    };
    void fetchRooms();
    const interval = setInterval(fetchRooms, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    if (mode === 'create') {
      onCreateRoom(username.trim(), customCode.trim().toUpperCase(), botCount);
    } else {
      onJoinOrReconnect(username.trim(), roomCode.trim().toUpperCase());
    }
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 sm:p-6 overflow-y-auto">
      {/* Top Bar: Minimal Game Shell Header */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between gap-4 pointer-events-auto">
        <div className="flex items-center gap-3">
          {/* Bespoke inline SVG UNO 3D crest */}
          <svg
            width="42"
            height="42"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="shrink-0"
          >
            <rect
              x="6"
              y="4"
              width="28"
              height="38"
              rx="6"
              transform="rotate(-8 6 4)"
              fill="#EF4444"
              stroke="#F8FAFC"
              strokeWidth="2.5"
            />
            <rect
              x="14"
              y="6"
              width="28"
              height="38"
              rx="6"
              transform="rotate(6 14 6)"
              fill="#0F172A"
              stroke="#F59E0B"
              strokeWidth="2.5"
            />
            <ellipse
              cx="28"
              cy="25"
              rx="9"
              ry="13"
              transform="rotate(-15 28 25)"
              fill="#EF4444"
              stroke="#FDE68A"
              strokeWidth="2"
            />
            <text
              x="28"
              y="29"
              textAnchor="middle"
              fill="#FEF08A"
              fontSize="10"
              fontWeight="900"
              fontFamily="Bricolage Grotesque, sans-serif"
            >
              UNO
            </text>
          </svg>
          <div>
            <span className="text-lg font-extrabold tracking-tight text-white font-display block leading-none">
              UNO 3D ROYAL
            </span>
            <span className="text-xs text-slate-400">
              Online Multiplayer · Google Sheet Apps Script Sync
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenSheetModal}
            className="px-3.5 py-2 rounded-xl bg-slate-900/95 hover:bg-slate-800 border border-emerald-500/40 text-xs font-semibold text-emerald-300 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Google Sheet: Đã kết nối sẵn</span>
          </button>
          <button
            onClick={onToggleMute}
            className="p-2.5 rounded-xl bg-slate-900/95 hover:bg-slate-800 border border-slate-700/80 text-slate-200 transition-colors"
            aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Center Interactive Title & Session Card (leaves 3D table visible around & behind) */}
      <div className="w-full max-w-5xl mx-auto my-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-center py-4">
        {/* Left Column: Bespoke SVG Lockup & Game Highlights */}
        <div className="lg:col-span-6 space-y-4 text-left pointer-events-none">
          <div className="inline-block">
            <svg
              viewBox="0 0 420 110"
              className="w-full max-w-[360px] sm:max-w-[400px] h-auto drop-shadow-2xl"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FEF08A" />
                  <stop offset="50%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="#D97706" />
                </linearGradient>
                <linearGradient id="rubyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#F87171" />
                  <stop offset="100%" stopColor="#DC2626" />
                </linearGradient>
              </defs>
              <text
                x="6"
                y="78"
                fontFamily="Bricolage Grotesque, sans-serif"
                fontWeight="800"
                fontSize="82"
                fill="#090D16"
                opacity="0.85"
              >
                UNO 3D
              </text>
              <text
                x="0"
                y="72"
                fontFamily="Bricolage Grotesque, sans-serif"
                fontWeight="800"
                fontSize="82"
                fill="url(#goldGrad)"
                stroke="#FFFFFF"
                strokeWidth="2"
              >
                UNO 3D
              </text>
              <rect x="2" y="88" width="128" height="20" rx="4" fill="url(#rubyGrad)" />
              <text
                x="66"
                y="102"
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace"
                fontWeight="700"
                fontSize="11"
                fill="#FFFFFF"
                letterSpacing="2"
              >
                ROYAL TABLE
              </text>
            </svg>
          </div>

          <p className="text-sm sm:text-base text-slate-200 max-w-md leading-relaxed font-medium bg-slate-950/75 p-3.5 rounded-xl border border-slate-800/80">
             Đấu bài UNO 3D trực tuyến cùng bạn bè trên Mobile & PC. Mỗi phiên cấp <strong>Mã Code</strong> riêng, tự động lưu bài trên tay vào máy chủ & <strong>Google Sheet</strong> — lỡ văng chỉ cần nhập lại <strong>Username + Code</strong> là chơi tiếp ngay!
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 font-mono bg-slate-950/75 px-3.5 py-2 rounded-lg border border-slate-800/80 w-fit">
            <span>Chạm / Click lá bài 3D để đánh</span>
            <span aria-hidden="true">·</span>
            <span>Thả Haha 😂 &amp; Chat trực tiếp</span>
            <span aria-hidden="true">·</span>
            <span>Phím H ẩn/hiện khay</span>
          </div>
        </div>

        {/* Right Column: Create / Join / Reconnect Session Panel */}
        <div className="lg:col-span-6 pointer-events-auto">
          <div className="rounded-2xl bg-[#0F172A]/95 border border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4">
            {/* Quick Reconnect Banner if previous session exists */}
            {savedSession && (
              <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-500/40 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-amber-300 truncate">
                    Khôi phục phiên chơi gần nhất
                  </div>
                  <div className="text-xs text-slate-300 font-mono truncate">
                    User: <strong>{savedSession.username}</strong> · Code:{' '}
                    <strong className="text-amber-400">{savedSession.code}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    onJoinOrReconnect(savedSession.username, savedSession.code)
                  }
                  className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Tải lại ngay
                </button>
              </div>
            )}

            {/* Mode Segmented Control */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => setMode('create')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'create'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tạo Phòng Mới
              </button>
              <button
                type="button"
                onClick={() => setMode('join')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  mode === 'join'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Vào Phòng / Tải Lại Khi Văng
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-700 text-xs text-rose-200 font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tên người chơi (Username do bạn đặt)
                </label>
                <input
                  type="text"
                  required
                  maxLength={20}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="VD: MinhTuan, LinhChi..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-amber-400"
                />
              </div>

              {mode === 'create' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Mã Code phòng (Để trống = Tự cấp)
                    </label>
                    <input
                      type="text"
                      maxLength={8}
                      value={customCode}
                      onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                      placeholder="VD: UNO888"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-amber-300 placeholder-slate-600 text-sm font-mono uppercase focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Số máy (Bot) chơi cùng
                    </label>
                    <select
                      value={botCount}
                      onChange={(e) => setBotCount(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-medium focus:outline-none focus:border-amber-400"
                    >
                      <option value={0}>0 Bot (Đợi bạn bè vào)</option>
                      <option value={1}>1 Bot thông minh</option>
                      <option value={2}>2 Bot thông minh</option>
                      <option value={3}>3 Bot (Đủ bàn 4 người)</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Nhập Mã Code Phòng (Hoặc mã phiên đang chơi để tải lại bài)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="Nhập mã Code (VD: UNO888)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-amber-300 placeholder-slate-500 text-base font-mono font-bold uppercase tracking-wider focus:outline-none focus:border-amber-400"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nếu bạn lỡ thoát hoặc rớt mạng, chỉ cần nhập đúng <strong>Username</strong> và <strong>Mã Code</strong> cũ để lấy lại toàn bộ lá bài trên tay.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !username.trim()}
                className="w-full py-3 px-5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {loading
                    ? 'Đang kết nối bàn 3D...'
                    : mode === 'create'
                    ? 'Tạo Bàn UNO 3D & Lấy Mã Code'
                    : 'Vào Bàn / Khôi Phục Phiên Chơi'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Active Rooms List for Instant Join */}
            {publicRooms.length > 0 && (
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    Các phòng đang mở trên Server ({publicRooms.length})
                  </span>
                  <span>Chạm để điền mã</span>
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                  {publicRooms.map((r) => (
                    <div
                      key={r.code}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950 border border-slate-800/90 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono font-bold text-amber-400">
                          {r.code}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-300 truncate">
                          Chủ: {r.hostUsername}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-400 tabular-nums">
                          {r.playerCount}/6 chỗ
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRoomCode(r.code);
                          setMode('join');
                          if (username.trim()) {
                            onJoinOrReconnect(username.trim(), r.code);
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-amber-300 font-semibold transition-colors whitespace-nowrap shrink-0"
                      >
                        Vào ngay
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Footer Note */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between text-xs text-slate-400 pointer-events-none">
        <span>UNO 3D WebGL Engine · Tương thích cảm ứng Mobile &amp; Desktop</span>
        <span className="hidden sm:inline">
          Hỗ trợ đồng bộ Google Sheet (Apps Script) &amp; Khôi phục phiên chống văng
        </span>
      </div>
    </div>
  );
};

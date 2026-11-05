/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActiveColor,
  CameraPreset,
  canPlayCard,
  ClientRoomState,
  UnoCard,
} from './types/uno';
import { UnoScene3D } from './three/UnoScene3D';
import { TitleLobbyScreen } from './components/TitleLobbyScreen';
import { GameHudOverlay } from './components/GameHudOverlay';
import { GoogleSheetModal } from './components/GoogleSheetModal';
import { soundEngine } from './audio/soundEngine';

const SESSION_STORAGE_KEY = 'uno3d_royal_last_session';
const SCRIPT_URL_STORAGE_KEY = 'uno3d_royal_script_url';
const BUILTIN_GOOGLE_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbz10vrItm3obLs8KHz8ZI7S6SyNit3jv23wVdPm4o2XVzGikL7LHum2RzmshR5rfYW3/exec';

export default function App() {
  const [room, setRoom] = useState<ClientRoomState | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('player');
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [pendingWildCard, setPendingWildCard] = useState<UnoCard | null>(null);
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);

  const [defaultScriptUrl, setDefaultScriptUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(SCRIPT_URL_STORAGE_KEY) || BUILTIN_GOOGLE_SCRIPT_URL;
    } catch {
      return BUILTIN_GOOGLE_SCRIPT_URL;
    }
  });

  const [savedSession, setSavedSession] = useState<{
    username: string;
    code: string;
  } | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.username && parsed?.code) return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  });

  const [urlRoomCode] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams(window.location.search);
    return (params.get('code') || params.get('room') || '').toUpperCase().trim();
  });

  const wsRef = useRef<WebSocket | null>(null);
  const lastReactionIdRef = useRef<string | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  const persistSession = (username: string, code: string) => {
    const session = { username: username.trim(), code: code.trim().toUpperCase() };
    setSavedSession(session);
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // ignore
    }
  };

  // Trigger audio cues on incoming reactions or round victory
  useEffect(() => {
    if (!room) return;
    if (room.reactions.length > 0) {
      const latest = room.reactions[room.reactions.length - 1];
      if (latest.id !== lastReactionIdRef.current) {
        lastReactionIdRef.current = latest.id;
        if (latest.kind === 'emoji') {
          soundEngine.playHahaReaction();
        } else {
          soundEngine.playCommentPop();
        }
      }
    }
    if (
      room.status === 'ROUND_OVER' &&
      lastStatusRef.current === 'PLAYING'
    ) {
      soundEngine.playVictoryFanfare();
    }
    lastStatusRef.current = room.status;
  }, [room]);

  // WebSocket live connection + auto-reconnect when inside a room
  useEffect(() => {
    if (!room?.code || !room?.myUsername) return;

    let active = true;
    let reconnectTimer: number | undefined;

    const connectWs = () => {
      if (!active) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'BIND_SESSION',
            code: room.code,
            username: room.myUsername,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ROOM_STATE' && msg.room) {
            setRoom(msg.room);
          }
        } catch {
          // ignore
        }
      };

      ws.onclose = () => {
        if (active) {
          reconnectTimer = window.setTimeout(connectWs, 2000);
        }
      };
    };

    connectWs();

    // Lightweight periodic state poll fallback for mobile browser sleep/wake
    const pollInterval = window.setInterval(async () => {
      if (!active) return;
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.code)}/state?username=${encodeURIComponent(
            room.myUsername
          )}`
        );
        const data = await res.json();
        if (data.ok && data.room) {
          setRoom((prev) => {
            if (!prev || data.room.version >= prev.version) {
              return data.room;
            }
            return prev;
          });
        }
      } catch {
        // ignore
      }
    }, 3000);

    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      clearInterval(pollInterval);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [room?.code, room?.myUsername]);

  const handleCreateRoom = async (
    username: string,
    customCode: string,
    botCount: number
  ) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          customCode: customCode || undefined,
          scriptUrl: defaultScriptUrl || undefined,
          botCount,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error || 'Không thể tạo phòng.');
        return;
      }
      setRoom(data.room);
      persistSession(username, data.room.code);
    } catch {
      setErrorMsg('Lỗi kết nối máy chủ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinOrReconnect = async (username: string, code: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          code,
          scriptUrl: defaultScriptUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setErrorMsg(data.error || 'Không tìm thấy phòng hoặc không thể kết nối.');
        return;
      }
      setRoom(data.room);
      persistSession(username, data.room.code);
    } catch {
      setErrorMsg('Lỗi mạng khi vào phòng.');
    } finally {
      setLoading(false);
    }
  };

  const dispatchRoomAction = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!room) return;
      try {
        const res = await fetch(
          `/api/rooms/${encodeURIComponent(room.code)}/action`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              username: room.myUsername,
            }),
          }
        );
        const data = await res.json();
        if (data.ok && data.room) {
          setRoom(data.room);
        }
      } catch {
        // ignore
      }
    },
    [room]
  );

  const handleSelectOrPlayCard = useCallback(
    (card: UnoCard) => {
      if (!room || room.status !== 'PLAYING') return;
      const myIdx = room.players.findIndex(
        (p) =>
          p.username.trim().toLowerCase() ===
          room.myUsername.trim().toLowerCase()
      );
      if (myIdx !== room.currentTurnIndex) return;
      if (!canPlayCard(card, room.activeColor, room.activeValue)) return;

      if (card.color === 'wild') {
        setPendingWildCard(card);
        return;
      }

      void dispatchRoomAction({
        type: 'PLAY_CARD',
        cardId: card.id,
      });
    },
    [room, dispatchRoomAction]
  );

  const handleConfirmWildColor = (chosenColor: ActiveColor) => {
    if (!pendingWildCard) return;
    const cardId = pendingWildCard.id;
    setPendingWildCard(null);
    void dispatchRoomAction({
      type: 'PLAY_CARD',
      cardId,
      chosenColor,
    });
  };

  const handleDrawCard = useCallback(() => {
    if (!room || room.status !== 'PLAYING') return;
    const myIdx = room.players.findIndex(
      (p) =>
        p.username.trim().toLowerCase() ===
        room.myUsername.trim().toLowerCase()
    );
    if (myIdx !== room.currentTurnIndex) return;
    soundEngine.playDrawCard();
    void dispatchRoomAction({ type: 'DRAW_CARD' });
  }, [room, dispatchRoomAction]);

  const handleToggleMute = () => {
    const next = soundEngine.toggleMute();
    setMuted(next);
  };

  const handleCycleCamera = () => {
    setCameraPreset((prev) =>
      prev === 'player' ? 'overhead' : prev === 'overhead' ? 'cinema' : 'player'
    );
  };

  const handleSaveScriptUrl = async (url: string) => {
    setDefaultScriptUrl(url);
    try {
      localStorage.setItem(SCRIPT_URL_STORAGE_KEY, url);
    } catch {
      // ignore
    }
    if (room) {
      await dispatchRoomAction({
        type: 'SET_SHEET_URL',
        scriptUrl: url,
      });
    }
  };

  const handleForceSyncSheet = async () => {
    if (room) {
      await dispatchRoomAction({ type: 'FORCE_SYNC_SHEET' });
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#090D16] select-none">
      {/* Persistent 3D WebGL UNO Royal Table */}
      <UnoScene3D
        room={room}
        cameraPreset={cameraPreset}
        selectedCardId={pendingWildCard?.id || null}
        onSelectCard={handleSelectOrPlayCard}
        onDrawCard={handleDrawCard}
      />

      {/* Game Shell State: Title / Lobby Screen vs Playing / Room HUD */}
      {!room ? (
        <TitleLobbyScreen
          initialUsername={savedSession?.username || ''}
          initialCode={urlRoomCode || savedSession?.code || ''}
          savedSession={savedSession}
          errorMsg={errorMsg}
          loading={loading}
          muted={muted}
          onToggleMute={handleToggleMute}
          onCreateRoom={handleCreateRoom}
          onJoinOrReconnect={handleJoinOrReconnect}
          onOpenSheetModal={() => setIsSheetModalOpen(true)}
        />
      ) : (
        <GameHudOverlay
          room={room}
          cameraPreset={cameraPreset}
          muted={muted}
          pendingWildCard={pendingWildCard}
          onChangeCameraPreset={handleCycleCamera}
          onToggleMute={handleToggleMute}
          onStartGame={() => void dispatchRoomAction({ type: 'START_GAME' })}
          onAddBot={() => void dispatchRoomAction({ type: 'ADD_BOT' })}
          onRemoveBot={() => void dispatchRoomAction({ type: 'REMOVE_BOT' })}
          onCardClick={handleSelectOrPlayCard}
          onConfirmWildColor={handleConfirmWildColor}
          onCancelWild={() => setPendingWildCard(null)}
          onDrawCard={handleDrawCard}
          onPassTurn={() => void dispatchRoomAction({ type: 'PASS_TURN' })}
          onCallUno={() => {
            soundEngine.playUnoShout();
            void dispatchRoomAction({ type: 'CALL_UNO' });
          }}
          onCatchUno={(targetUsername) =>
            void dispatchRoomAction({ type: 'CATCH_UNO', targetUsername })
          }
          onSendReaction={(kind, content) =>
            void dispatchRoomAction({ type: 'SEND_REACTION', kind, content })
          }
          onOpenSheetModal={() => setIsSheetModalOpen(true)}
          onLeaveRoom={() => {
            setPendingWildCard(null);
            setRoom(null);
          }}
        />
      )}

      {/* Google Sheet (Apps Script) & Share Modal */}
      <GoogleSheetModal
        isOpen={isSheetModalOpen}
        onClose={() => setIsSheetModalOpen(false)}
        roomCode={room?.code}
        sheetSync={room?.sheetSync}
        defaultScriptUrl={defaultScriptUrl}
        onSaveScriptUrl={handleSaveScriptUrl}
        onForceSync={room ? handleForceSyncSheet : undefined}
      />
    </main>
  );
}

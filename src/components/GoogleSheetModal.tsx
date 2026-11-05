import React, { useState } from 'react';
import {
  Check,
  Copy,
  Database,
  ExternalLink,
  RefreshCw,
  Share2,
  X,
} from 'lucide-react';
import { GOOGLE_APPS_SCRIPT_CODE } from '../utils/appsScriptTemplate';
import { SheetSyncConfig } from '../types/uno';

interface GoogleSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode?: string;
  sheetSync?: SheetSyncConfig;
  defaultScriptUrl: string;
  onSaveScriptUrl: (url: string) => Promise<void>;
  onForceSync?: () => Promise<void>;
}

export const GoogleSheetModal: React.FC<GoogleSheetModalProps> = ({
  isOpen,
  onClose,
  roomCode,
  sheetSync,
  defaultScriptUrl,
  onSaveScriptUrl,
  onForceSync,
}) => {
  const [scriptUrl, setScriptUrl] = useState(
    sheetSync?.scriptUrl || defaultScriptUrl || ''
  );
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'connect' | 'code'>('connect');

  if (!isOpen) return null;

  const handleCopyAppsScript = async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // Fallback
    }
  };

  const shareUrl = (() => {
    const base = window.location.origin + window.location.pathname;
    return roomCode ? `${base}?code=${encodeURIComponent(roomCode)}` : base;
  })();

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareUrl(true);
      setTimeout(() => setCopiedShareUrl(false), 2500);
    } catch {
      // ignore
    }
  };

  const handleTestConnection = async () => {
    if (!scriptUrl.trim()) {
      setTestResult({
        ok: false,
        message: 'Vui lòng dán URL Web App (đuôi /exec) của Google Apps Script.',
      });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/sheet-sync/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptUrl: scriptUrl.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({
          ok: true,
          message: `Kết nối thành công tới Google Sheet: "${data.spreadsheetName}"!`,
        });
      } else {
        setTestResult({
          ok: false,
          message: data.error || 'Không thể kết nối tới Apps Script.',
        });
      }
    } catch {
      setTestResult({
        ok: false,
        message: 'Lỗi mạng khi kiểm tra kết nối Google Sheet.',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveScriptUrl(scriptUrl.trim());
      setTestResult({
        ok: true,
        message: scriptUrl.trim()
          ? 'Đã lưu & kích hoạt đồng bộ phiên chơi lên Google Sheet!'
          : 'Đã tắt đồng bộ Google Sheet (chỉ dùng máy chủ thời gian thực).',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pointer-events-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0F172A] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Đồng bộ Máy chủ Google Sheet (Apps Script) & Chia sẻ
              </h2>
              <p className="text-xs text-slate-400">
                Lưu trữ phiên chơi, bài trên tay (chống văng) & lịch sử cảm xúc lên Google Sheet tốc độ cao
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-slate-800 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('connect')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'connect'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            1. Kết nối URL & Link mời bạn bè
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'code'
                ? 'border-amber-400 text-amber-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Lấy mã nguồn Apps Script (Code.gs)
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-300">
          {activeTab === 'connect' ? (
            <>
              {/* Share Link Block */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                    <Share2 className="w-4 h-4" />
                    Link mời bạn bè vào chơi ngay (tương thích Mobile & PC)
                  </span>
                  {roomCode && (
                    <span className="text-xs font-mono text-slate-400">
                      Mã phòng: <strong className="text-white">{roomCode}</strong>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none"
                  />
                  <button
                    onClick={handleCopyShareLink}
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    {copiedShareUrl ? (
                      <>
                        <Check className="w-4 h-4" />
                        Đã chép Link
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Sao chép Link
                      </>
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  Mẹo: Bạn cũng có thể nhấn nút <strong>Share (Chia sẻ)</strong> ở góc trên của AI Studio để lấy link rút gọn đuôi <code>.ai.studio</code> gửi cho bạn bè.
                </p>
              </div>

              {/* Google Apps Script Web App URL Input */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-200">
                  URL Web App Google Apps Script (Tùy chọn — Đồng bộ hóa Google Sheet)
                </label>
                <input
                  type="url"
                  value={scriptUrl}
                  onChange={(e) => setScriptUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-amber-400"
                />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Game đã tích hợp sẵn máy chủ WebSocket thời gian thực siêu tốc. Khi bạn dán thêm URL Google Apps Script, mọi trạng thái phòng (<code>Rooms</code>), bài trên tay từng người chơi (<code>Players</code> — dùng để khôi phục khi lỡ văng) và biểu cảm (<code>Reactions</code>) sẽ được đồng bộ song song lên Google Sheet của bạn với <code>CacheService</code> mượt mà.
                </p>

                {testResult && (
                  <div
                    className={`p-3 rounded-xl text-xs border ${
                      testResult.ok
                        ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                        : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
                    }`}
                  >
                    {testResult.message}
                  </div>
                )}

                {sheetSync && sheetSync.enabled && (
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                    <span>
                      Trạng thái Sheet:{' '}
                      <strong className="text-emerald-400">
                        {sheetSync.status === 'synced'
                          ? 'Đã đồng bộ'
                          : sheetSync.status === 'syncing'
                          ? 'Đang đồng bộ...'
                          : sheetSync.status === 'error'
                          ? `Lỗi (${sheetSync.lastError || ''})`
                          : 'Sẵn sàng'}
                      </strong>
                    </span>
                    {sheetSync.lastSyncedAt && (
                      <span className="font-mono">
                        Cập nhật lúc:{' '}
                        {new Date(sheetSync.lastSyncedAt).toLocaleTimeString('vi-VN')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleTestConnection}
                    disabled={testing}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    {testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
                  </button>
                  {onForceSync && sheetSync?.enabled && (
                    <button
                      onClick={onForceSync}
                      className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Đồng bộ ngay
                    </button>
                  )}
                </div>

                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
                >
                  {saving ? 'Đang lưu...' : 'Lưu cấu hình Google Sheet'}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-400">
                    Cách tạo Google Sheet làm Server lưu phiên chơi (2 phút):
                  </span>
                  <a
                    href="https://sheets.new"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-emerald-400 hover:underline font-semibold"
                  >
                    Mở trang Google Sheet mới <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>
                    Mở Google Sheet mới, chọn <strong>Tiện ích mở rộng (Extensions)</strong> &rarr; <strong>Apps Script</strong>.
                  </li>
                  <li>
                    Nhấn nút <strong>Sao chép mã Code.gs</strong> bên dưới và dán đè vào cửa sổ Apps Script.
                  </li>
                  <li>
                    Nhấn <strong>Triển khai (Deploy)</strong> &rarr; <strong>Tùy chọn triển khai mới (New deployment)</strong> &rarr; chọn loại <strong>Ứng dụng web (Web app)</strong>.
                  </li>
                  <li>
                    Phần <em>Ai có quyền truy cập (Who has access)</em> chọn <strong>Bất kỳ ai (Anyone)</strong>, sau đó copy URL Web App (có đuôi <code>/exec</code>) dán vào tab Kết nối!
                  </li>
                </ol>
              </div>

              <div className="relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-slate-400">
                    Code.gs — Tối ưu hóa CacheService (&lt;30ms) + LockService
                  </span>
                  <button
                    onClick={handleCopyAppsScript}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Đã sao chép Code.gs!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Sao chép mã Code.gs
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 leading-relaxed select-all">
                  {GOOGLE_APPS_SCRIPT_CODE}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

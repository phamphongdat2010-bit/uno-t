/**
 * Complete Google Apps Script (Code.gs) template for high-speed Google Sheet UNO Server persistence.
 * Optimized with CacheService (sub-50ms reads/writes) + LockService + structured Sheet tabs:
 * - "Rooms": Active & historical room states (Code, Host, Status, Turn, ActiveColor, DiscardTop, FullStateJSON, UpdatedAt)
 * - "Players": Reconnect index by (RoomCode + Username) -> SeatIndex, Score, CardCount, HandJSON
 * - "Reactions": Live emoji ("Haha", etc.) & player comments log
 */
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ============================================================================
 * UNO 3D ROYAL — GOOGLE SHEET & APPS SCRIPT FAST SYNC ENGINE (v2.0)
 * ============================================================================
 * HƯỚNG DẪN CÀI ĐẶT NHANH (2 PHÚT):
 * 1. Mở một file Google Sheet mới tại: https://sheets.new
 * 2. Trên thanh menu, chọn: Tiện ích mở rộng (Extensions) -> Apps Script
 * 3. Xóa toàn bộ mã cũ trong tệp Code.gs và dán toàn bộ mã này vào.
 * 4. Nhấn biểu tượng Đĩa mềm (Lưu), sau đó nhấn nút "Triển khai" (Deploy) -> "Tùy chọn triển khai mới" (New deployment).
 * 5. Chọn loại: "Ứng dụng web" (Web app).
 *    - Thực thi dưới dạng (Execute as): "Tôi" (Me)
 *    - Ai có quyền truy cập (Who has access): "Bất kỳ ai" (Anyone)
 * 6. Nhấn "Triển khai" (Deploy), cấp quyền truy cập và sao chép URL Web App (đuôi /exec).
 * 7. Dán URL Web App vào mục "Liên kết Google Sheet" trong game UNO 3D Royal!
 * ============================================================================
 */

const CACHE_TTL_SECONDS = 21600; // 6 giờ lưu bộ nhớ đệm tốc độ cao

function ensureSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let roomsSheet = ss.getSheetByName('Rooms');
  if (!roomsSheet) {
    roomsSheet = ss.insertSheet('Rooms');
    roomsSheet.appendRow([
      'RoomCode',
      'HostUsername',
      'Status',
      'PlayerCount',
      'CurrentTurn',
      'ActiveColor',
      'ActiveValue',
      'Winner',
      'Version',
      'UpdatedAtISO',
      'StateJSON'
    ]);
    roomsSheet.getRange('A1:K1').setFontWeight('bold').setBackground('#0F172A').setFontColor('#F8FAFC');
    roomsSheet.setFrozenRows(1);
  }

  let playersSheet = ss.getSheetByName('Players');
  if (!playersSheet) {
    playersSheet = ss.insertSheet('Players');
    playersSheet.appendRow([
      'SessionKey',
      'RoomCode',
      'Username',
      'SeatIndex',
      'CardCount',
      'Score',
      'CalledUno',
      'IsBot',
      'UpdatedAtISO',
      'HandJSON'
    ]);
    playersSheet.getRange('A1:J1').setFontWeight('bold').setBackground('#0F172A').setFontColor('#F8FAFC');
    playersSheet.setFrozenRows(1);
  }

  let reactionsSheet = ss.getSheetByName('Reactions');
  if (!reactionsSheet) {
    reactionsSheet = ss.insertSheet('Reactions');
    reactionsSheet.appendRow([
      'TimestampISO',
      'RoomCode',
      'Username',
      'Kind',
      'Content'
    ]);
    reactionsSheet.getRange('A1:E1').setFontWeight('bold').setBackground('#0F172A').setFontColor('#F8FAFC');
    reactionsSheet.setFrozenRows(1);
  }

  return { ss, roomsSheet, playersSheet, reactionsSheet };
}

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = params.action || 'ping';
  const cache = CacheService.getScriptCache();

  if (action === 'ping') {
    const { ss } = ensureSheets();
    return jsonResponse({
      ok: true,
      service: 'UNO-3D-Royal-AppsScript',
      spreadsheetName: ss.getName(),
      spreadsheetUrl: ss.getUrl(),
      timestamp: Date.now()
    });
  }

  if (action === 'getRoom') {
    const code = String(params.code || '').toUpperCase().trim();
    if (!code) return jsonResponse({ ok: false, error: 'Missing room code' });

    // 1. Ưu tiên đọc từ CacheService (< 30ms)
    const cached = cache.get('UNO_ROOM_' + code);
    if (cached) {
      return jsonResponse({ ok: true, source: 'cache', room: JSON.parse(cached) });
    }

    // 2. Fallback đọc từ Sheet Rooms nếu Cache hết hạn
    const { roomsSheet } = ensureSheets();
    const data = roomsSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).toUpperCase() === code) {
        const stateJson = data[i][10];
        if (stateJson) {
          cache.put('UNO_ROOM_' + code, stateJson, CACHE_TTL_SECONDS);
          return jsonResponse({ ok: true, source: 'sheet', room: JSON.parse(stateJson) });
        }
      }
    }
    return jsonResponse({ ok: false, error: 'Không tìm thấy phòng ' + code + ' trên Google Sheet' });
  }

  if (action === 'listRooms') {
    const { roomsSheet } = ensureSheets();
    const data = roomsSheet.getDataRange().getValues();
    const rooms = [];
    for (let i = 1; i < data.length; i++) {
      if (data[i][0]) {
        rooms.push({
          code: data[i][0],
          hostUsername: data[i][1],
          status: data[i][2],
          playerCount: data[i][3],
          currentTurn: data[i][4],
          activeColor: data[i][5],
          activeValue: data[i][6],
          winner: data[i][7],
          version: data[i][8],
          updatedAt: data[i][9]
        });
      }
    }
    return jsonResponse({ ok: true, rooms: rooms });
  }

  return jsonResponse({ ok: true, message: 'UNO 3D Google Sheet Endpoint Active' });
}

function doPost(e) {
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '{}';
    const body = JSON.parse(raw);
    const action = body.action || 'syncRoom';
    const cache = CacheService.getScriptCache();

    if (action === 'syncRoom' && body.room) {
      const room = body.room;
      const code = String(room.code || '').toUpperCase().trim();
      const serialized = JSON.stringify(room);

      // Lưu ngay lập tức vào bộ nhớ đệm tốc độ cao
      cache.put('UNO_ROOM_' + code, serialized, CACHE_TTL_SECONDS);

      // Ghi xuống Google Sheet với LockService để tránh xung đột dòng
      const lock = LockService.getScriptLock();
      if (lock.tryLock(4000)) {
        try {
          const { roomsSheet, playersSheet, reactionsSheet } = ensureSheets();
          const nowIso = new Date().toISOString();

          // Upsert vào bảng Rooms
          const roomData = roomsSheet.getDataRange().getValues();
          let roomRowIndex = -1;
          for (let i = 1; i < roomData.length; i++) {
            if (String(roomData[i][0]).toUpperCase() === code) {
              roomRowIndex = i + 1;
              break;
            }
          }

          const currentTurnPlayer = (room.players && room.players[room.currentTurnIndex])
            ? room.players[room.currentTurnIndex].username
            : '';

          const rowValues = [
            code,
            room.hostUsername || '',
            room.status || 'LOBBY',
            (room.players || []).length,
            currentTurnPlayer,
            room.activeColor || '',
            room.activeValue || '',
            room.winnerUsername || '',
            room.version || 1,
            nowIso,
            serialized
          ];

          if (roomRowIndex > 0) {
            roomsSheet.getRange(roomRowIndex, 1, 1, rowValues.length).setValues([rowValues]);
          } else {
            roomsSheet.appendRow(rowValues);
          }

          // Upsert danh sách người chơi & bài trên tay để hỗ trợ tải lại khi văng (Reconnect)
          if (Array.isArray(room.players)) {
            const pData = playersSheet.getDataRange().getValues();
            room.players.forEach(function(p) {
              const sessionKey = code + '::' + String(p.username).toLowerCase();
              let pRow = -1;
              for (let j = 1; j < pData.length; j++) {
                if (String(pData[j][0]) === sessionKey) {
                  pRow = j + 1;
                  break;
                }
              }
              const pValues = [
                sessionKey,
                code,
                p.username,
                p.seatIndex,
                (p.hand ? p.hand.length : p.cardCount) || 0,
                p.score || 0,
                Boolean(p.calledUno),
                Boolean(p.isBot),
                nowIso,
                JSON.stringify(p.hand || [])
              ];
              if (pRow > 0) {
                playersSheet.getRange(pRow, 1, 1, pValues.length).setValues([pValues]);
              } else {
                playersSheet.appendRow(pValues);
              }
            });
          }

          // Nếu có reaction mới thì ghi vào sheet Reactions
          if (body.latestReaction) {
            const r = body.latestReaction;
            reactionsSheet.appendRow([
              nowIso,
              code,
              r.username || '',
              r.kind || 'emoji',
              r.content || ''
            ]);
          }
        } finally {
          lock.releaseLock();
        }
      }

      return jsonResponse({
        ok: true,
        code: code,
        version: room.version,
        syncedAt: Date.now()
      });
    }

    return jsonResponse({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

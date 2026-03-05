const TG_API = 'https://api.telegram.org';

interface TelegramFileResponse {
  ok: boolean;
  result?: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  };
}

/** Resolves a file_id to a temporary download URL via the Telegram Bot API. */
async function getFilePath(fileId: string, botToken: string): Promise<string | null> {
  const res = await fetch(`${TG_API}/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!res.ok) return null;
  const data = await res.json() as TelegramFileResponse;
  return data.ok && data.result?.file_path ? data.result.file_path : null;
}

/** Downloads a Telegram file by file_id and returns its raw bytes and content type. */
export async function downloadTelegramFile(
  fileId: string,
  botToken: string,
  declaredMimeType?: string,
): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
  const filePath = await getFilePath(fileId, botToken);
  if (!filePath) return null;

  const res = await fetch(`${TG_API}/file/bot${botToken}/${filePath}`);
  if (!res.ok) return null;

  const mimeType = declaredMimeType
    ?? res.headers.get('content-type')
    ?? guessMimeFromPath(filePath);

  const data = await res.arrayBuffer();
  return { data, mimeType };
}

/** Best-effort MIME type from file path extension. */
function guessMimeFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'ogg': return 'audio/ogg';
    case 'mp3': return 'audio/mpeg';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'audio/webm';
    default: return 'application/octet-stream';
  }
}

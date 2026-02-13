const MAX_CONTENT_LENGTH = 50000;

export async function executeLinkRead(args: { url: string; max_length?: number }): Promise<string> {
  const { url, max_length } = args;
  const maxLen = max_length ?? MAX_CONTENT_LENGTH;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Pincer/1.0; +https://github.com/pincer)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return JSON.stringify({
        error: `HTTP ${response.status}: ${response.statusText}`,
        url,
      });
    }

    const contentType = response.headers.get('content-type') ?? '';
    const isHtml = contentType.includes('text/html');

    let text = await response.text();

    if (isHtml) {
      text = extractReadableContent(text);
    }

    if (text.length > maxLen) {
      text = text.slice(0, maxLen) + '\n\n[Content truncated]';
    }

    return JSON.stringify({
      url,
      title: isHtml ? extractTitle(text) : undefined,
      content: text,
      contentType,
      length: text.length,
    });
  } catch (error) {
    return JSON.stringify({
      error: `Failed to fetch: ${error instanceof Error ? error.message : String(error)}`,
      url,
    });
  }
}

function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1]?.trim().replace(/\s+/g, ' ') : undefined;
}

function extractReadableContent(html: string): string {
  // Remove scripts, styles, and other non-content elements
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '');

  // Convert some HTML to markdown-like text
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, _level, content) => `\n\n## ${content}\n\n`)
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, '');

  // Clean up whitespace
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return text;
}

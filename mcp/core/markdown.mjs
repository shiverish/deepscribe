/**
 * Markdown/HTML conversion for agent-supplied content.
 *
 * Shared domain core: this module is imported both by the renderer/bridge path
 * (`src/mcp/bridge.ts`) and by the standalone Node MCP server
 * (`mcp/direct-store.mjs`), so it must stay free of DOM and Node APIs. Callers
 * that do have a DOM may layer a richer implementation on top, but the result
 * of this module is the contract both paths fall back to.
 *
 * @module
 */

/**
 * @typedef {{ text: string; checked?: boolean }} MarkdownListItem
 * @typedef {'bullet' | 'ordered' | 'task'} MarkdownListType
 * @typedef {{ content: string; plainText: string; taskCount: number; completedTaskCount: number }} ContentStats
 */

/**
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character] ?? character);
}

/**
 * @param {string} value
 * @returns {string}
 */
export function unescapeHtml(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Detects the Markdown checkbox syntax that agents are not allowed to submit.
 * @param {string} value
 * @returns {boolean}
 */
export function containsMarkdownTask(value) {
  return /^\s*[-*+]\s+\[[ xX]\]\s+/m.test(String(value ?? ''));
}

/**
 * Converts the inline subset of Markdown. Everything outside a recognised token
 * is escaped, so agent input can never inject raw HTML.
 * @param {string} value
 * @returns {string}
 */
export function inlineMarkdown(value) {
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]\([^\s)]+\))/g;
  let result = '';
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    result += escapeHtml(value.slice(cursor, index));
    if (token.startsWith('`')) result += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    else if (token.startsWith('**') || token.startsWith('__')) result += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    else if (token.startsWith('~~')) result += `<s>${escapeHtml(token.slice(2, -2))}</s>`;
    else if (token.startsWith('*') || token.startsWith('_')) result += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link?.[2] || '';
      result += link && /^(https?:\/\/|mailto:)/i.test(href)
        ? `<a href="${escapeHtml(href)}">${escapeHtml(link[1])}</a>`
        : escapeHtml(token);
    }
    cursor = index + token.length;
  }
  return result + escapeHtml(value.slice(cursor));
}

/**
 * Converts agent Markdown into the TipTap-compatible HTML the editor stores.
 * A single blank line separates paragraphs; each additional blank line becomes
 * one visible empty paragraph.
 * @param {string} text
 * @returns {string}
 */
export function markdownToHtml(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  /** @type {string[]} */
  const output = [];
  /** @type {string[]} */
  let paragraph = [];
  /** @type {{ type: MarkdownListType; start?: number; items: MarkdownListItem[] } | null} */
  let list = null;
  let pendingBlankLines = 0;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    output.push(`<p>${paragraph.map(line => inlineMarkdown(line.trim())).join('<br>')}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    if (list.type === 'task') {
      output.push(`<ul data-type="taskList">${list.items.map(item => `<li data-type="taskItem" data-checked="${item.checked === true}"><label><input type="checkbox"${item.checked ? ' checked' : ''}><span></span></label><div><p>${inlineMarkdown(item.text)}</p></div></li>`).join('')}</ul>`);
    } else {
      const tag = list.type === 'ordered' ? 'ol' : 'ul';
      const start = tag === 'ol' && list.start && list.start !== 1 ? ` start="${list.start}"` : '';
      output.push(`<${tag}${start}>${list.items.map(item => `<li><p>${inlineMarkdown(item.text)}</p></li>`).join('')}</${tag}>`);
    }
    list = null;
  };
  /**
   * @param {MarkdownListType} type
   * @param {MarkdownListItem} item
   * @param {number} [start]
   */
  const addListItem = (type, item, start) => {
    flushParagraph();
    if (!list || list.type !== type) {
      flushList();
      list = { type, start, items: [] };
    }
    list.items.push(item);
  };
  const flushIntentionalBlankLines = () => {
    if (output.length > 0 && pendingBlankLines > 1) {
      output.push(...Array.from({ length: pendingBlankLines - 1 }, () => '<p></p>'));
    }
    pendingBlankLines = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      flushParagraph();
      flushList();
      pendingBlankLines += 1;
      continue;
    }
    flushIntentionalBlankLines();
    if (/^```/.test(line.trim())) {
      flushParagraph();
      flushList();
      const language = line.trim().slice(3).trim();
      /** @type {string[]} */
      const code = [];
      while (index + 1 < lines.length && !/^```\s*$/.test(lines[index + 1])) code.push(lines[++index]);
      if (index + 1 < lines.length) index += 1;
      const className = language && /^[a-z0-9_-]+$/i.test(language) ? ` class="language-${language}"` : '';
      output.push(`<pre><code${className}>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      flushList();
      output.push('<hr>');
      continue;
    }
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/.exec(line);
    if (task) {
      addListItem('task', { text: task[2], checked: task[1].toLowerCase() === 'x' });
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      addListItem('bullet', { text: bullet[1] });
      continue;
    }
    const ordered = /^\s*(\d+)[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      addListItem('ordered', { text: ordered[2] }, Number(ordered[1]));
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      output.push(`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return output.join('') || '<p></p>';
}

/**
 * Derives the stored statistics for a block from its HTML, without a DOM.
 *
 * Callers that have a DOM available may compute richer statistics themselves;
 * this remains the portable contract and the fallback for both paths.
 * @param {string} content
 * @returns {ContentStats}
 */
export function contentStatsFromHtml(content) {
  const html = content || '';
  const taskMatches = [...html.matchAll(/<li\s+[^>]*data-type="taskItem"[^>]*>/gi)];
  const completedMatches = [...html.matchAll(/<li\s+[^>]*data-type="taskItem"[^>]*data-checked="true"[^>]*>/gi)];
  return {
    content: html || '<p></p>',
    plainText: html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
    taskCount: taskMatches.length,
    completedTaskCount: completedMatches.length
  };
}

/**
 * Renders stored HTML back to readable plain text, preserving block breaks.
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  if (!html) return '';
  return unescapeHtml(
    String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

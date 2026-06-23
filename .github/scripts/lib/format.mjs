import { Marked } from 'marked';

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SAFE_URL = /^(?:https?:|mailto:|tel:|\/|#)/i;
const md = new Marked({
  renderer: {
    html(token) {
      return escapeHtml(typeof token === 'string' ? token : token.text ?? token.raw ?? '');
    },
    link({ href, title, tokens }) {
      if (!SAFE_URL.test(href ?? '')) {
        // unsafe scheme — drop the anchor, keep the label text
        return this.parser.parseInline(tokens);
      }
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${href}"${titleAttr}>${this.parser.parseInline(tokens)}</a>`;
    },
    image({ href, title, text }) {
      if (!SAFE_URL.test(href ?? '')) {
        // unsafe scheme — drop the image, keep alt text if any
        return text ? escapeHtml(text) : '';
      }
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      const altAttr = text ? ` alt="${escapeHtml(text)}"` : '';
      return `<img src="${href}"${altAttr}${titleAttr}>`;
    },
  },
});

export function parseVersion(tag) {
  const m = String(tag ?? '').match(/^v?(\d+\.\d+\.\d+)$/);
  if (!m) throw new Error(`unexpected tag format: ${tag}`);
  return m[1];
}

export function formatReleaseDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${iso}`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  const ampm = get('dayPeriod').toLowerCase();
  return `${get('month')} ${get('day')}, ${get('year')} ${get('hour')}:${get('minute')}${ampm} ${get('timeZoneName')}`;
}

export function renderNotesToList(markdown) {
  const tokens = md.lexer(String(markdown ?? '').trim());
  const items = [];
  const pushList = (listToken) => {
    for (const item of listToken.items) {
      const subTokens = item.tokens ?? [];
      const inline = subTokens
        .filter((t) => t.type !== 'list')
        .map((t) => md.parseInline(String(t.text ?? '').trim()))
        .join(' ')
        .trim();
      if (inline) items.push(inline);
      for (const sub of subTokens.filter((t) => t.type === 'list')) pushList(sub);
    }
  };
  for (const token of tokens) {
    if (token.type === 'list') {
      pushList(token);
    } else if (token.type === 'space' || token.type === 'hr') {
      // structural — nothing to surface
    } else {
      // paragraph, heading, blockquote, code, table, etc. — surface text, don't drop it
      const rendered = md.parseInline(String(token.text ?? token.raw ?? '').trim());
      if (rendered) items.push(rendered);
    }
  }
  if (items.length === 0) return '';
  return `<ul>${items.map((t) => `<li>${t}</li>`).join('')}</ul>`;
}

const DOWNLOAD_URL = 'https://swimtopia.com/downloads/maestro/latest';

export function buildVersionSection(version, dateStr, listHtml) {
  return (
    `<p><span class="wysiwyg-font-size-large" style="color: #000099;">`
    + `<strong>Version ${version} </strong>(Desktop and Web)</span>`
    + `<br><span class="wysiwyg-font-size-medium">${dateStr}</span></p>`
    + `<p><a href="${DOWNLOAD_URL}" target="_blank" rel="noopener noreferrer">`
    + `<span class="wysiwyg-font-size-medium">Download Latest Desktop Installer</span></a></p>`
    + listHtml
  );
}

export function alreadyContainsVersion(body, version) {
  return String(body).includes(`Version ${version} </strong>`);
}

export function insertSection(body, sectionHtml) {
  const str = String(body);
  const m = str.match(/<hr\b[^>]*>/i);
  if (!m) throw new Error('no <hr> found in article body — refusing to guess insertion point');
  const cut = m.index + m[0].length;
  return str.slice(0, cut) + sectionHtml + '<hr>' + str.slice(cut);
}

export function composeUpdate(currentBody, { tag, notes, publishedAt }) {
  const version = parseVersion(tag);
  if (alreadyContainsVersion(currentBody, version)) {
    return { skipped: true, version };
  }
  const section = buildVersionSection(
    version,
    formatReleaseDate(publishedAt),
    renderNotesToList(notes),
  );
  return { skipped: false, version, body: insertSection(currentBody, section) };
}

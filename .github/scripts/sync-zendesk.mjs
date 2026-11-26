import { readFileSync } from 'node:fs';
import { composeUpdate } from './lib/format.mjs';

const ARTICLE_ID = '360028033092';
const LOCALE = 'en-us';
// Only what the sync needs: read and update one Help Center article.
const SCOPE = 'hc:read hc:write';

export function readRelease() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    if (!event.release) throw new Error('event payload has no "release"');
    const r = event.release;
    return { tag: r.tag_name, notes: r.body ?? '', publishedAt: r.published_at };
  }
  return {
    tag: requireEnv('RELEASE_TAG'),
    notes: process.env.RELEASE_BODY ?? '',
    publishedAt: requireEnv('RELEASE_PUBLISHED_AT'),
  };
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

export function translationUrl() {
  const subdomain = requireEnv('ZENDESK_SUBDOMAIN');
  return `https://${subdomain}.zendesk.com/api/v2/help_center/articles/${ARTICLE_ID}/translations/${LOCALE}.json`;
}

// Zendesk is retiring API tokens, so the sync authenticates as an OAuth client: exchange the client
// credentials for a short-lived (30-minute) access token. A run takes seconds, so one token per run is
// enough — no caching or refresh.
export async function mintAccessToken() {
  const subdomain = requireEnv('ZENDESK_SUBDOMAIN');
  const res = await fetch(`https://${subdomain}.zendesk.com/oauth/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: requireEnv('ZENDESK_CLIENT_ID'),
      client_secret: requireEnv('ZENDESK_CLIENT_SECRET'),
      scope: SCOPE,
    }),
  });
  if (!res.ok) throw new Error(`Zendesk token request failed: ${res.status} ${await res.text()}`);
  const { access_token: token } = await res.json();
  if (!token) throw new Error('Zendesk token response had no access_token');
  return token;
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function fetchTranslationBody(token) {
  const res = await fetch(translationUrl(), { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`Zendesk GET failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.translation.body;
}

async function putTranslationBody(token, body) {
  const res = await fetch(translationUrl(), {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify({ translation: { body } }),
  });
  if (!res.ok) throw new Error(`Zendesk PUT failed: ${res.status} ${await res.text()}`);
}

export async function main() {
  const release = readRelease();
  const token = await mintAccessToken();
  const current = await fetchTranslationBody(token);
  const result = composeUpdate(current, release);
  if (result.skipped) {
    console.log(`Version ${result.version} already present in article ${ARTICLE_ID} — skipping.`);
    return;
  }
  if (process.env.DRY_RUN === 'true') {
    console.log(`DRY_RUN — would publish Version ${result.version}. New body:\n${result.body}`);
    return;
  }
  await putTranslationBody(token, result.body);
  console.log(`Published Version ${result.version} to Zendesk article ${ARTICLE_ID}.`);
}

// Run only when executed directly, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

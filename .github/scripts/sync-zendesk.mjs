import { readFileSync } from 'node:fs';
import { composeUpdate } from './lib/format.mjs';

const ARTICLE_ID = '360028033092';
const LOCALE = 'en-us';

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

function authHeaders() {
  const email = requireEnv('ZENDESK_EMAIL');
  const token = requireEnv('ZENDESK_API_TOKEN');
  const basic = Buffer.from(`${email}/token:${token}`).toString('base64');
  return { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' };
}

async function fetchTranslationBody() {
  const res = await fetch(translationUrl(), { headers: authHeaders() });
  if (!res.ok) throw new Error(`Zendesk GET failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.translation.body;
}

async function putTranslationBody(body) {
  const res = await fetch(translationUrl(), {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ translation: { body } }),
  });
  if (!res.ok) throw new Error(`Zendesk PUT failed: ${res.status} ${await res.text()}`);
}

export async function main() {
  const release = readRelease();
  const current = await fetchTranslationBody();
  const result = composeUpdate(current, release);
  if (result.skipped) {
    console.log(`Version ${result.version} already present in article ${ARTICLE_ID} — skipping.`);
    return;
  }
  if (process.env.DRY_RUN === 'true') {
    console.log(`DRY_RUN — would publish Version ${result.version}. New body:\n${result.body}`);
    return;
  }
  await putTranslationBody(result.body);
  console.log(`Published Version ${result.version} to Zendesk article ${ARTICLE_ID}.`);
}

// Run only when executed directly, not when imported by tests.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, mintAccessToken, readRelease, translationUrl } from '../sync-zendesk.mjs';

test('translationUrl targets the article translations endpoint (no locale before "articles")', () => {
  const prev = process.env.ZENDESK_SUBDOMAIN;
  process.env.ZENDESK_SUBDOMAIN = 'swimtopia';
  try {
    assert.equal(
      translationUrl(),
      'https://swimtopia.zendesk.com/api/v2/help_center/articles/360028033092/translations/en-us.json',
    );
  } finally {
    if (prev === undefined) delete process.env.ZENDESK_SUBDOMAIN;
    else process.env.ZENDESK_SUBDOMAIN = prev;
  }
});

test('readRelease fallback throws when RELEASE_TAG is unset', () => {
  const prevPath = process.env.GITHUB_EVENT_PATH;
  const prevTag = process.env.RELEASE_TAG;
  delete process.env.GITHUB_EVENT_PATH;
  delete process.env.RELEASE_TAG;
  try {
    assert.throws(() => readRelease(), /missing required env var: RELEASE_TAG/);
  } finally {
    if (prevPath === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = prevPath;
    if (prevTag === undefined) delete process.env.RELEASE_TAG;
    else process.env.RELEASE_TAG = prevTag;
  }
});

test('readRelease reads the release from GITHUB_EVENT_PATH', () => {
  const file = join(tmpdir(), `evt-${process.pid}.json`);
  writeFileSync(file, JSON.stringify({
    release: { tag_name: 'v9.9.9', body: '- hi', published_at: '2026-06-23T18:00:00Z' },
  }));
  const prev = process.env.GITHUB_EVENT_PATH;
  process.env.GITHUB_EVENT_PATH = file;
  try {
    assert.deepEqual(readRelease(), {
      tag: 'v9.9.9',
      notes: '- hi',
      publishedAt: '2026-06-23T18:00:00Z',
    });
  } finally {
    if (prev === undefined) delete process.env.GITHUB_EVENT_PATH;
    else process.env.GITHUB_EVENT_PATH = prev;
    rmSync(file, { force: true });
  }
});

// Sets env vars for the duration of fn, restoring the previous values after.
async function withEnv(vars, fn) {
  const prev = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// Replaces global fetch with a stub that records calls and answers from `respond`.
async function withFetch(respond, fn) {
  const calls = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const { status = 200, json } = respond(url, init);
    return new Response(JSON.stringify(json ?? {}), { status });
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = prev;
  }
}

const OAUTH_ENV = {
  ZENDESK_SUBDOMAIN: 'swimtopia',
  ZENDESK_CLIENT_ID: 'client-id',
  ZENDESK_CLIENT_SECRET: 'client-secret',
};

test('mintAccessToken requests a client_credentials token with Help Center scopes only', async () => {
  await withEnv(OAUTH_ENV, () =>
    withFetch(
      () => ({ json: { access_token: 'tok-123', expires_in: 1800 } }),
      async (calls) => {
        assert.equal(await mintAccessToken(), 'tok-123');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'https://swimtopia.zendesk.com/oauth/tokens');
        assert.equal(calls[0].init.method, 'POST');
        assert.deepEqual(JSON.parse(calls[0].init.body), {
          grant_type: 'client_credentials',
          client_id: 'client-id',
          client_secret: 'client-secret',
          scope: 'hc:read hc:write',
        });
      },
    ),
  );
});

test('mintAccessToken throws with the status when Zendesk rejects the credentials', async () => {
  await withEnv(OAUTH_ENV, () =>
    withFetch(
      () => ({ status: 401, json: { error: 'invalid_client' } }),
      async () => {
        await assert.rejects(mintAccessToken(), /Zendesk token request failed: 401.*invalid_client/);
      },
    ),
  );
});

test('mintAccessToken throws when the response has no access_token', async () => {
  await withEnv(OAUTH_ENV, () =>
    withFetch(
      () => ({ json: {} }),
      async () => {
        await assert.rejects(mintAccessToken(), /no access_token/);
      },
    ),
  );
});

test('mintAccessToken requires the client credentials', async () => {
  await withEnv({ ...OAUTH_ENV, ZENDESK_CLIENT_SECRET: undefined }, async () => {
    await assert.rejects(mintAccessToken(), /missing required env var: ZENDESK_CLIENT_SECRET/);
  });
});

test('main mints one token and sends it as a Bearer token on the GET and PUT', async () => {
  const file = join(tmpdir(), `evt-main-${process.pid}.json`);
  writeFileSync(file, JSON.stringify({
    release: { tag_name: 'v99.0.0', body: '- new thing', published_at: '2026-11-26T12:00:00Z' },
  }));
  const log = console.log;
  console.log = () => {};
  try {
    await withEnv({ ...OAUTH_ENV, GITHUB_EVENT_PATH: file, DRY_RUN: undefined }, () =>
      withFetch(
        (url, init) => {
          if (url.endsWith('/oauth/tokens')) return { json: { access_token: 'tok-abc' } };
          if (init.method === 'PUT') return { json: {} };
          return { json: { translation: { body: '<p>Intro</p><hr><h2>Version 1.0.0</h2>' } } };
        },
        async (calls) => {
          await main();
          assert.deepEqual(
            calls.map((c) => c.init.method ?? 'GET'),
            ['POST', 'GET', 'PUT'],
          );
          for (const c of calls.slice(1)) {
            assert.equal(c.init.headers.Authorization, 'Bearer tok-abc');
          }
        },
      ),
    );
  } finally {
    console.log = log;
    rmSync(file, { force: true });
  }
});

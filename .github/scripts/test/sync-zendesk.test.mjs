import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRelease } from '../sync-zendesk.mjs';

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

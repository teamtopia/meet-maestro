import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersion, formatReleaseDate, renderNotesToList, buildVersionSection, alreadyContainsVersion, insertSection } from '../lib/format.mjs';

test('parseVersion strips leading v', () => {
  assert.equal(parseVersion('v12.1.0'), '12.1.0');
});

test('parseVersion accepts no leading v', () => {
  assert.equal(parseVersion('12.0.0'), '12.0.0');
});

test('parseVersion throws on bad format', () => {
  assert.throws(() => parseVersion('latest'), /unexpected tag format/);
});

test('formatReleaseDate renders Chicago time with CDT in summer', () => {
  assert.equal(formatReleaseDate('2026-06-22T19:02:47Z'), 'June 22, 2026 2:02pm CDT');
});

test('formatReleaseDate renders Chicago time with CST in winter', () => {
  assert.equal(formatReleaseDate('2026-01-15T20:30:00Z'), 'January 15, 2026 2:30pm CST');
});

test('formatReleaseDate throws on invalid date', () => {
  assert.throws(() => formatReleaseDate('not-a-date'), /invalid date/);
});

test('renderNotesToList converts a markdown bullet list to one <ul>', () => {
  const md = '- First change\n- Second change';
  assert.equal(
    renderNotesToList(md),
    '<ul><li>First change</li><li>Second change</li></ul>',
  );
});

test('renderNotesToList wraps a plain sentence as a single list item', () => {
  assert.equal(
    renderNotesToList('Major version bump forcing a breaking change update'),
    '<ul><li>Major version bump forcing a breaking change update</li></ul>',
  );
});

test('renderNotesToList preserves inline links and bold', () => {
  const out = renderNotesToList('- Fixed [the report](https://x.test) and **labels**');
  assert.equal(
    out,
    '<ul><li>Fixed <a href="https://x.test">the report</a> and <strong>labels</strong></li></ul>',
  );
});

test('renderNotesToList keeps bullets when notes have an intro line', () => {
  assert.equal(renderNotesToList('Heads up:\n\n- A\n- B'),
    '<ul><li>Heads up:</li><li>A</li><li>B</li></ul>');
});

test('renderNotesToList keeps bullets when notes have a closing line', () => {
  assert.equal(renderNotesToList('- A\n- B\n\nMore info'),
    '<ul><li>A</li><li>B</li><li>More info</li></ul>');
});

test('renderNotesToList flattens a heading above bullets into plain items', () => {
  assert.equal(renderNotesToList("## What's new\n\n- A\n- B"),
    '<ul><li>What&#39;s new</li><li>A</li><li>B</li></ul>');
});

test('renderNotesToList returns empty string for empty notes', () => {
  assert.equal(renderNotesToList(''), '');
  assert.equal(renderNotesToList('   '), '');
});

test('renderNotesToList escapes raw HTML in notes', () => {
  assert.equal(renderNotesToList('- a < b & c'),
    '<ul><li>a &lt; b &amp; c</li></ul>');
});

test('buildVersionSection matches the article format and has no leading <hr>', () => {
  const out = buildVersionSection('12.1.0', 'June 22, 2026 2:02pm CDT', '<ul><li>x</li></ul>');
  assert.ok(!out.startsWith('<hr'));
  assert.equal(
    out,
    '<p><span class="wysiwyg-font-size-large" style="color: #000099;"><strong>Version 12.1.0 </strong>(Desktop and Web)</span><br><span class="wysiwyg-font-size-medium">June 22, 2026 2:02pm CDT</span></p>'
      + '<p><a href="https://swimtopia.com/downloads/maestro/latest" target="_blank" rel="noopener noreferrer"><span class="wysiwyg-font-size-medium">Download Latest Desktop Installer</span></a></p>'
      + '<ul><li>x</li></ul>',
  );
});

test('alreadyContainsVersion detects an existing version heading', () => {
  const body = '<p>intro</p><hr><p><strong>Version 12.1.0 </strong>(Desktop and Web)</p>';
  assert.equal(alreadyContainsVersion(body, '12.1.0'), true);
  assert.equal(alreadyContainsVersion(body, '12.2.0'), false);
});

test('insertSection inserts after the first <hr>, before the latest version', () => {
  const body = '<p>intro</p><hr><p>Version 12.1.0</p>';
  const result = insertSection(body, '<p>NEW</p>');
  assert.equal(result, '<p>intro</p><hr><p>NEW</p><hr><p>Version 12.1.0</p>');
});

test('insertSection throws when there is no <hr>', () => {
  assert.throws(() => insertSection('<p>no rule here</p>', '<p>NEW</p>'), /no <hr>/);
});

// Fix 1 tests
// INTENT: nested bullets become separate flat list items, not literal "- child" text
test('renderNotesToList flattens nested bullet lists into separate items', () => {
  const out = renderNotesToList('- parent\n  - child1\n  - child2');
  assert.equal(out, '<ul><li>parent</li><li>child1</li><li>child2</li></ul>');
});
// INTENT: blockquote content is surfaced, not dropped
test('renderNotesToList surfaces blockquote content', () => {
  const out = renderNotesToList('> Heads up: big change\n\n- A');
  assert.ok(out.includes('Heads up: big change'), out);
  assert.ok(out.includes('<li>A</li>'), out);
});
// INTENT: fenced code content is surfaced, not dropped
test('renderNotesToList surfaces code-block content', () => {
  const out = renderNotesToList('```\nnpm ci\n```\n\n- A');
  assert.ok(out.includes('npm ci'), out);
  assert.ok(out.includes('<li>A</li>'), out);
});

// Fix 2 test
test('insertSection matches an <hr> with attributes', () => {
  const body = '<p>intro</p><hr class="sep" style="x">  <p>Version 1.0.0</p>';
  const result = insertSection(body, '<p>NEW</p>');
  assert.ok(result.includes('<hr class="sep" style="x"><p>NEW</p><hr>'), result);
});

// Fix 3 test
test('buildVersionSection output is detected by alreadyContainsVersion (idempotency contract)', () => {
  const section = buildVersionSection('12.3.4', 'June 1, 2026 9:00am CDT', '<ul><li>x</li></ul>');
  assert.equal(alreadyContainsVersion(section, '12.3.4'), true);
});

import { composeUpdate } from '../lib/format.mjs';

const FIXTURE_BODY =
  '<p>This document describes the changes in each released version of Meet Maestro.</p>'
  + '<hr>'
  + '<p><span class="wysiwyg-font-size-large" style="color: #000099;"><strong>Version 12.1.0 </strong>(Desktop and Web)</span></p>'
  + '<ul><li>old</li></ul>';

test('composeUpdate prepends a new version after the intro <hr>', () => {
  const result = composeUpdate(FIXTURE_BODY, {
    tag: 'v12.2.0',
    notes: '- Shiny new thing',
    publishedAt: '2026-06-23T18:00:00Z',
  });
  assert.equal(result.skipped, false);
  assert.equal(result.version, '12.2.0');
  // New section sits between the intro <hr> and the previously-latest version.
  const introHr = result.body.indexOf('<hr>');
  const newIdx = result.body.indexOf('Version 12.2.0 </strong>');
  const oldIdx = result.body.indexOf('Version 12.1.0 </strong>');
  assert.ok(introHr < newIdx && newIdx < oldIdx);
  assert.ok(result.body.includes('<li>Shiny new thing</li>'));
  assert.ok(result.body.includes('June 23, 2026 1:00pm CDT'));
});

test('composeUpdate skips when the version is already present', () => {
  const result = composeUpdate(FIXTURE_BODY, {
    tag: 'v12.1.0',
    notes: '- anything',
    publishedAt: '2026-06-23T18:00:00Z',
  });
  assert.deepEqual(result, { skipped: true, version: '12.1.0' });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPlatformFromUrl,
  parseSearchQuery,
  formatDuration,
  sanitizeTrackMetadata,
  paginateResults,
} from './musicLogic';

test('detectPlatformFromUrl detects supported platforms correctly', () => {
  assert.equal(detectPlatformFromUrl('https://music.yandex.ru/album/123/track/456'), 'yandex');
  assert.equal(detectPlatformFromUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'), 'spotify');
  assert.equal(detectPlatformFromUrl('https://music.apple.com/us/album/song/123456'), 'apple');
  assert.equal(detectPlatformFromUrl('https://soundcloud.com/artist/track-name'), 'soundcloud');
  assert.equal(detectPlatformFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
  assert.equal(detectPlatformFromUrl('https://youtu.be/dQw4w9WgXcQ'), 'youtube');
  assert.equal(detectPlatformFromUrl('https://example.com/other'), null);
  assert.equal(detectPlatformFromUrl(''), null);
});

test('parseSearchQuery parses "title - artist" and plain queries', () => {
  const result1 = parseSearchQuery('Bohemian Rhapsody - Queen');
  assert.equal(result1.title, 'Bohemian Rhapsody');
  assert.equal(result1.artist, 'Queen');
  assert.equal(result1.cleanQuery, 'Bohemian Rhapsody Queen');

  const result2 = parseSearchQuery('Кино Группа крови');
  assert.equal(result2.title, 'Кино Группа крови');
  assert.equal(result2.artist, '');
  assert.equal(result2.cleanQuery, 'Кино Группа крови');
});

test('formatDuration formats seconds to mm:ss', () => {
  assert.equal(formatDuration(0), '0:30');
  assert.equal(formatDuration(65), '1:05');
  assert.equal(formatDuration(180), '3:00');
  assert.equal(formatDuration(359), '5:59');
});

test('sanitizeTrackMetadata produces clean labels for buttons', () => {
  const meta = sanitizeTrackMetadata('Very Long Track Title That Needs Truncating', 'Very Long Artist Name', 10, 10);
  assert.equal(meta.title, 'Very Long Track Title That Needs Truncating');
  assert.ok(meta.label.includes('Very Long …'));
});

test('paginateResults slices items and sets correct page boundaries', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const p0 = paginateResults(items, 0, 5);
  assert.equal(p0.items.length, 5);
  assert.deepEqual(p0.items, [1, 2, 3, 4, 5]);
  assert.equal(p0.page, 0);
  assert.equal(p0.totalPages, 3);
  assert.equal(p0.hasPrev, false);
  assert.equal(p0.hasNext, true);

  const p1 = paginateResults(items, 1, 5);
  assert.deepEqual(p1.items, [6, 7, 8, 9, 10]);
  assert.equal(p1.hasPrev, true);
  assert.equal(p1.hasNext, true);

  const p2 = paginateResults(items, 2, 5);
  assert.deepEqual(p2.items, [11, 12]);
  assert.equal(p2.hasNext, false);
});

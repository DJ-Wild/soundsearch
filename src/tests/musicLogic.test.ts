import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, detectPlatformFromUrl } from '../utils/musicLogic.js';
import { getThumbnailForTrackUrl, initDb, db_add_history, db_get_history } from '../server/db.js';

test('formatDuration should return 0:00 for 0 and format full track lengths accurately', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(undefined), '0:00');
  assert.equal(formatDuration(-1), '0:00');
  assert.equal(formatDuration(30), '0:30');
  assert.equal(formatDuration(161), '2:41');
  assert.equal(formatDuration(180), '3:00');
  assert.equal(formatDuration(215), '3:35');
  assert.equal(formatDuration(1721), '28:41');
});

test('getThumbnailForTrackUrl should extract YouTube video thumbnail', () => {
  const thumb = getThumbnailForTrackUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(thumb, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');

  const shortThumb = getThumbnailForTrackUrl('https://youtu.be/dQw4w9WgXcQ');
  assert.equal(shortThumb, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
});

test('db_add_history and db_get_history with artwork and playback', () => {
  initDb();
  const testUserId = 999999;
  const ok = db_add_history(
    testUserId,
    'Дорадура',
    'дора',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'youtube',
    'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    130
  );
  assert.equal(ok, true);

  const hist = db_get_history(testUserId, 5);
  assert.ok(hist.length > 0);
  assert.equal(hist[0].title, 'Дорадура');
  assert.equal(hist[0].artist, 'дора');
  assert.equal(hist[0].thumbnail, 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  assert.equal(hist[0].duration, 130);
});

test('detectPlatformFromUrl should identify platform for music links', () => {
  assert.equal(detectPlatformFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'youtube');
  assert.equal(detectPlatformFromUrl('https://soundcloud.com/artist/track'), 'soundcloud');
  assert.equal(detectPlatformFromUrl('https://music.yandex.ru/track/123'), 'yandex');
  assert.equal(detectPlatformFromUrl('https://open.spotify.com/track/123'), 'spotify');
  assert.equal(detectPlatformFromUrl('https://music.apple.com/us/album/title/123'), 'apple');
});

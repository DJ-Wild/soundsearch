import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalSourceUrl,
  soundcloudPresetKbps,
  formatQuality,
  bestQuality,
  readPlayerResponse,
} from '../server/audioQuality';
import { extractYandexId, toTrack, toSourceQuality } from '../server/yandexMusic';

test('canonicalSourceUrl properly validates YouTube and SoundCloud URLs', () => {
  // YouTube valid
  assert.equal(
    canonicalSourceUrl('youtube', 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ'),
    'https://www.youtube.com/watch?v=fJ9rUzIMcZQ'
  );
  assert.equal(
    canonicalSourceUrl('youtube', 'https://youtu.be/fJ9rUzIMcZQ'),
    'https://www.youtube.com/watch?v=fJ9rUzIMcZQ'
  );

  // SoundCloud valid
  assert.equal(
    canonicalSourceUrl('soundcloud', 'https://soundcloud.com/theweeknd/blinding-lights'),
    'https://soundcloud.com/theweeknd/blinding-lights'
  );

  // Reject malicious / non-whitelisted
  assert.equal(canonicalSourceUrl('youtube', 'http://insecure.com'), null);
  assert.equal(canonicalSourceUrl('youtube', 'https://evil.com/watch?v=fJ9rUzIMcZQ'), null);
  assert.equal(canonicalSourceUrl('soundcloud', 'https://soundcloud.com/search?q=test'), null);
});

test('soundcloudPresetKbps parses bitrates from presets', () => {
  assert.equal(soundcloudPresetKbps('aac_160k'), 160);
  assert.equal(soundcloudPresetKbps('mp3_128k'), 128);
  assert.equal(soundcloudPresetKbps('opus_64k'), 64);
  assert.equal(soundcloudPresetKbps('unknown_format'), undefined);
});

test('formatQuality and bestQuality extract audio codec and bitrate', () => {
  const format = {
    acodec: 'opus',
    vcodec: 'none',
    abr: 160,
  };
  const q = formatQuality(format);
  assert.ok(q);
  assert.equal(q.status, 'ok');
  assert.equal(q.codec, 'Opus');
  assert.equal(q.bitrateKbps, 160);

  const best = bestQuality([
    { acodec: 'mp4a.40.2', vcodec: 'none', abr: 128 },
    { acodec: 'opus', vcodec: 'none', abr: 160 },
  ]);
  assert.ok(best);
  assert.equal(best.codec, 'Opus');
  assert.equal(best.bitrateKbps, 160);
});

test('extractYandexId extracts numeric track id from Yandex Music links', () => {
  assert.equal(extractYandexId('https://music.yandex.ru/track/142987421'), '142987421');
  assert.equal(extractYandexId('https://music.yandex.ru/album/38247943/track/142987421'), '142987421');
  assert.equal(extractYandexId('https://evil.com/track/142987421'), null);
});

test('toSourceQuality parses Yandex download-info options', () => {
  const mockInfo = {
    result: [
      { codec: 'mp3', bitrateInKbps: 192, preview: false },
      { codec: 'mp3', bitrateInKbps: 320, preview: false },
    ],
  };
  const q = toSourceQuality(mockInfo);
  assert.equal(q.status, 'ok');
  assert.equal(q.codec, 'MP3');
  assert.equal(q.bitrateKbps, 320);
});
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initDb,
  db_add_favorite,
  db_get_favorites,
  db_remove_favorite,
  db_add_history,
  db_get_history,
  db_remove_history,
  db_clear_history,
} from './db';

test('db operations for favorites and history', () => {
  initDb();
  const testUserId = 999999;

  // Clean any previous test data
  db_clear_history(testUserId);
  const existingFavs = db_get_favorites(testUserId);
  for (const f of existingFavs) {
    db_remove_favorite(f.id, testUserId);
  }

  // 1. Add favorite
  const addedFav = db_add_favorite(
    testUserId,
    'Bohemian Rhapsody',
    'Queen',
    'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
    'youtube'
  );
  assert.equal(addedFav, true);

  // 2. Get favorites
  const favs = db_get_favorites(testUserId);
  assert.ok(favs.length >= 1);
  const myFav = favs.find((f) => f.title === 'Bohemian Rhapsody');
  assert.ok(myFav);
  assert.equal(myFav.artist, 'Queen');
  assert.equal(myFav.platform, 'youtube');

  // 3. Remove favorite
  if (myFav) {
    db_remove_favorite(myFav.id, testUserId);
    const afterFavs = db_get_favorites(testUserId);
    assert.equal(afterFavs.some((f) => f.id === myFav.id), false);
  }

  // 4. Add history
  db_add_history(
    testUserId,
    'Smells Like Teen Spirit',
    'Nirvana',
    'https://soundcloud.com/nirvana/smells-like-teen-spirit',
    'soundcloud'
  );

  const hist = db_get_history(testUserId);
  assert.ok(hist.length >= 1);
  const myHist = hist.find((h) => h.title === 'Smells Like Teen Spirit');
  assert.ok(myHist);
  assert.equal(myHist.artist, 'Nirvana');

  // 5. Remove history item
  if (myHist) {
    db_remove_history(myHist.id, testUserId);
    const afterHist = db_get_history(testUserId);
    assert.equal(afterHist.some((h) => h.id === myHist.id), false);
  }
});

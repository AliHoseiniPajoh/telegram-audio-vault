const assert = require('assert');
const crypto = require('crypto');
const { verifyTelegramWebAppData } = require('../src/auth/telegramAuth');
const { storage } = require('../src/db/storage');

console.log('🧪 Starting Telegram Audio Vault Automated Tests...\n');

// Test 1: Telegram initData cryptographic validation
function runAuthTests() {
  console.log('--- Test 1: Telegram HMAC-SHA256 Signature Verification ---');
  const mockBotToken = '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
  const ownerUserId = 987654321;
  const now = Math.floor(Date.now() / 1000);

  // Helper to generate valid Telegram initData
  function createSignedInitData(userObj, authDate, token = mockBotToken) {
    const userStr = JSON.stringify(userObj);
    const params = {
      auth_date: String(authDate),
      query_id: 'AAHdF6IQAAAAAN0XohD72kO0',
      user: userStr
    };

    // Build data_check_string
    const sortedKeys = Object.keys(params).sort();
    const dataCheckString = sortedKeys.map((k) => `${k}=${params[k]}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const searchParams = new URLSearchParams(params);
    searchParams.set('hash', hash);
    return searchParams.toString();
  }

  // 1.1 Valid signature from owner
  const validData = createSignedInitData({ id: ownerUserId, first_name: 'Owner' }, now);
  const result1 = verifyTelegramWebAppData(validData, mockBotToken);
  assert.strictEqual(result1.valid, true, 'Valid initData should pass verification');
  assert.strictEqual(result1.user.id, ownerUserId, 'User ID should match');
  console.log('  ✔ Valid initData correctly verified with HMAC-SHA256');

  // 1.2 Tampered signature
  const tamperedData = validData.replace(/hash=[a-f0-9]+/, 'hash=deadbeef00112233445566778899aabbccddeeff');
  const result2 = verifyTelegramWebAppData(tamperedData, mockBotToken);
  assert.strictEqual(result2.valid, false, 'Tampered hash must fail verification');
  console.log('  ✔ Tampered hash was correctly rejected');

  // 1.3 Expired auth_date (> 24 hours)
  const expiredDate = now - 90000;
  const expiredData = createSignedInitData({ id: ownerUserId }, expiredDate);
  const result3 = verifyTelegramWebAppData(expiredData, mockBotToken, 86400);
  assert.strictEqual(result3.valid, false, 'Expired initData must fail verification');
  assert.ok(result3.reason.includes('expired'), 'Reason should indicate expiration');
  console.log('  ✔ Expired initData correctly rejected');
}

// Test 2: Storage CRUD Operations
function runStorageTests() {
  console.log('\n--- Test 2: Storage CRUD & Playlist Management ---');

  // 2.1 Add Track
  const track = storage.addTrack({
    fileId: 'test_file_id_123',
    fileUniqueId: `uniq_${Date.now()}`,
    title: 'Test Audio Track',
    performer: 'Test Artist',
    duration: 180,
    mimeType: 'audio/mpeg',
    fileSize: 3456789,
    type: 'audio'
  });
  assert.ok(track.id, 'Track must have an ID');
  console.log(`  ✔ Added track "${track.title}" (ID: ${track.id})`);

  // 2.2 Retrieve Track
  const retrieved = storage.getTrackById(track.id);
  assert.strictEqual(retrieved.title, 'Test Audio Track');
  console.log('  ✔ Retrieved track metadata matches');

  // 2.3 Search Tracks
  const searchResults = storage.getAllTracks('Test');
  assert.ok(searchResults.length > 0, 'Search should find the track');
  console.log(`  ✔ Search returned ${searchResults.length} matching track(s)`);

  // 2.4 Create Playlist
  const playlist = storage.createPlaylist('Study & Chill');
  assert.ok(playlist.id, 'Playlist must have an ID');
  assert.strictEqual(playlist.name, 'Study & Chill');
  console.log(`  ✔ Created playlist "${playlist.name}"`);

  // 2.5 Add Track to Playlist
  const updatedPl = storage.addTrackToPlaylist(playlist.id, track.id);
  assert.ok(updatedPl.trackIds.includes(track.id), 'Track ID should be in playlist');
  console.log('  ✔ Added track to playlist successfully');

  // 2.6 Delete Track (also cascades from playlist)
  const deleteResult = storage.deleteTrack(track.id);
  assert.strictEqual(deleteResult, true, 'Track deletion should return true');
  const plAfterDelete = storage.getPlaylistById(playlist.id);
  assert.strictEqual(plAfterDelete.tracks.length, 0, 'Deleted track should be removed from playlist');
  console.log('  ✔ Track deletion cascaded properly from playlists');

  // 2.7 Cleanup Playlist
  storage.deletePlaylist(playlist.id);
  console.log('  ✔ Cleaned up test playlist');
}

try {
  runAuthTests();
  runStorageTests();
  console.log('\n🎉 ALL AUTOMATED VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
} catch (err) {
  console.error('\n❌ Test Failure:', err);
  process.exit(1);
}

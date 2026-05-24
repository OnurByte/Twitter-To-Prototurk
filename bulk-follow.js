import AccountManager from './account-manager.js';

const accountManager = new AccountManager();

async function bulkFollow(targetUsername, delayMs = 1000, batchSize = 10) {
  console.log('🚀 Toplu Takip İşlemi Başlatılıyor...\n');
  
  if (!targetUsername) {
    console.error('❌ Geçersiz kullanıcı adı!');
    process.exit(1);
  }

  const results = await accountManager.bulkFollow(targetUsername, batchSize, delayMs);
  
  console.log('\n' + '─'.repeat(60));
  console.log('\n📊 ÖZET:');
  console.log(`✅ Başarılı: ${results.successCount}`);
  console.log(`❌ Başarısız: ${results.failCount}`);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Kullanım: bun run bulk-follow.js <USERNAME> [DELAY_MS] [BATCH_SIZE]');
  console.log('\nÖrnek:');
  console.log('  bun run bulk-follow.js muratyildirim');
  process.exit(1);
}

const targetUsername = args[0].replace('@', '');
const delayMs = args[1] ? parseInt(args[1]) : 1000;
const batchSize = args[2] ? parseInt(args[2]) : 10;

const startTime = Date.now();
bulkFollow(targetUsername, delayMs, batchSize).then(() => {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Toplam işlem süresi: ${totalTime}s`);
}).catch(error => {
  console.error('❌ Beklenmeyen hata:', error);
  process.exit(1);
});

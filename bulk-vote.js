import AccountManager from './account-manager.js';
import TwitterToPrototurk from './index.js';

const accountManager = new AccountManager();
const bot = new TwitterToPrototurk();

async function bulkVote(postUrl, optionId, delayMs = 1000, batchSize = 10) {
  console.log('🚀 Toplu Oy Verme İşlemi Başlatılıyor...\n');
  
  // URL'den post ID çıkar
  const postId = postUrl.match(/\/post\/([a-f0-9-]+)/i)?.[1];
  
  if (!postId) {
    console.error('❌ Geçersiz post URL\'si!');
    process.exit(1);
  }

  if (!optionId) {
    console.error('❌ Geçersiz seçenek ID\'si!');
    process.exit(1);
  }

  const activeAccounts = await accountManager.getActiveAccounts();
  console.log(`👥 ${activeAccounts.length} aktif hesapla oy verilecek...`);
  console.log(`📝 Post: ${postId}`);
  console.log(`🔘 Seçenek: ${optionId}\n`);
  
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < activeAccounts.length; i += batchSize) {
    const batch = activeAccounts.slice(i, i + batchSize);
    const promises = batch.map(async (acc) => {
      const res = await bot.voteOnPoll(acc, postId, optionId);
      if (res) {
        successCount++;
        process.stdout.write('✅');
      } else {
        failCount++;
        process.stdout.write('❌');
      }
    });

    await Promise.all(promises);
    
    if (i + batchSize < activeAccounts.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('\n📊 ÖZET:');
  console.log(`✅ Başarılı: ${successCount}`);
  console.log(`❌ Başarısız: ${failCount}`);
  console.log('✅ İşlem tamamlandı!');
}

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Kullanım: bun run bulk-vote.js <POST_URL> <OPTION_ID> [DELAY_MS] [BATCH_SIZE]');
  console.log('\nÖrnek:');
  console.log('  bun run bulk-vote.js https://dev.prototurk.com/yazar/post/id 1');
  process.exit(1);
}

const postUrl = args[0];
const optionId = args[1];
const delayMs = args[2] ? parseInt(args[2]) : 1000;
const batchSize = args[3] ? parseInt(args[3]) : 10;

const startTime = Date.now();
bulkVote(postUrl, optionId, delayMs, batchSize).then(() => {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Toplam işlem süresi: ${totalTime}s`);
}).catch(error => {
  console.error('❌ Beklenmeyen hata:', error);
  process.exit(1);
});

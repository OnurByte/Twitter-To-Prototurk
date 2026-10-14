import AccountManager from './account-manager.js';

const accountManager = new AccountManager();

async function bulkMessage(target, message, delayMs = 1000, batchSize = 10) {
  console.log('🚀 Toplu Mesaj Gönderme İşlemi Başlatılıyor...\n');
  
  const activeAccounts = await accountManager.getActiveAccounts();
  console.log(`👥 ${activeAccounts.length} aktif hesap kullanılacak.`);
  console.log(`🎯 Hedef: ${target}`);
  console.log(`💬 Mesaj: "${message}"\n`);
  
  let successCount = 0;
  let failCount = 0;

  // UUID kontrolü (ID mi yoksa username mi?)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target);

  for (let i = 0; i < activeAccounts.length; i += batchSize) {
    const batch = activeAccounts.slice(i, i + batchSize);
    const promises = batch.map(async (acc) => {
      let conversationId = target;
      
      try {
        // Eğer username ise konuşma ID'sini bul veya oluştur
        if (!isUuid) {
          conversationId = await accountManager.ensureConversation(target, acc);
        }

        if (conversationId) {
          const res = await accountManager.sendMessage(conversationId, message, acc);
          if (res.success) {
            successCount++;
            process.stdout.write('✅');
          } else {
            failCount++;
            process.stdout.write('❌');
          }
        }
      } catch (err) {
        failCount++;
        process.stdout.write('🚫');
        if (failCount <= 5) {
          console.error(`\n❌ ${acc.prototurkUsername || acc.twitterUsername} Hatası: ${err.message}`);
        }
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
  console.log('Kullanım: bun run bulk-message.js <USERNAME_OR_CONV_ID> <MESSAGE>');
  process.exit(1);
}

const target = args[0];
const message = args[1];

const startTime = Date.now();
bulkMessage(target, message).then(() => {
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n⏱️  Toplam işlem süresi: ${totalTime}s`);
}).catch(error => {
  console.error('❌ Beklenmeyen hata:', error);
  process.exit(1);
});

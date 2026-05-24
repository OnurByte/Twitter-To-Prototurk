#!/usr/bin/env node
import AccountManager from './account-manager.js';
import TwitterToPrototurk from './index.js';

async function autoSetup() {
  console.log('\n🚀 OTOMATİK KURULUM VE BAŞLATMA\n');
  console.log('Bu script:');
  console.log('1. Popüler hesapları kontrol eder');
  console.log('2. Politik olmayanları seçer');
  console.log('3. Prototurk hesapları oluşturur');
  console.log('4. Profilleri ayarlar');
  console.log('5. Tweet çekmeye başlar\n');
  
  const accountManager = new AccountManager();
  const bot = new TwitterToPrototurk();
  
  // Kaç hesap eklensin?
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (query) => new Promise((resolve) => rl.question(query, resolve));
  
  const countStr = await question('Kaç hesap eklemek istersiniz? (1-10): ');
  const count = parseInt(countStr) || 3;
  
  console.log(`\n📊 ${count} hesap eklenecek...\n`);
  
  // Popüler hesaplardan rastgele seç
  const { getRandomAccounts } = await import('./popular-accounts.js');
  const selectedAccounts = getRandomAccounts(count * 2); // Fazladan al, politik olanlar için
  
  let successCount = 0;
  let addedAccounts = [];
  
  for (const username of selectedAccounts) {
    if (successCount >= count) break;
    
    try {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`📝 ${successCount + 1}/${count}: @${username}`);
      console.log('='.repeat(60));
      
      // Hesabı ekle (politik kontrolü dahil)
      const result = await accountManager.addTwitterAccount(username, true);
      
      if (result && result.error === 'RATE_LIMITED') {
        console.log(`\n⏳ [RATE LIMIT] Prototurk sınırı aşıldı! 60 saniye bekleniyor...\n`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        
        // Bir kez daha dene
        console.log(`🔄 Tekrar deneniyor: @${username}`);
        const retryResult = await accountManager.addTwitterAccount(username, true);
        
        if (retryResult && !retryResult.error && retryResult.prototurkSession) {
          addedAccounts.push(retryResult);
          successCount++;
          console.log(`✅ ${username} başarıyla eklendi (retry)!`);
        } else {
          console.log(`⚠️  ${username} retry başarısız, sonrakine geçiliyor...`);
        }
      } else if (result && result.prototurkSession) {
        addedAccounts.push(result);
        successCount++;
        console.log(`✅ ${username} başarıyla eklendi ve hazır!`);
      } else {
        console.log(`⚠️  ${username} eklenemedi, sonrakine geçiliyor...`);
      }
      
      // Kayıtlar arası güvenli bekleme süresi (10 saniye)
      console.log(`⏳ Sonraki işlem için 10 saniye bekleniyor...`);
      await new Promise(resolve => setTimeout(resolve, 10000));
      
    } catch (error) {
      console.error(`❌ ${username} hatası:`, error.message);
    }
  }
  
  rl.close();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ KURULUM TAMAMLANDI!`);
  console.log('='.repeat(60));
  console.log(`\n📊 Toplam ${successCount} hesap eklendi:\n`);
  
  addedAccounts.forEach((acc, idx) => {
    console.log(`${idx + 1}. @${acc.twitterUsername}`);
    console.log(`   Email: ${acc.email}`);
    console.log(`   Şifre: ${acc.password}\n`);
  });
  
  if (successCount === 0) {
    console.log('❌ Hiç hesap eklenemedi!');
    process.exit(1);
  }
  
  // Şimdi tweet çekmeye başla
  console.log('\n🚀 Tweet çekme başlıyor...\n');
  
  await bot.processNewTweets();
  
  console.log('\n✅ İlk tweet çekme tamamlandı!');
  console.log('\n📝 Sürekli çalıştırmak için: bun start');
  console.log('📝 Hesapları görmek için: bun run accounts\n');
  
  process.exit(0);
}

autoSetup().catch(console.error);

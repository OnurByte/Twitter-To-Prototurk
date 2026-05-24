import AccountManager from './account-manager.js';
import fs from 'fs';

async function fixMissingAccounts() {
  console.log('🔧 Eksik Hesapları Düzeltme Scripti\n');
  
  const accountManager = new AccountManager();
  const accounts = await accountManager.loadAccounts();
  
  // Session/CSRF eksik hesapları bul
  const missingAccounts = accounts.filter(acc => 
    !acc.prototurkSession || !acc.prototurkCsrf
  );
  
  if (missingAccounts.length === 0) {
    console.log('✅ Tüm hesapların session bilgileri mevcut!');
    return;
  }
  
  console.log(`📊 ${missingAccounts.length} hesap için Prototurk hesabı oluşturulacak:\n`);
  missingAccounts.forEach((acc, idx) => {
    console.log(`${idx + 1}. ${acc.twitterUsername} (${acc.email})`);
  });
  
  console.log('\n🔄 İşlem başlıyor...\n');
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < missingAccounts.length; i++) {
    const account = missingAccounts[i];
    console.log(`\n[${i + 1}/${missingAccounts.length}] ${account.twitterUsername}`);
    
    try {
      // Prototurk hesabı oluştur
      const result = await accountManager.registerPrototurkAccount(
        account.twitterUsername,
        account.email,
        account.password
      );
      
      if (result.success) {
        // accounts.json'u güncelle
        const allAccounts = await accountManager.loadAccounts();
        const accountIndex = allAccounts.findIndex(a => a.twitterUsername === account.twitterUsername);
        
        if (accountIndex !== -1) {
          allAccounts[accountIndex].prototurkUsername = account.twitterUsername;
          allAccounts[accountIndex].prototurkSession = result.session;
          allAccounts[accountIndex].prototurkCsrf = result.csrf;
          
          await accountManager.saveAccounts(allAccounts);
          
          console.log(`✅ ${account.twitterUsername} hesabı oluşturuldu ve kaydedildi`);
          successCount++;
          
          // Profil bilgilerini güncelle (opsiyonel)
          try {
            await accountManager.setupPrototurkProfile(
              account.twitterUsername,
              result.session,
              result.csrf
            );
            console.log(`🎨 Profil bilgileri güncellendi`);
          } catch (profileError) {
            console.log(`⚠️  Profil güncellenemedi (devam ediliyor)`);
          }
        }
      } else {
        console.log(`❌ ${account.twitterUsername} hesabı oluşturulamadı`);
        failCount++;
      }
      
      // Rate limiting için bekleme
      if (i < missingAccounts.length - 1) {
        console.log('⏳ 3 saniye bekleniyor...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
    } catch (error) {
      console.error(`❌ Hata: ${error.message}`);
      failCount++;
    }
  }
  
  console.log('\n' + '─'.repeat(60));
  console.log('\n📊 ÖZET:');
  console.log(`✅ Başarılı: ${successCount}`);
  console.log(`❌ Başarısız: ${failCount}`);
  console.log(`📈 Toplam: ${missingAccounts.length}`);
  console.log(`🎯 Başarı Oranı: ${((successCount / missingAccounts.length) * 100).toFixed(1)}%`);
  
  console.log('\n✅ İşlem tamamlandı!');
}

fixMissingAccounts().catch(console.error);

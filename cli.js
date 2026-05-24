#!/usr/bin/env node
import AccountManager from './account-manager.js';
import { popularAccounts, allAccounts, getRandomAccounts } from './popular-accounts.js';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  const accountManager = new AccountManager();
  
  console.log('\n🚀 Twitter -> Prototurk Hesap Yönetimi\n');
  console.log('1. Yeni Twitter hesabı ekle (manuel)');
  console.log('2. Popüler hesaplardan ekle');
  console.log('3. Toplu hesap ekle (kategori bazında)');
  console.log('4. ⚡ Multi hesap ekle (paralel) - YENİ!');
  console.log('5. Rastgele 10 popüler hesap ekle');
  console.log('6. TÜM HESAPLARI EKLE (tüm kategoriler)');
  console.log('7. Hesapları listele');
  console.log('8. Hesap durumunu değiştir (aktif/pasif)');
  console.log('9. 🚀 Bir kullanıcıyı toplu takip et');
  console.log('10. Çıkış\n');
  
  const choice = await question('Seçiminiz: ');
  
  switch (choice.trim()) {
    case '1':
      const username = await question('Twitter kullanıcı adı: ');
      await accountManager.addTwitterAccount(username.trim(), true);
      break;
      
    case '2':
      console.log('\n📋 Popüler Hesap Kategorileri:\n');
      const categories = Object.keys(popularAccounts);
      categories.forEach((cat, idx) => {
        console.log(`${idx + 1}. ${cat} (${popularAccounts[cat].length} hesap)`);
      });
      
      const catChoice = await question('\nKategori numarası: ');
      const catIdx = parseInt(catChoice) - 1;
      
      if (catIdx >= 0 && catIdx < categories.length) {
        const category = categories[catIdx];
        const accounts = popularAccounts[category];
        
        console.log(`\n📋 ${category} kategorisindeki hesaplar:\n`);
        accounts.forEach((acc, idx) => {
          console.log(`${idx + 1}. @${acc}`);
        });
        
        const accChoice = await question('\nHesap numarası (0 = tümü): ');
        const accIdx = parseInt(accChoice) - 1;
        
        if (accChoice === '0') {
          console.log(`\n🔄 ${accounts.length} hesap ekleniyor...\n`);
          for (const acc of accounts) {
            await accountManager.addTwitterAccount(acc, true);
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        } else if (accIdx >= 0 && accIdx < accounts.length) {
          await accountManager.addTwitterAccount(accounts[accIdx], true);
        }
      }
      break;
      
    case '3':
      console.log('\n📋 Kategoriler:\n');
      Object.keys(popularAccounts).forEach((cat, idx) => {
        console.log(`${idx + 1}. ${cat}`);
      });
      
      const bulkCatChoice = await question('\nKategori numarası: ');
      const bulkCatIdx = parseInt(bulkCatChoice) - 1;
      const bulkCategories = Object.keys(popularAccounts);
      
      if (bulkCatIdx >= 0 && bulkCatIdx < bulkCategories.length) {
        const category = bulkCategories[bulkCatIdx];
        const accounts = popularAccounts[category];
        
        console.log(`\n🔄 ${category} kategorisinden ${accounts.length} hesap ekleniyor...\n`);
        
        for (const acc of accounts) {
          await accountManager.addTwitterAccount(acc, true);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
        
        console.log('\n✅ Tüm hesaplar eklendi!');
      }
      break;
      
    case '4':
      console.log('\n⚡ Multi Hesap Ekleme (Paralel)\n');
      console.log('1. Kategori seç');
      console.log('2. Rastgele hesaplar');
      console.log('3. Tüm hesaplar');
      
      const multiChoice = await question('\nSeçiminiz: ');
      let accountsToAdd = [];
      
      if (multiChoice === '1') {
        console.log('\n📋 Kategoriler:\n');
        Object.keys(popularAccounts).forEach((cat, idx) => {
          console.log(`${idx + 1}. ${cat} (${popularAccounts[cat].length} hesap)`);
        });
        
        const multiCatChoice = await question('\nKategori numarası: ');
        const multiCatIdx = parseInt(multiCatChoice) - 1;
        const multiCategories = Object.keys(popularAccounts);
        
        if (multiCatIdx >= 0 && multiCatIdx < multiCategories.length) {
          const category = multiCategories[multiCatIdx];
          accountsToAdd = popularAccounts[category];
        }
      } else if (multiChoice === '2') {
        const count = await question('Kaç hesap eklensin? (varsayılan: 10): ');
        const numAccounts = parseInt(count) || 10;
        accountsToAdd = getRandomAccounts(numAccounts);
      } else if (multiChoice === '3') {
        accountsToAdd = allAccounts;
        console.log(`\n⚠️  DİKKAT: ${allAccounts.length} hesap eklenecek!`);
        const confirmAll = await question('Devam etmek istiyor musunuz? (evet/hayir): ');
        if (confirmAll.toLowerCase() !== 'evet' && confirmAll.toLowerCase() !== 'e') {
          console.log('❌ İşlem iptal edildi.');
          break;
        }
      }
      
      if (accountsToAdd.length > 0) {
        const batchSize = await question(`Paralel işlem sayısı (varsayılan: 5): `);
        const batch = parseInt(batchSize) || 5;
        
        const delayMs = await question(`Batch'ler arası bekleme (ms, varsayılan: 2000): `);
        const delay = parseInt(delayMs) || 2000;
        
        await accountManager.addMultipleAccounts(accountsToAdd, true, batch, delay);
      }
      break;
      
    case '5':
      const randomAccounts = getRandomAccounts(10);
      console.log('\n🎲 Rastgele 10 hesap ekleniyor...\n');
      
      for (const acc of randomAccounts) {
        await accountManager.addTwitterAccount(acc, true);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
      console.log('\n✅ Rastgele hesaplar eklendi!');
      break;
      
    case '6':
      console.log('\n⚠️  DİKKAT: Tüm kategorilerdeki BÜTÜN hesaplar eklenecek!\n');
      console.log(`📊 Toplam ${allAccounts.length} hesap bulundu.\n`);
      
      const confirm = await question('Devam etmek istiyor musunuz? (evet/hayir): ');
      
      if (confirm.toLowerCase() === 'evet' || confirm.toLowerCase() === 'e') {
        console.log('\n🔄 Tüm hesaplar ekleniyor...\n');
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < allAccounts.length; i++) {
          const acc = allAccounts[i];
          console.log(`\n[${i + 1}/${allAccounts.length}] @${acc} ekleniyor...`);
          
          try {
            await accountManager.addTwitterAccount(acc, true);
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 10000));
          } catch (error) {
            console.error(`❌ Hata: ${error.message}`);
            errorCount++;
          }
        }
        
        console.log('\n✅ İşlem tamamlandı!');
        console.log(`📊 Başarılı: ${successCount}, Hatalı: ${errorCount}`);
      } else {
        console.log('❌ İşlem iptal edildi.');
      }
      break;
      
    case '7':
      const accounts = await accountManager.loadAccounts();
      console.log('\n📋 Kayıtlı Hesaplar:\n');
      accounts.forEach((acc, index) => {
        console.log(`${index + 1}. @${acc.twitterUsername}`);
        console.log(`   Prototurk: ${acc.prototurkUsername || 'Kayıtsız'}`);
        console.log(`   Email: ${acc.email || 'Yok'}`);
        console.log(`   Şifre: ${acc.password || 'Yok'}`);
        console.log(`   Politik: ${acc.isPolitical ? 'Evet' : 'Hayır'}`);
        console.log(`   Durum: ${acc.enabled ? 'Aktif' : 'Pasif'}`);
        console.log(`   Session: ${acc.prototurkSession ? 'Var' : 'Yok'}`);
        console.log(`   Oluşturma: ${acc.createdAt || 'Bilinmiyor'}\n`);
      });
      break;
      
    case '8':
      const loadedAccounts = await accountManager.loadAccounts();
      console.log('\n📋 Hesaplar:\n');
      loadedAccounts.forEach((acc, index) => {
        console.log(`${index + 1}. @${acc.twitterUsername} - ${acc.enabled ? 'Aktif' : 'Pasif'}`);
      });
      
      const accountIndex = await question('\nHesap numarası: ');
      const idx = parseInt(accountIndex) - 1;
      
      if (idx >= 0 && idx < loadedAccounts.length) {
        loadedAccounts[idx].enabled = !loadedAccounts[idx].enabled;
        await accountManager.saveAccounts(loadedAccounts);
        console.log(`✅ ${loadedAccounts[idx].twitterUsername} ${loadedAccounts[idx].enabled ? 'aktif' : 'pasif'} edildi`);
      }
      break;
      
    case '9':
      const target = await question('Takip edilecek kullanıcı adı: ');
      const { spawn } = await import('child_process');
      const bf = spawn('bun', ['run', 'bulk-follow.js', target], { stdio: 'inherit' });
      await new Promise(resolve => bf.on('close', resolve));
      break;
      
    case '10':
      console.log('👋 Çıkılıyor...');
      rl.close();
      return;
      
    default:
      console.log('❌ Geçersiz seçim');
  }
  
  rl.close();
}

main().catch(console.error);

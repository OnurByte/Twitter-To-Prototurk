import AccountManager from './account-manager.js';
import axios from 'axios';

const accountManager = new AccountManager();

async function checkSessions() {
  const accounts = await accountManager.getActiveAccounts();
  console.log(`🔍 ${accounts.length} hesap kontrol ediliyor...\n`);

  let validCount = 0;
  let invalidCount = 0;

  for (const acc of accounts) {
    try {
      await axios.get(
        `https://dev.prototurk.com/api/notifications`,
        {
          headers: {
            'Cookie': `pt_session=${acc.prototurkSession}; pt_csrf=${acc.prototurkCsrf}`,
            'x-csrf-token': acc.prototurkCsrf,
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0'
          },
          timeout: 5000
        }
      );
      validCount++;
      process.stdout.write('✅');
    } catch (error) {
      invalidCount++;
      process.stdout.write('❌');
      // console.log(`\n❌ ${acc.prototurkUsername}: ${error.response?.status}`);
    }
  }

  console.log('\n' + '─'.repeat(40));
  console.log(`✅ Geçerli: ${validCount}`);
  console.log(`❌ Geçersiz: ${invalidCount}`);
}

checkSessions();

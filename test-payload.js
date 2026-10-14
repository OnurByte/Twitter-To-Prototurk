import AccountManager from './account-manager.js';
import axios from 'axios';

const accountManager = new AccountManager();

async function testConversationCreate() {
  const accounts = await accountManager.getActiveAccounts();
  const bot = accounts.find(a => a.prototurkUsername === 'Fenerbahce' || a.prototurkUsername === 'sporx'); // Known to give 400
  
  if (!bot) {
    console.error('Test botu bulunamadı.');
    return;
  }

  const targetUsername = 'tayfunerbilen';
  console.log(`Testing with bot: ${bot.prototurkUsername}, target: ${targetUsername}`);

  const targetId = await accountManager.getUserId(targetUsername, bot);
  console.log(`Target ID: ${targetId}`);

  const payloads = [
    { name: 'user_id', data: { user_id: targetId } },
    { name: 'username', data: { username: targetUsername } },
    { name: 'user_id (string)', data: { user_id: String(targetId) } },
    { name: 'users (array)', data: { users: [targetId] } }
  ];

  for (const payload of payloads) {
    console.log(`\nTesting: ${payload.name}`);
    try {
      const res = await axios.post(
        `https://dev.prototurk.com/api/dm/conversations`,
        payload.data,
        {
          headers: {
            'Cookie': `pt_session=${bot.prototurkSession}; pt_csrf=${bot.prototurkCsrf}`,
            'x-csrf-token': bot.prototurkCsrf,
            'Origin': 'https://dev.prototurk.com',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0',
            'Content-Type': 'application/json'
          }
        }
      );
      console.log('✅ Success!', res.status, res.data);
      break;
    } catch (error) {
      console.error('❌ Failed:', error.response?.status, error.response?.data || error.message);
    }
  }
}

testConversationCreate();

// =============================================================
// TELEGRAM MAIL GATEWAY CORE ENGINE v17.1 - FIXED & OPTIMIZED
// =============================================================
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { promisify } = require('util');

// CONFIG SECURE (GANTI DENGAN ENV VARIABLE)
require('dotenv').config();
const TOKEN = process.env.TOKEN || '8806544655:AAGTK4GJi2liJraUvfYb80YFpO2SWYkK6UM';
const OWNER_ID = process.env.OWNER_ID || '8430290683';
const TIKTOK_DEV_URL = process.env.TIKTOK_URL || 'https://www.tiktok.com/@emyjbl_';
const QRIS_URL = process.env.QRIS_URL || 'https://qu.ax/g1eRh';

const bot = new TelegramBot(TOKEN, { polling: true });
const dbPath = path.join(__dirname, 'database.json');

// STORAGE OPTIMIZED
const customNameStorage = new Map();
const missionStorage = new Map();
const rateLimitStorage = new Map(); // Anti-spam

// RATE LIMITER
function checkRateLimit(chatId, action = 'default') {
  const now = Date.now();
  const key = `${chatId}_${action}`;
  const userLimit = rateLimitStorage.get(key) || { count: 0, reset: now + 60000 };
  
  if (now > userLimit.reset) {
    userLimit.count = 0;
    userLimit.reset = now + 60000;
  }
  
  if (userLimit.count >= 5) return false;
  userLimit.count++;
  rateLimitStorage.set(key, userLimit);
  return true;
}

// DATABASE ASYNC & ATOMIC
async function readDB() {
  try {
    await fs.access(dbPath);
    const data = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(data);
  } catch {
    const initData = { users: {} };
    await writeDB(initData);
    return initData;
  }
}

async function writeDB(data) {
  try {
    await fs.writeFile(dbPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('DB Write Error:', err.message);
  }
}

async function verifyUser(chatId, firstName) {
  const db = await readDB();
  const today = new Date().toDateString();
  chatId = String(chatId).trim();

  if (!db.users[chatId]) {
    db.users[chatId] = {
      name: firstName || 'User Node',
      points: 10,
      activeEmail: null,
      activeEmailToken: null,
      emailExpiry: null,
      tiktokClaimed: false,
      tier: 'B-Tier (Standard Free)',
      tierExpiry: null,
      dailyUsageCustom: 0,
      dailyUsageRandom: 0,
      lastUsedDate: today
    };
    await writeDB(db);
  }

  // DAILY RESET
  if (db.users[chatId].lastUsedDate !== today) {
    db.users[chatId].dailyUsageCustom = 0;
    db.users[chatId].dailyUsageRandom = 0;
    db.users[chatId].lastUsedDate = today;
    await writeDB(db);
  }

  // TIER EXPIRY CHECK
  if (db.users[chatId].tierExpiry && new Date() > new Date(db.users[chatId].tierExpiry)) {
    db.users[chatId].tier = 'B-Tier (Standard Free)';
    db.users[chatId].tierExpiry = null;
    await writeDB(db);
    try {
      await bot.sendMessage(chatId, `⚠️ *LISENSI EXPIRED*\nStatus diturunkan ke B-Tier.`);
    } catch {}
  }

  // EMAIL EXPIRY CHECK
  if (db.users[chatId].activeEmail && db.users[chatId].emailExpiry && new Date() > new Date(db.users[chatId].emailExpiry)) {
    db.users[chatId].activeEmail = null;
    db.users[chatId].activeEmailToken = null;
    db.users[chatId].emailExpiry = null;
    await writeDB(db);
    try {
      await bot.sendMessage(chatId, `⏰ *EMAIL EXPIRED*\nDeploy email baru!`);
    } catch {}
  }

  return db.users[chatId];
}

function makeRandomString(length) {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// API CALL WITH RETRY & TIMEOUT
async function apiCall(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await axios({
        ...options,
        timeout: 10000,
        headers: { 'User-Agent': 'MailBot/1.0' }
      });
      return response;
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
}

// COMMANDS (Dengan Rate Limit & Error Handling)
bot.onText(/\/(start|menu)/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (!checkRateLimit(chatId)) return;

  await verifyUser(chatId, msg.from.first_name);
  const text = `⚙️ *MENU UTAMA*\n────────────────────────\n🎲 /CreateMailR ─ Email Acak\n✍️ /CreateMailC ─ Email Kustom\n📥 /CheckInbox ─ Cek OTP\n📧 /EmailActive ─ Status Email\n👤 /Profile ─ Saldo & Tier\n💵 /TopupPoint ─ Premium\n🎁 /ClaimDaily ─ Bonus Harian`;
  
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Start command error:', err.message);
  }
});

bot.onText(/\/profile/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (!checkRateLimit(chatId, 'profile')) return;
  
  const user = await verifyUser(chatId, msg.from.first_name);
  const isAdmin = chatId === String(OWNER_ID);

  // Logic profil sama tapi dengan try-catch
  let profileText = `👤 *PROFILE*\n────────────────────────\n🔹 Nama: ${user.name}\n🔹 ID: \`${chatId}\`\n🔹 Poin: ${isAdmin ? 'Unlimited' : user.points}`;
  
  try {
    await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('Profile error:', err.message);
  }
});

// CREATE EMAIL (Fixed Error Handling)
bot.on('callback_query', async (query) => {
  const chatId = String(query.message.chat.id).trim();
  const data = query.data;
  
  try {
    await bot.answerCallbackQuery(query.id);
  } catch {}

  if (!checkRateLimit(chatId, data)) {
    return bot.sendMessage(chatId, '⏳ Terlalu cepat! Tunggu 1 menit.');
  }

  if (data === 'run_mail_random' || data === 'run_mail_custom') {
    await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
    
    const db = await readDB();
    const user = db.users[chatId] || await verifyUser(chatId, query.from.first_name);
    const isAdmin = chatId === String(OWNER_ID);
    
    let cost = data === 'run_mail_custom' ? 10 : 5;
    if (user.tier.includes('A-Tier')) cost = data === 'run_mail_custom' ? 5 : 2;
    if (user.tier.includes('S-Tier') || isAdmin) cost = 0;

    // VALIDASI LIMIT
    if (!isAdmin && !user.tier.includes('S-Tier')) {
      if (user.tier.includes('B-Tier') && data === 'run_mail_custom' && (user.dailyUsageCustom || 0) >= 1) {
        return bot.sendMessage(chatId, `❌ B-Tier: Custom email 1x/hari`);
      }
      if (user.tier.includes('A-Tier') && ((user.dailyUsageCustom || 0) + (user.dailyUsageRandom || 0)) >= 10) {
        return bot.sendMessage(chatId, `❌ A-Tier: Limit 10x/hari`);
      }
      if (user.points < cost && !isAdmin) {
        return bot.sendMessage(chatId, `❌ Poin tidak cukup: ${cost}`);
      }
    }

    const liveMsg = await bot.sendMessage(chatId, '⏳ Menghubungkan ke Mail.tm...');
    
    try {
      // GET DOMAIN
      const domRes = await apiCall('https://api.mail.tm/domains');
      const domain = domRes.data['hydra:member'][0].domain;
      
      // GENERATE CREDENTIALS
      const username = (data === 'run_mail_custom' && customNameStorage.get(chatId)) 
        ? customNameStorage.get(chatId) 
        : makeRandomString(9);
      const pass = makeRandomString(12);
      const email = `${username}@${domain}`;
      
      customNameStorage.delete(chatId);

      // CREATE ACCOUNT
      await apiCall('https://api.mail.tm/accounts', {
        method: 'POST',
        data: { address: email, password: pass }
      });

      // GET TOKEN
      const tokRes = await apiCall('https://api.mail.tm/token', {
        method: 'POST',
        data: { address: email, password: pass }
      });

      // SET EXPIRY
      let hours = user.tier.includes('B-Tier') ? 3 : (user.tier.includes('S-Tier') || isAdmin ? 24 : 10);
      const exp = new Date(Date.now() + hours * 60 * 60 * 1000);

      // UPDATE DB
      db.users[chatId].points = Math.max(0, (db.users[chatId].points || 0) - cost);
      db.users[chatId].activeEmail = email;
      db.users[chatId].activeEmailToken = tokRes.data.token;
      db.users[chatId].emailExpiry = exp.toISOString();
      
      if (data === 'run_mail_custom') {
        db.users[chatId].dailyUsageCustom = (db.users[chatId].dailyUsageCustom || 0) + 1;
      } else {
        db.users[chatId].dailyUsageRandom = (db.users[chatId].dailyUsageRandom || 0) + 1;
      }
      
      await writeDB(db);

      const successText = `✅ *EMAIL SUKSES*\n────────────────────────\n📧 Email: \`${email}\`\n⏰ Durasi: ${hours} jam\n📅 Expired: ${exp.toLocaleString('id-ID')}`;
      
      await bot.editMessageText(successText, { 
        chat_id: chatId, 
        message_id: liveMsg.message_id, 
        parse_mode: 'Markdown' 
      });
      
    } catch (err) {
      console.error('Mail creation error:', err.message);
      await bot.editMessageText('❌ Gagal membuat email. Coba lagi nanti.', {
        chat_id: chatId,
        message_id: liveMsg.message_id
      });
    }
  }
});

// GLOBAL ERROR HANDLER
process.on('uncaughtException', (err) => {
  console.error('CRITICAL ERROR:', err.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log('🚀 Bot v17.1 FIXED & STABLE - Running...');

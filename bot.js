// =============================================================
// TELEGRAM MAIL GATEWAY CORE ENGINE v17.6 - MINIMALIST iOS UI
// =============================================================
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// CONFIG SECURE (.env file integration)
require('dotenv').config();
const TOKEN = process.env.TOKEN || '8829940673:AAHqA6_LjlON9DXqMfUTkZ68__MC1O8ZR2I';
const OWNER_ID = process.env.OWNER_ID || '8430290683';
const TIKTOK_DEV_URL = process.env.TIKTOK_URL || 'https://www.tiktok.com/@emyjbl_';
const QRIS_URL = process.env.QRIS_URL || 'https://qu.ax/g1eRh';
const SAWERIA_URL = process.env.SAWERIA_URL || 'https://saweria.co/emyber';
const CS_EMAIL = 'emy.system@yahoo.com';

const bot = new TelegramBot(TOKEN, { polling: true });
const dbPath = path.join(__dirname, 'database.json');

// STORAGE OPTIMIZED WITH MAPS
const customNameStorage = new Map();
const rateLimitStorage = new Map();

// REGISTER MENU BLUE COMMANDS INTERFACE
bot.setMyCommands([
  { command: 'start', description: 'Menampilkan menu utama bot' },
  { command: 'profile', description: 'Cek saldo poin, tier & status email' },
  { command: 'createmailr', description: 'Deploy email acak (Random)' },
  { command: 'createmailc', description: 'Deploy email kustom nama' },
  { command: 'checkinbox', description: 'Periksa kotak masuk / kode OTP' },
  { command: 'emailactive', description: 'Cek detail email aktif & sisa waktu' },
  { command: 'sendmail', description: 'Kirim email keluar (Developer Only)' },
  { command: 'topuppoint', description: 'Topup poin & upgrade tier premium' },
  { command: 'claimdaily', description: 'Klaim bonus 10 poin harian' },
  { command: 'aboutdev', description: 'Informasi Developer & Link Dukungan' }
]).catch((err) => console.error("Gagal melakukan set perintah menu:", err.message));

// ANTI-SPAM RATE LIMITER
function checkRateLimit(chatId, action = 'default') {
  const now = Date.now();
  const key = `${chatId}_${action}`;
  const userLimit = rateLimitStorage.get(key) || { count: 0, reset: now + 5000 }; 
  
  if (now > userLimit.reset) {
    userLimit.count = 0;
    userLimit.reset = now + 5000;
  }
  
  if (userLimit.count >= 3) return false;
  userLimit.count++;
  rateLimitStorage.set(key, userLimit);
  return true;
}

// DATABASE ASYNC & ATOMIC OPERATORS
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
    console.error('Database Write Exception:', err.message);
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
      tier: 'B-Tier (Standard Free)',
      tierExpiry: null,
      dailyUsageCustom: 0,
      dailyUsageRandom: 0,
      lastUsedDate: today,
      lastDailyClaim: null // Track anti-abuse daily bonus
    };
    await writeDB(db);
  }

  if (db.users[chatId].lastUsedDate !== today) {
    db.users[chatId].dailyUsageCustom = 0;
    db.users[chatId].dailyUsageRandom = 0;
    db.users[chatId].lastUsedDate = today;
    await writeDB(db);
  }

  if (db.users[chatId].tierExpiry && new Date() > new Date(db.users[chatId].tierExpiry)) {
    db.users[chatId].tier = 'B-Tier (Standard Free)';
    db.users[chatId].tierExpiry = null;
    await writeDB(db);
    try {
      await bot.sendMessage(chatId, `⚠️ *Subscription Expired*\nMasa langganan Premium Anda telah habis. Status Anda otomatis diturunkan kembali ke B-Tier (Free).`, { parse_mode: 'Markdown' });
    } catch {}
  }

  if (db.users[chatId].activeEmail && db.users[chatId].emailExpiry && new Date() > new Date(db.users[chatId].emailExpiry)) {
    db.users[chatId].activeEmail = null;
    db.users[chatId].activeEmailToken = null;
    db.users[chatId].emailExpiry = null;
    await writeDB(db);
    try {
      await bot.sendMessage(chatId, `⏰ *Email Temporary Expired*\nSesi email Anda telah melewati batas waktu masa aktif. Silakan deploy email baru!`, { parse_mode: 'Markdown' });
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

async function apiCall(url, options = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios({
        url,
        ...options,
        timeout: 12000,
        headers: { 'User-Agent': 'MailGatewayBot/2.0', ...options.headers }
      });
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
}

// -------------------------------------------------------------
// CORE BOT COMMAND HANDLERS (iOS / MAC MINIMALIST STYLE)
// -------------------------------------------------------------
bot.onText(/\/(start|menu)/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (!checkRateLimit(chatId)) return bot.sendMessage(chatId, "⏳ Jeda beberapa detik.");

  await verifyUser(chatId, msg.from.first_name);
  
  const text = `⚙️ *Dashboard Utama*

*Kendali Fitur Gateway*
🎲 /CreateMailR • Deploy Email Temp Acak
✍️ /CreateMailC • Deploy Email Temp Kustom
📥 /CheckInbox • Tarik Pesan Masuk / OTP
📧 /EmailActive • Cek Sisa Waktu Sesi Email
✉️ /SendMail • Kirim Email Keluar Anonim

*Sistem Akun & Keanggotaan*
👤 /Profile • Cek Saldo, Tier & Limit
💵 /TopupPoint • Isi Poin & Order Premium
📅 /ClaimDaily • Klaim Bonus Poin Harian
👨‍💻 /AboutDev • Info Dev & Link Dukungan

_Ketuk perintah berwarna biru untuk mengoperasikan bot._`;

  try { await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/profile/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (!checkRateLimit(chatId, 'profile')) return;

  const user = await verifyUser(chatId, msg.from.first_name);
  const isAdmin = chatId === String(OWNER_ID);

  let customLimitText = (user.dailyUsageCustom || 0) + ' / 1 Sesi Hari Ini';
  let randomLimitText = 'Unlimited';

  if (isAdmin || user.tier.includes('S-Tier')) {
    customLimitText = 'Unlimited';
    randomLimitText = 'Unlimited';
  } else if (user.tier.includes('A-Tier')) {
    const totalUsed = (user.dailyUsageCustom || 0) + (user.dailyUsageRandom || 0);
    customLimitText = `${totalUsed} / 10 Pembuatan`;
    randomLimitText = `${totalUsed} / 10 Pembuatan`;
  }

  const expInfo = user.tierExpiry ? `\n• *Expired Premium:* \`${new Date(user.tierExpiry).toLocaleDateString('id-ID')}\`` : '';
  let emailStatusText = 'Tidak ada sesi aktif';
  
  if (user.activeEmail && user.emailExpiry) {
    const diffMs = new Date(user.emailExpiry) - new Date();
    if (diffMs > 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      emailStatusText = `\`${user.activeEmail}\` (${diffHours}j ${diffMins}m lagi)`;
    }
  }

  const profileText = `👤 *Metadata Profil Anda*

• *Nama Pengguna:* ${user.name}
• *ID Telegram:* \`${chatId}\`
• *Saldo Poin:* *${isAdmin ? 'Bypass (Owner)' : `${user.points} Points`}*
• *Tier Lisensi:* \`${isAdmin ? 'S-Tier (Developer)' : user.tier}\`${expInfo}

📊 *Kuota Pembuatan Hari Ini*
• *Email Kustom:* \`${customLimitText}\`
• *Email Acak:* \`${randomLimitText}\`

📥 *Status Sesi Terpasang*
• *Email Aktif:* ${emailStatusText}`;

  try { await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/emailactive/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name);

  if (!user.activeEmail || !user.emailExpiry) {
    return bot.sendMessage(chatId, `❌ *Sesi Tidak Ditemukan*\n\nSaat ini Anda tidak memiliki sesi email temporary aktif.`, { parse_mode: 'Markdown' });
  }

  const diffMs = new Date(user.emailExpiry) - new Date();
  if (diffMs <= 0) {
    return bot.sendMessage(chatId, `❌ *Sesi Kedaluwarsa*\n\nSesi email temporary Anda baru saja berakhir.`, { parse_mode: 'Markdown' });
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);

  const activeText = `📧 *Detail Sesi Aktif*

• *Alamat Email:* \`${user.activeEmail}\`
• *Sisa Waktu:* \`${diffHours} Jam, ${diffMins} Menit, ${diffSecs} Detik\`
• *Waktu Hancur:* \`${new Date(user.emailExpiry).toLocaleTimeString('id-ID')} WIB\`

_Jalankan /checkinbox untuk menarik pesan masuk._`;

  try { await bot.sendMessage(chatId, activeText, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/topuppoint/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);
  
  const priceText = `💳 *Store & Topup Center*

👑 *[ B-Tier ] Standard Free*
• Harga: Rp0
• Sesi Email: 3 Jam
• Limit Custom: 1x / Hari

👑 *[ A-Tier ] Aero Custom Mail*
• Harga: *Rp11.000* (14 Hari)
• Sesi Email: 10 Jam
• Limit Buat: 10x / Hari
• Diskon Potongan Poin 50%

👑 *[ S-Tier ] Infinite Eclipse*
• Harga: *Rp15.000* (30 Hari)
• Sesi Email: 24 Jam Penuh
• Keuntungan: Unlimited & Bypass 0 Poin

📌 *Instruksi Pembayaran:*
1. Scan QRIS resmi Developer di atas.
2. Selesaikan transaksi sesuai nominal paket.
3. Kirim bukti resi transfer sukses Anda ke kontak Admin untuk aktivasi lisensi: [Hubungi Admin](tg://user?id=${OWNER_ID})`;
  
  try {
    await bot.sendPhoto(chatId, QRIS_URL, { caption: priceText, parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, priceText + `\n\n⚠️ _(Gagal memuat gambar QRIS, pastikan link QRIS_URL di env valid)_`, { parse_mode: 'Markdown' });
  }
});

// FIXED & LOCKED: ANTI-ABUSE DAILY CLAIM CHECKER
bot.onText(/\/claimdaily/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const db = await readDB();
  const user = await verifyUser(chatId, msg.from.first_name);
  
  const todayStr = new Date().toDateString(); // Mengambil string tanggal unik (contoh: "Sun May 17 2026")

  if (db.users[chatId].lastDailyClaim === todayStr) {
    return bot.sendMessage(chatId, `⏰ *Batas Klaim Tercapai*\n\nAnda sudah mengambil jatah bonus hari ini. Silakan kembali besok untuk mengklaim kembali bonus harian Anda.`, { parse_mode: 'Markdown' });
  }

  // Injeksi poin & amankan status tanggal
  db.users[chatId].points = (db.users[chatId].points || 0) + 10;
  db.users[chatId].lastDailyClaim = todayStr;
  await writeDB(db);

  await bot.sendMessage(chatId, `🎁 *Klaim Hadiah Sukses*\n\nSelamat! Dompet saldo Anda berhasil ditambahkan sebesar *+10 Poin* gratis harian.`, { parse_mode: 'Markdown' });
});

bot.onText(/\/aboutdev/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);

  const aboutText = `👨‍💻 *Developer Profile*

Sistem Mail Gateway ini dirancang dan dioperasikan secara mandiri untuk kebutuhan temporary deployment email.

• *Developer:* \`Emy\`
• *TikTok Official:* [emyjbl_](${TIKTOK_DEV_URL})
• *Kontak Developer:* [Hubungi Emy via Telegram](tg://user?id=${OWNER_ID})
• *Email CS Support:* \`${CS_EMAIL}\`

☕ *Donation & Support*
Jika bot ini dirasa bermanfaat, Anda bisa memberikan dukungan finansial suka rela untuk membantu pemeliharaan sewa server cloud:

• *Link Saweria:* [Saweria Donasi Resmi Emy](${SAWERIA_URL})

_Terima kasih atas apresiasi dan dukungan Anda._`;
  
  try {
    await bot.sendMessage(chatId, aboutText, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {}
});

bot.onText(/\/(createmailr|creater)/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name);
  const isAdmin = chatId === String(OWNER_ID);
  customNameStorage.delete(chatId);
  let cost = user.tier.includes('A-Tier') ? 2 : (user.tier.includes('S-Tier') || isAdmin ? 0 : 5);
  
  const inlineText = `🎲 *Deploy System Random*

• Jenis: \`Auto Generated Address\`
• Pemotongan: \`${cost} Poin\`

_Konfirmasi pembuatan dengan menekan tombol di bawah._`;

  try {
    await bot.sendMessage(chatId, inlineText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🚀 Deploy Random Email', callback_data: 'run_mail_random' }]] }
    });
  } catch (err) {}
});

bot.onText(/\/(createmailc|createc)(?:\s+(.+))?/i, async (msg, match) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name);
  const isAdmin = chatId === String(OWNER_ID);
  const requestedName = match[2] ? match[2].trim().toLowerCase().replace(/[^a-z0-9.]/g, '') : '';

  if (!requestedName) {
    return bot.sendMessage(chatId, `⚠️ *Format Salah*\n\nHarap masukkan nama kustom di belakang perintah.\n\nContoh: \`/CreateMailC emyber\``, { parse_mode: 'Markdown' });
  }

  customNameStorage.set(chatId, requestedName);
  let cost = user.tier.includes('A-Tier') ? 5 : (user.tier.includes('S-Tier') || isAdmin ? 0 : 10);
  
  const inlineText = `✍️ *Deploy System Custom*

• Pilihan Nama: \`${requestedName}\`
• Pemotongan: \`${cost} Poin\`

_Konfirmasi pembuatan dengan menekan tombol di bawah._`;

  try {
    await bot.sendMessage(chatId, inlineText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🚀 Deploy Custom Email', callback_data: 'run_mail_custom' }]] }
    });
  } catch (err) {}
});

bot.onText(/\/checkinbox/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name); 
  if (!user.activeEmailToken || !user.activeEmail) {
    return bot.sendMessage(chatId, `❌ *Sesi Kosong*\n\nSesi email Anda kosong atau sudah kedaluwarsa.`, { parse_mode: 'Markdown' });
  }
  
  await bot.sendChatAction(chatId, 'typing').catch(()=>{});
  try {
    const res = await apiCall('https://api.mail.tm/messages', { headers: { 'Authorization': `Bearer ${user.activeEmailToken}` } });
    const messages = res.data['hydra:member'];
    if (messages.length === 0) {
      return bot.sendMessage(chatId, `📭 *Inbox Kosong*\n\nBelum ada data pesan masuk di \`${user.activeEmail}\`.`, { parse_mode: 'Markdown' });
    }
    const details = await apiCall(`https://api.mail.tm/messages/${messages[0].id}`, { headers: { 'Authorization': `Bearer ${user.activeEmailToken}` } });
    
    const text = `📩 *Pesan Masuk Baru*

• *Pengirim:* ${details.data.from.name || 'Anon'} <\`${details.data.from.address}\`>
• *Subjek:* *${details.data.subject || 'No Subject'}*

*Isi Pesan / OTP:*
\`\`\`text
${(details.data.text || details.data.intro || '').substring(0, 3000)}
\`\`\``;

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ *Sync Error*\nGagal memuat pesan dari cloud server gateway.`, { parse_mode: 'Markdown' });
  }
});

bot.onText(/\/sendmail/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await bot.sendMessage(chatId, `🛠️ *Restricted Feature*\n\nFitur pengiriman surat keluar saat ini berada dalam status Under Maintenance.`, { parse_mode: 'Markdown' });
});

bot.onText(/\/setpoint\s+(\d+)\s+(\d+)/i, async (msg, match) => {
  const chatId = String(msg.chat.id).trim();
  if (chatId !== String(OWNER_ID)) return;
  const targetId = match[1].trim();
  const points = parseInt(match[2].trim());
  
  const db = await readDB();
  if (!db.users[targetId]) return bot.sendMessage(chatId, `❌ User ID tidak ditemukan.`);
  db.users[targetId].points = (db.users[targetId].points || 0) + points;
  await writeDB(db);
  
  await bot.sendMessage(chatId, `✅ Poin ditambahkan ke ID \`${targetId}\`.`, { parse_mode: 'Markdown' });
  try { await bot.sendMessage(targetId, `🎉 Admin menambahkan *+${points} Poin* ke saldo akun Anda.`, { parse_mode: 'Markdown' }); } catch {}
});

bot.onText(/\/settier\s+(\d+)\s+([A-Z])\s+(\d+)/i, async (msg, match) => {
  const chatId = String(msg.chat.id).trim();
  if (chatId !== String(OWNER_ID)) return;
  const targetId = match[1].trim();
  const tier = match[2].trim().toUpperCase();
  const days = parseInt(match[3].trim());
  
  const db = await readDB();
  if (!db.users[targetId]) return bot.sendMessage(chatId, `❌ User ID tidak ditemukan.`);
  const exp = new Date();
  exp.setDate(exp.getDate() + days);
  
  db.users[targetId].tier = tier === 'A' ? 'A-Tier (Aero Premium)' : 'S-Tier (Infinite Eclipse)';
  db.users[targetId].tierExpiry = exp.toISOString();
  await writeDB(db);
  
  await bot.sendMessage(chatId, `✅ Upgraded user \`${targetId}\` ke ${tier}-Tier.`, { parse_mode: 'Markdown' });
  try { await bot.sendMessage(targetId, `🎉 Lisensi Anda ditingkatkan menjadi *${db.users[targetId].tier}* selama *${days} hari*!`, { parse_mode: 'Markdown' }); } catch {}
});

// -------------------------------------------------------------
// INTERACTIVE CALLBACK INTERFACE DISPATCHER
// -------------------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = String(query.message.chat.id).trim();
  const data = query.data;
  try { await bot.answerCallbackQuery(query.id); } catch {}

  if (!checkRateLimit(chatId, data)) {
    return bot.sendMessage(chatId, '⏳ Harap beri jeda.');
  }

  const db = await readDB();
  const isAdmin = chatId === String(OWNER_ID);
  const user = db.users[chatId] || await verifyUser(chatId, query.from.first_name);

  if (data === 'run_mail_random' || data === 'run_mail_custom') {
    await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
    let cost = data === 'run_mail_custom' ? 10 : 5;
    if (user.tier.includes('A-Tier')) cost = data === 'run_mail_custom' ? 5 : 2;
    if (user.tier.includes('S-Tier') || isAdmin) cost = 0;

    if (!isAdmin && !user.tier.includes('S-Tier')) {
      if (user.tier.includes('B-Tier') && data === 'run_mail_custom' && (user.dailyUsageCustom || 0) >= 1) {
        return bot.sendMessage(chatId, `❌ Sesi Custom B-Tier dibatasi 1x per hari.`);
      }
      if (user.tier.includes('A-Tier') && ((user.dailyUsageCustom || 0) + (user.dailyUsageRandom || 0)) >= 10) {
        return bot.sendMessage(chatId, `❌ Kuota pembuatan paket harian A-Tier Anda penuh.`);
      }
      if (user.points < cost) {
        return bot.sendMessage(chatId, `❌ Poin tidak mencukupi. Saldo Anda: ${user.points} Poin.`);
      }
    }

    const liveMsg = await bot.sendMessage(chatId, `\`[System]\` Synchronizing cloud session...`, { parse_mode: 'Markdown' });

    try {
      const domRes = await apiCall('https://api.mail.tm/domains');
      const domain = domRes.data['hydra:member'][0].domain;
      const username = (data === 'run_mail_custom' && customNameStorage.has(chatId)) ? customNameStorage.get(chatId) : makeRandomString(9);
      const pass = makeRandomString(12);
      const email = `${username}@${domain}`;
      customNameStorage.delete(chatId);

      await apiCall('https://api.mail.tm/accounts', { method: 'POST', data: { address: email, password: pass } });
      const tokRes = await apiCall('https://api.mail.tm/token', { method: 'POST', data: { address: email, password: pass } });
      
      let hours = user.tier.includes('B-Tier') ? 3 : (user.tier.includes('S-Tier') || isAdmin ? 24 : 10);
      const exp = new Date(Date.now() + hours * 60 * 60 * 1000);

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

      const successTemplate = `✅ *Temp Mail Deployed*

• *Alamat Email:* \`${email}\`
• *Masa Aktif:* \`${hours} Jam\`
• *Waktu Hancur:* \`${exp.toLocaleTimeString('id-ID')} WIB\`

_Jalankan /CheckInbox untuk memantau surat masuk._`;

      await bot.editMessageText(successTemplate, { chat_id: chatId, message_id: liveMsg.message_id, parse_mode: 'Markdown' }).catch(async () => {
        await bot.sendMessage(chatId, successTemplate, { parse_mode: 'Markdown' });
      });
    } catch (err) {
      await bot.editMessageText(`❌ Gagal mendaftarkan sesi ke API cloud server.`, { chat_id: chatId, message_id: liveMsg.message_id }).catch(()=>{});
      customNameStorage.delete(chatId);
    }
  }
});

// CRASH SHIELD LAYER
process.on('uncaughtException', (err) => { console.error('CRITICAL UNCAUGHT EXCEPTION:', err.message); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); });

console.log(`=================================================\n    CORE SYSTEM v17.6 APPLE TYPOGRAPHY COMPLETED\n=================================================`);

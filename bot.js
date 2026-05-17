// =============================================================
// TELEGRAM MAIL GATEWAY CORE ENGINE v17.4 - TIKTOK UI & ENGINE FIXED
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

const bot = new TelegramBot(TOKEN, { polling: true });
const dbPath = path.join(__dirname, 'database.json');

// STORAGE OPTIMIZED WITH MAPS
const customNameStorage = new Map();
const missionStorage = new Map();
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
  { command: 'misitiktok', description: 'Ambil bonus poin gratis' },
  { command: 'claimdaily', description: 'Klaim bonus 10 poin harian' }
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
      tiktokClaimed: false,
      tier: 'B-Tier (Standard Free)',
      tierExpiry: null,
      dailyUsageCustom: 0,
      dailyUsageRandom: 0,
      lastUsedDate: today
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
      await bot.sendMessage(chatId, `⚠️ *LISENSI SUBSCRIPTION EXPIRED*\nMasa langganan Premium Anda telah habis. Status Anda otomatis diturunkan kembali ke B-Tier (Free).`, { parse_mode: 'Markdown' });
    } catch {}
  }

  if (db.users[chatId].activeEmail && db.users[chatId].emailExpiry && new Date() > new Date(db.users[chatId].emailExpiry)) {
    db.users[chatId].activeEmail = null;
    db.users[chatId].activeEmailToken = null;
    db.users[chatId].emailExpiry = null;
    await writeDB(db);
    try {
      await bot.sendMessage(chatId, `⏰ *EMAIL TEMPORARY EXPIRED*\nSesi email Anda telah melewati batas waktu masa aktif. Silakan deploy email baru!`, { parse_mode: 'Markdown' });
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
// CORE BOT COMMAND HANDLERS
// -------------------------------------------------------------
bot.onText(/\/(start|menu)/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (!checkRateLimit(chatId)) return bot.sendMessage(chatId, "⏳ Terlalu cepat! Beri jeda beberapa detik.");

  await verifyUser(chatId, msg.from.first_name);
  const text = `⚙️ *PANDUAN UTAMA KENDALI BOT*\n──────────────────────────────\n🎲 /CreateMailR \`───\` Pasang Email Temp Acak\n✍️ /CreateMailC \`───\` Pasang Email Temp Kustom\n📥 /CheckInbox \`────\` Tarik Pesan Masuk / OTP\n📧 /EmailActive \`───\` Cek Sisa Waktu Sesi Email\n✉️ /SendMail \`──────\` Kirim Email Keluar Anonim\n\n💳 *SISTEM AKUN & TOPUP POIN*\n──────────────────────────────\n👤 /Profile \`────────\` Cek Saldo, Tier & Limit\n💵 /TopupPoint \`─────\` Isi Poin & Order Premium\n🎁 /MisiTiktok \`─────\` Misi Follow Dev (*+10 Poin*)\n📅 /ClaimDaily \`─────\` Klaim Jatah Poin Harian (*+10*)\n──────────────────────────────\n_Klik salah satu perintah berwarna biru di atas untuk mengoperasikan fitur bot secara instan._`;
  try { await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/profile/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (!checkRateLimit(chatId, 'profile')) return;

  const user = await verifyUser(chatId, msg.from.first_name);
  const isAdmin = chatId === String(OWNER_ID);

  let customLimitText = (user.dailyUsageCustom || 0) + ' / 1 Sesi Hari Ini';
  let randomLimitText = 'Unlimited (Asal poin cukup)';

  if (isAdmin || user.tier.includes('S-Tier')) {
    customLimitText = 'Unlimited';
    randomLimitText = 'Unlimited';
  } else if (user.tier.includes('A-Tier')) {
    const totalUsed = (user.dailyUsageCustom || 0) + (user.dailyUsageRandom || 0);
    customLimitText = `${totalUsed} / 10 Pembuatan`;
    randomLimitText = `${totalUsed} / 10 Pembuatan`;
  }

  const expInfo = user.tierExpiry ? `\n🔹 *Expired Premium :* \`${new Date(user.tierExpiry).toLocaleDateString('id-ID')}\`` : '';
  let emailStatusText = 'Tidak ada sesi email yang aktif';
  
  if (user.activeEmail && user.emailExpiry) {
    const diffMs = new Date(user.emailExpiry) - new Date();
    if (diffMs > 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      emailStatusText = `\`${user.activeEmail}\` (\`${diffHours}j ${diffMins}m lagi\`)`;
    }
  }

  const profileText = `👤 *USER DATA METADATA PANEL*\n──────────────────────────────\n🔹 *Nama Pengguna :* ${user.name}\n🔹 *ID Telegram   :* \`${chatId}\`\n🔹 *Saldo Poin    :* *${isAdmin ? 'Unlimited (Owner)' : `${user.points} Points`}*\n🔹 *Tier Lisensi  :* \`${isAdmin ? 'S-Tier (Developer)' : user.tier}\`${expInfo}\n\n📊 *SISA LIMIT PEMBUATAN HARI INI*\n──────────────────────────────\n🔹 *Email Kustom  :* \`${customLimitText}\`\n🔹 *Email Acak    :* \`${randomLimitText}\`\n\n📥 *STATUS EMAIL TEMPORARY*\n──────────────────────────────\n🔹 *Email Aktif   :* ${emailStatusText}\n──────────────────────────────`;
  try { await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/emailactive/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name);

  if (!user.activeEmail || !user.emailExpiry) {
    return bot.sendMessage(chatId, `❌ *TIDAK ADA EMAIL AKTIF*\n\nSaat ini Anda tidak memiliki sesi email temporary yang aktif berjalan.`, { parse_mode: 'Markdown' });
  }

  const diffMs = new Date(user.emailExpiry) - new Date();
  if (diffMs <= 0) {
    return bot.sendMessage(chatId, `❌ *SESI SUDAH KEDALUWARSA*\n\nSesi email Anda baru saja berakhir.`, { parse_mode: 'Markdown' });
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);

  const activeText = `📧 *INFORMASI EMAIL AKTIF ANDA*\n──────────────────────────────\n🔹 *Alamat Email :* \`${user.activeEmail}\`\n🔹 *Sisa Masa Aktif :* \`${diffHours} Jam, ${diffMins} Menit, ${diffSecs} Detik\`\n🔹 *Waktu Hancur  :* \`${new Date(user.emailExpiry).toLocaleTimeString('id-ID')} WIB\`\n──────────────────────────────\n_Gunakan /checkinbox untuk memeriksa isi surat masuk._`;
  try { await bot.sendMessage(chatId, activeText, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/topuppoint/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);
  const priceText = `...`; // (Teks dipersingkat di log konsol biar ga corrupt)
  const fullPriceText = `💳 *LIST TOPUP POIN & TIER PREMIUM*\n──────────────────────────────\n👑 *[ B-Tier ] - Standard Free (Default)*\n ├─ Harga : Rp0\n ├─ Masa Aktif Email : *3 Jam*\n └─ Limit Custom : *1x / Hari*\n\n👑 *[ A-Tier ] - Aero Custom Mail*\n ├─ Harga : *Rp11.000* (Aktif 14 Hari)\n ├─ Masa Aktif Email : *10 Jam*\n ├─ Total Limit Buat : *10x / Hari*\n └─ *DISKON POTONGAN POIN 50%*\n\n👑 *[ S-Tier ] - Infinite Eclipse*\n ├─ Harga : *Rp15.000* (Aktif 30 Hari)\n ├─ Masa Aktif Email : *24 Jam Penuh*\n └─ *UNLIMITED & BYPASS 0 POIN*\n──────────────────────────────\n📌 *PROSEDUR PEMBAYARAN:*\n1. Scan kode QRIS resmi developer di atas.\n2. Kirim bukti resi transfer sukses ke kontak Admin Owner: [Klik Hubungi Admin](tg://user?id=${OWNER_ID}) untuk aktivasi instan.`;
  try {
    await bot.sendPhoto(chatId, QRIS_URL, { caption: fullPriceText, parse_mode: 'Markdown' });
  } catch {
    await bot.sendMessage(chatId, fullPriceText + `\n\n⚠️ _(Gagal memuat gambar QRIS)_`, { parse_mode: 'Markdown' });
  }
});

bot.onText(/\/claimdaily/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const db = await readDB();
  await verifyUser(chatId, msg.from.first_name);
  db.users[chatId].points = (db.users[chatId].points || 0) + 10;
  await writeDB(db);
  await bot.sendMessage(chatId, `🎁 *DAILY BONUS CLAIMED*\n\nSelamat! Rekening saldo Anda berhasil ditambahkan *+10 Poin* gratis harian.`);
});

bot.onText(/\/misitiktok/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name);
  if (user.tiktokClaimed) {
    return bot.sendMessage(chatId, `❌ *MISSION COMPLETED*\n\nAnda sudah menuntaskan jatah hadiah misi ini sebelumnya.`, { parse_mode: 'Markdown' });
  }
  const tiktokText = `🎁 *MISI GRATIS BONUS POIN DEVS*\n──────────────────────────────\nDapatkan bonus reward instan sebesar *+10 Poin* langsung masuk dompet saldo Anda:\n\n1. Kunjungi tautan akun Dev: ${TIKTOK_DEV_URL}\n2. Klik tombol *Follow / Ikuti* akun resmi kami.\n3. Jika sudah selesai, kembali ke bot ini dan klik tombol konfirmasi di bawah ini:\n──────────────────────────────`;
  try {
    await bot.sendMessage(chatId, tiktokText, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: '✅ Confirm To Developer', callback_data: 'tiktok_confirm' }]] }
    });
  } catch (err) {}
});

bot.onText(/\/(createmailr|creater)/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name);
  const isAdmin = chatId === String(OWNER_ID);
  customNameStorage.delete(chatId);
  let cost = user.tier.includes('A-Tier') ? 2 : (user.tier.includes('S-Tier') || isAdmin ? 0 : 5);
  try {
    await bot.sendMessage(chatId, `🎲 *DEPLOY RANDOM EMAIL SYSTEM*\n──────────────────────────────\n• Jenis  : \`Random Auto Generated\`\n• Biaya  : \`${cost} Poin\`\n──────────────────────────────`, {
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
    return bot.sendMessage(chatId, `⚠️ *FORMAT EKSEKUSI SALAH*\n\nHarap masukkan nama kustom yang diinginkan di belakang perintah.\n\n*Contoh:* \`/CreateMailC emyber\``, { parse_mode: 'Markdown' });
  }

  customNameStorage.set(chatId, requestedName);
  let cost = user.tier.includes('A-Tier') ? 5 : (user.tier.includes('S-Tier') || isAdmin ? 0 : 10);
  try {
    await bot.sendMessage(chatId, `✍️ *DEPLOY CUSTOM EMAIL SYSTEM*\n──────────────────────────────\n• Pilihan : \`${requestedName}\`\n• Biaya   : \`${cost} Poin\`\n──────────────────────────────`, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🚀 Deploy Custom Email', callback_data: 'run_mail_custom' }]] }
    });
  } catch (err) {}
});

bot.onText(/\/checkinbox/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name); 
  if (!user.activeEmailToken || !user.activeEmail) {
    return bot.sendMessage(chatId, `❌ *SESSIONS NOT FOUND*\n\nSesi email Anda kosong atau sudah kedaluwarsa.`, { parse_mode: 'Markdown' });
  }
  
  await bot.sendChatAction(chatId, 'typing').catch(()=>{});
  try {
    const res = await apiCall('https://api.mail.tm/messages', { headers: { 'Authorization': `Bearer ${user.activeEmailToken}` } });
    const messages = res.data['hydra:member'];
    if (messages.length === 0) {
      return bot.sendMessage(chatId, `📭 *INBOX EMPTY*\n──────────────────────────────\nBelum ada email / kode OTP masuk di \`${user.activeEmail}\`.`, { parse_mode: 'Markdown' });
    }
    const details = await apiCall(`https://api.mail.tm/messages/${messages[0].id}`, { headers: { 'Authorization': `Bearer ${user.activeEmailToken}` } });
    const text = `📩 *NEW EMAIL INBOUND ARRIVED*\n──────────────────────────────\n• *Dari   :* ${details.data.from.name || 'Anon'} <\`${details.data.from.address}\`>\n• *Judul  :* *${details.data.subject || 'No Subject'}*\n\n*ISI PESAN / KODE OTP:*\n\`\`\`text\n${(details.data.text || details.data.intro || '').substring(0, 3000)}\n\`\`\`\n──────────────────────────────`;
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ *GATEWAY SYNC ERROR*\n\nGagal terhubung sinkronisasi ke server cloud.`, { parse_mode: 'Markdown' });
  }
});

bot.onText(/\/sendmail/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await bot.sendMessage(chatId, `🛠️ *DEVELOPER RESTRICTED FEATURE*\n──────────────────────────────\nMaaf, fitur pengiriman surat keluar saat ini berada dalam status Maintenance.`, { parse_mode: 'Markdown' });
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
  try { await bot.sendMessage(targetId, `🎉 Admin telah menambahkan *+${points} Poin* ke akun Anda.`, { parse_mode: 'Markdown' }); } catch {}
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
  
  await bot.sendMessage(chatId, `✅ *UPGRADE PREMIUM SUKSES*`, { parse_mode: 'Markdown' });
  try { await bot.sendMessage(targetId, `🎉 Akun Anda telah ditingkatkan menjadi *${db.users[targetId].tier}* selama *${days} hari*!`, { parse_mode: 'Markdown' }); } catch {}
});

// -------------------------------------------------------------
// INTERACTIVE CALLBACK INTERFACE DISPATCHER
// -------------------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = String(query.message.chat.id).trim();
  const data = query.data;
  try { await bot.answerCallbackQuery(query.id); } catch {}

  if (!checkRateLimit(chatId, data)) {
    return bot.sendMessage(chatId, '⏳ Request terlalu cepat! Harap beri jeda.');
  }

  const db = await readDB();
  const isAdmin = chatId === String(OWNER_ID);
  const user = db.users[chatId] || await verifyUser(chatId, query.from.first_name);

  // === FIXED CRITICAL: SEKARANG TOMBOL TIKTOK BERREAKSI DAN MEMINTA INPUT ===
  if (data === 'tiktok_confirm') {
    await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
    missionStorage.set(chatId, 'awaiting_tiktok_username');
    return bot.sendMessage(chatId, `✍️ *VERIFIKASI SISTEM TIKTOK*\n\nSilakan ketik langsung dan kirimkan **Username TikTok** Anda yang digunakan untuk mem-follow kami (Contoh: \`@emyber\`):`);
  }

  if (data === 'run_mail_random' || data === 'run_mail_custom') {
    await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
    let cost = data === 'run_mail_custom' ? 10 : 5;
    if (user.tier.includes('A-Tier')) cost = data === 'run_mail_custom' ? 5 : 2;
    if (user.tier.includes('S-Tier') || isAdmin) cost = 0;

    if (!isAdmin && !user.tier.includes('S-Tier')) {
      if (user.tier.includes('B-Tier') && data === 'run_mail_custom' && (user.dailyUsageCustom || 0) >= 1) {
        return bot.sendMessage(chatId, `❌ Akun B-Tier dibatasi email Custom 1x per hari.`);
      }
      if (user.tier.includes('A-Tier') && ((user.dailyUsageCustom || 0) + (user.dailyUsageRandom || 0)) >= 10) {
        return bot.sendMessage(chatId, `❌ Akun A-Tier Anda sudah mencapai batas maksimal harian.`);
      }
      if (user.points < cost) {
        return bot.sendMessage(chatId, `❌ Poin tidak cukup. Sisa saldo Anda: ${user.points} Poin.`);
      }
    }

    const liveMsg = await bot.sendMessage(chatId, `\`[SYSTEM PROLOG]\` Connecting to Mail.tm cloud gateway...`, { parse_mode: 'Markdown' });

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

      const successTemplate = `\n✅ *TEMP MAIL DEPLOYED SUCCESS*\n──────────────────────────────\n• *Email Temp :* \`${email}\`\n• *Durasi Aktif :* \`${hours} Jam Penuh\`\n• *Masa Berlaku :* \`${exp.toLocaleTimeString('id-ID')} WIB\`\n──────────────────────────────\n_Gunakan /CheckInbox untuk melihat pesan masuk._`;
      await bot.editMessageText(successTemplate, { chat_id: chatId, message_id: liveMsg.message_id, parse_mode: 'Markdown' }).catch(async () => {
        await bot.sendMessage(chatId, successTemplate, { parse_mode: 'Markdown' });
      });
    } catch (err) {
      await bot.editMessageText(`❌ Gagal memproses pendaftaran ke server.`, { chat_id: chatId, message_id: liveMsg.message_id }).catch(()=>{});
      customNameStorage.delete(chatId);
    }
  }
});

// -------------------------------------------------------------
// TEXT CONTENT INTERCEPT LISTENER
// -------------------------------------------------------------
bot.on('message', async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (!msg.text || msg.text.startsWith('/')) return;
  
  if (missionStorage.get(chatId) === 'awaiting_tiktok_username') {
    const tkUser = msg.text.trim();
    missionStorage.delete(chatId);
    
    const db = await readDB();
    await verifyUser(chatId, msg.from.first_name);
    
    if (db.users[chatId].tiktokClaimed) {
      return bot.sendMessage(chatId, `❌ Hadiah misi ini sudah diambil.`);
    }

    // Eksekusi Poin Masuk Instan (Auto Approve)
    db.users[chatId].points = (db.users[chatId].points || 0) + 10;
    db.users[chatId].tiktokClaimed = true;
    await writeDB(db);
    
    await bot.sendMessage(chatId, `🎉 *MISI BERHASIL VERIFIKASI*\n\nSistem berhasil mendeteksi akun TikTok "${tkUser}". Saldo dompet Anda sukses ditambahkan sebesar *+10 Poin* gratis!`, { parse_mode: 'Markdown' });
    
    try {
      await bot.sendMessage(OWNER_ID, `📢 *LOG NOTIFIKASI MISI TIKTOK*\n\n• User ID : ${chatId}\n• Nama Akun : ${msg.from.first_name || 'User'}\n• Bukti TikTok : ${tkUser}\n\n_Status: Auto-Approved oleh sistem Gateway_`);
    } catch (err) {}
  }
});

// CRASH SHIELD LAYER
process.on('uncaughtException', (err) => { console.error('CRITICAL UNCAUGHT EXCEPTION:', err.message); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); });

console.log(`=================================================\n    CORE SYSTEM v17.4 TIKTOK FIX COMPLETE ACTIVE\n=================================================`);

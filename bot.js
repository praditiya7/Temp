// =============================================================
// TELEGRAM MAIL GATEWAY CORE ENGINE v17.8 - FINAL PREMIUM BOT
// =============================================================
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// CONFIG SECURE (.env file integration)
require('dotenv').config();
const TOKEN = process.env.TOKEN || '8829940673:AAHqA6_LjlON9DXqMfUTkZ68__MC1O8ZR2I';
const OWNER_ID = process.env.OWNER_ID || '8430290683';
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
  { command: 'start', description: 'Buka dashboard utama bot kamu' },
  { command: 'profile', description: 'Cek saldo poin, tier & status email' },
  { command: 'createmailr', description: 'Buat email acak (Random)' },
  { command: 'createmailc', description: 'Buat email kustom nama kamu' },
  { command: 'checkinbox', description: 'Periksa kotak masuk / kode OTP' },
  { command: 'emailactive', description: 'Cek sisa waktu sesi email kamu' },
  { command: 'sendmail', description: 'Kirim email keluar (Developer Only)' },
  { command: 'topuppoint', description: 'Topup poin & upgrade tier premium' },
  { command: 'claimdaily', description: 'Klaim bonus 10 poin harian kamu' },
  { command: 'aboutdev', description: 'Informasi Developer & Link Dukungan' },
  { command: 'help', description: 'Butuh bantuan? Sesi premium hilang?' }
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

// HELPER: GET CURRENT DATE STRING IN ASIA/JAKARTA
function getJakartaDateString() {
  const options = { timeZone: 'Asia/Jakarta', year: 'numeric', month: 'short', day: 'numeric' };
  return new Date().toLocaleDateString('en-US', options);
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
  const today = getJakartaDateString();
  chatId = String(chatId).trim();

  if (!db.users[chatId]) {
    db.users[chatId] = {
      name: firstName || 'Kakak Cantik/Ganteng',
      points: 10,
      activeEmail: null,
      activeEmailToken: null,
      emailExpiry: null,
      tier: 'B-Tier (Standard Free)',
      tierExpiry: null,
      dailyUsageCustom: 0,
      dailyUsageRandom: 0,
      lastUsedDate: today,
      lastDailyClaim: null
    };
    await writeDB(db);
  }

  if (db.users[chatId].lastUsedDate !== today) {
    db.users[chatId].dailyUsageCustom = 0;
    db.users[chatId].dailyUsageRandom = 0;
    db.users[chatId].lastUsedDate = today;
    await writeDB(db);
  }

  // Timezone safe checking for tier expiry
  if (db.users[chatId].tierExpiry && Date.now() > new Date(db.users[chatId].tierExpiry).getTime()) {
    db.users[chatId].tier = 'B-Tier (Standard Free)';
    db.users[chatId].tierExpiry = null;
    await writeDB(db);
    try {
      await bot.sendMessage(chatId, `⚠️ *Masa Langganan Habis*\n\nHalo Kak.. Masa premium kamu sudah selesai nih. Status akun kamu otomatis kembali ke B-Tier (Free) yaa. Mau upgrade lagi? Yuk cek /topuppoint 💕`, { parse_mode: 'Markdown' });
    } catch {}
  }

  // Timezone safe checking for active email expiry
  if (db.users[chatId].activeEmail && db.users[chatId].emailExpiry) {
    const expiryTime = new Date(db.users[chatId].emailExpiry).getTime();
    if (Date.now() > expiryTime) {
      db.users[chatId].activeEmail = null;
      db.users[chatId].activeEmailToken = null;
      db.users[chatId].emailExpiry = null;
      await writeDB(db);
      try {
        await bot.sendMessage(chatId, `⏰ *Email Terhapus Otomatis*\n\nMasa aktif email temporary kamu sudah habis nih Kak. Silakan buat email yang baru lagi yaa! ✨`, { parse_mode: 'Markdown' });
      } catch {}
    }
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
// CORE BOT COMMAND HANDLERS (iOS / MAC FEMININE STYLE)
// -------------------------------------------------------------
bot.onText(/\/(start|menu)/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (!checkRateLimit(chatId)) return bot.sendMessage(chatId, "⏳ Sebentar ya Kak, jangan buru-buru..");

  await verifyUser(chatId, msg.from.first_name);
  
  const text = `⚙️ *Dashboard Utama*

*Fitur Pembuatan Email*
🎲 /CreateMailR • Buat Email Temp Acak
✍️ /CreateMailC • Buat Email Temp Kustom Nama
📥 /CheckInbox • Cek Kotak Masuk / Kode OTP
📧 /EmailActive • Cek Sisa Waktu Email Kamu
✉️ /SendMail • Kirim Email Keluar (Dev Only)

*Menu Akun & Premium*
👤 /Profile • Cek Saldo Poin & Tier Kamu
💵 /TopupPoint • Isi Poin & Upgrade Premium
📅 /ClaimDaily • Klaim Bonus Poin Harian
🙋‍♀️ /Help • Pusat Bantuan & Pengaduan Sesi
👨‍💻 /AboutDev • Info Developer & Link Dukungan

_Ketuk perintah berwarna biru di atas untuk menjalankan fitur bot ya Kak! ✨_`;

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
    const diffMs = new Date(user.emailExpiry).getTime() - Date.now();
    if (diffMs > 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      emailStatusText = `\`${user.activeEmail}\` (${diffHours}j ${diffMins}m lagi)`;
    }
  }

  const profileText = `👤 *Metadata Profil Kamu*

• *Nama Kamu:* ${user.name}
• *ID Telegram:* \`${chatId}\`
• *Saldo Poin:* *${isAdmin ? 'Bypass (Owner ❤️)' : `${user.points} Points`}*
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
    return bot.sendMessage(chatId, `❌ *Sesi Tidak Ditemukan*\n\nSaat ini kamu tidak memiliki sesi email temporary yang aktif nih Kak.`, { parse_mode: 'Markdown' });
  }

  const diffMs = new Date(user.emailExpiry).getTime() - Date.now();
  if (diffMs <= 0) {
    return bot.sendMessage(chatId, `❌ *Sesi Kedaluwarsa*\n\nSesi email temporary kamu baru saja berakhir Kak.`, { parse_mode: 'Markdown' });
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);

  const waktuHancurTeks = new Date(user.emailExpiry).toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour12: false
  }).replace(/\./g, ':');

  const activeText = `📧 *Detail Sesi Aktif*

• *Alamat Email:* \`${user.activeEmail}\`
• *Sisa Waktu:* \`${diffHours} Jam, ${diffMins} Menit, ${diffSecs} Detik\`
• *Waktu Hancur:* \`${waktuHancurTeks} WIB\`

_Jangan lupa ketik /checkinbox untuk melihat pesan masuk yaa! 💕_`;

  try { await bot.sendMessage(chatId, activeText, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/topuppoint/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);
  
  const priceText = `💳 *Store & Topup Center*

💰 *[ Paket Topup Poin Eceran ]*
• *10 Poin* • Rp1.500
• *50 Poin* • Rp6.000 *(Hari Hemat!)*
• *100 Poin* • Rp10.000 *(Best Seller!)*

👑 *[ B-Tier ] Standard Free*
• Harga: Rp0
• Sesi Email: 3 Jam | Limit Custom: 1x / Hari

👑 *[ A-Tier ] Aero Custom Mail*
• Harga: *Rp11.000* (14 Hari)
• Sesi Email: 10 Jam | Limit Buat: 10x / Hari
• Keuntungan: Diskon Potongan Poin 50%

👑 *[ S-Tier ] Infinite Eclipse*
• Harga: *Rp15.000* (30 Hari)
• Sesi Email: 24 Jam Penuh
• Keuntungan: Unlimited Sesi & Bypass 0 Poin

📌 *Instruksi Pembayaran:*
1. Scan QRIS resmi Developer di atas yaa.
2. Selesaikan transaksi sesuai nominal paket pilihan kamu.
3. Kirim bukti resi transfer sukses ke kontak Admin untuk aktivasi lisensi atau pengisian koin kamu: [Hubungi Admin](tg://user?id=${OWNER_ID})`;
  
  try {
    await bot.sendPhoto(chatId, QRIS_URL, { caption: priceText, parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, priceText + `\n\n⚠️ _(Gambar QRIS gagal dimuat, pastikan link QRIS_URL di env benar ya Kak)_`, { parse_mode: 'Markdown' });
  }
});

bot.onText(/\/claimdaily/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const db = await readDB();
  await verifyUser(chatId, msg.from.first_name);
  
  const todayStr = getJakartaDateString();

  if (db.users[chatId].lastDailyClaim === todayStr) {
    return bot.sendMessage(chatId, `⏰ *Eits, Batas Klaim Tercapai*\n\nKamu sudah mengambil jatah bonus hari ini Kak. Kembali lagi besok untuk ambil bonus harian kamu yaa! Sayang kamu~`, { parse_mode: 'Markdown' });
  }

  db.users[chatId].points = (db.users[chatId].points || 0) + 10;
  db.users[chatId].lastDailyClaim = todayStr;
  await writeDB(db);

  await bot.sendMessage(chatId, `🎁 *Klaim Hadiah Sukses*\n\nHoreee! Saldo dompet kamu berhasil ditambahkan sebesar *+10 Poin* gratis harian dari aku! ✨`, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);

  const helpText = `🙋‍♀️ *Pusat Bantuan & Pengaduan Sesi*

Halo Kak! Ada kendala dengan sesi email atau akun premium kamu? Jangan panik dulu yaa, aku siap bantu kok! 😊

⏰ *Sesi Email Tiba-tiba Hilang / Terhapus?*
Bot kami berjalan di sistem *Cloud GitHub Engine*. Jika server mengalami pemeliharaan (restart), sesi email temporary yang sedang berjalan kemungkinan bisa terputus otomatis demi keamanan. 
• Silakan buat sesi email baru menggunakan perintah /createmailr atau /createmailc ya Kak.

👑 *Masa Aktif Premium Berkurang / Ke-reset?*
Jika langganan Premium (A-Tier / S-Tier) kamu hilang atau tidak sesuai akibat kendala server:
1. Salin **ID Telegram** kamu (Cek di menu /profile).
2. Kirim nomor ID tersebut beserta kronologinya ke Email CS Support resmi kami.
3. Tim kami akan langsung memeriksa data dan memulihkan sisa jatah hari premium kamu secara utuh!

Form pengaduan resmi silakan kirimkan ke:
• *Email CS Support:* \`${CS_EMAIL}\`

_⚠️ Kontak Telegram Admin hanya melayani jalur transaksi pembayaran & top up saja ya Kak. Untuk kendala/error wajib lewat email di atas. Terima kasih! 💕_`;

  try {
    await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {}
});

bot.onText(/\/aboutdev/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);

  const aboutText = `👨‍💻 *Developer Profile*

Sistem Mail Gateway ini dirancang dan dioperasikan secara mandiri untuk kebutuhan temporary deployment email kamu.

• *Developer:* \`Emy\`
• *Email CS Support:* \`${CS_EMAIL}\`

☕ *Donation & Support*
Kalau bot buatan aku ini dirasa bermanfaat, Kakak boleh banget berikan dukungan donasi sukarela untuk bantu biaya sewa server cloud biar tetep nyala terus:

• *Link Saweria:* [Saweria Donasi Resmi Emy](${SAWERIA_URL})

_⚠️ Catatan: Jika ada kendala teknis atau error sistem, silakan layangkan laporan kamu murni melalui Email CS Support di atas yaa Kak. Terima kasih banyak! 🥰_`;
  
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

_Konfirmasi pembuatan email acak kamu dengan menekan tombol di bawah yaa!_`;

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
    return bot.sendMessage(chatId, `⚠️ *Format Salah ya Kak*\n\nHarap masukkan nama kustom yang kamu mau di belakang perintah ya.\n\nContoh: \`/CreateMailC emyber\``, { parse_mode: 'Markdown' });
  }

  customNameStorage.set(chatId, requestedName);
  let cost = user.tier.includes('A-Tier') ? 5 : (user.tier.includes('S-Tier') || isAdmin ? 0 : 10);
  
  const inlineText = `✍️ *Deploy System Custom*

• Pilihan Nama: \`${requestedName}\`
• Pemotongan: \`${cost} Poin\`

_Konfirmasi pembuatan email kustom kamu dengan menekan tombol di bawah yaa!_`;

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
    return bot.sendMessage(chatId, `❌ *Sesi Kosong*\n\nSesi email kamu kosong atau sudah kedaluwarsa nih Kak.`, { parse_mode: 'Markdown' });
  }
  
  await bot.sendChatAction(chatId, 'typing').catch(()=>{});
  try {
    const res = await apiCall('https://api.mail.tm/messages', { headers: { 'Authorization': `Bearer ${user.activeEmailToken}` } });
    const messages = res.data['hydra:member'];
    if (messages.length === 0) {
      return bot.sendMessage(chatId, `📭 *Inbox Kosong*\n\nBelum ada data surat atau pesan masuk baru di \`${user.activeEmail}\` nih. Ditunggu sebentar ya Kak.`, { parse_mode: 'Markdown' });
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
    await bot.sendMessage(chatId, `❌ *Sync Error*\nGagal memuat data pesan masuk dari server cloud gateway Kak, coba lagi ya.`, { parse_mode: 'Markdown' });
  }
});

bot.onText(/\/sendmail/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await bot.sendMessage(chatId, `🛠️ *Restricted Feature*\n\nFitur pengiriman surat keluar saat ini masih diperbaiki dulu ya Kak (Under Maintenance).`, { parse_mode: 'Markdown' });
});

// =============================================================
// PRIVILEGED ADMIN OPERATIONS SECTION (OWNER CONTROL ONLY)
// =============================================================

bot.onText(/\/setpoint\s+(\d+)\s+(\d+)/i, async (msg, match) => {
  const chatId = String(msg.chat.id).trim();
  if (chatId !== String(OWNER_ID)) return;
  const targetId = match[1].trim();
  const points = parseInt(match[2].trim());
  
  const db = await readDB();
  if (!db.users[targetId]) return bot.sendMessage(chatId, `❌ User ID tidak ditemukan.`);
  db.users[targetId].points = (db.users[targetId].points || 0) + points;
  await writeDB(db);
  
  await bot.sendMessage(chatId, `✅ Poin berhasil ditambahkan ke ID \`${targetId}\`.`, { parse_mode: 'Markdown' });
  try { await bot.sendMessage(targetId, `🎉 Horeee! Admin menambahkan bonus *+${points} Poin* ke saldo akun kamu! 💕`, { parse_mode: 'Markdown' }); } catch {}
});

bot.onText(/\/settier\s+(\d+)\s+([A-Z])\s+(\d+)/i, async (msg, match) => {
  const chatId = String(msg.chat.id).trim();
  if (chatId !== String(OWNER_ID)) return;
  
  const targetId = match[1].trim();
  const tier = match[2].trim().toUpperCase();
  const days = parseInt(match[3].trim()); // FLEKSIBEL HARI UNTUK RESTORE KONDISI SEBELUMNYA
  
  const db = await readDB();
  if (!db.users[targetId]) return bot.sendMessage(chatId, `❌ Aduh Owner, User ID tersebut gak ketemu di database.`);
  
  const exp = new Date();
  exp.setDate(exp.getDate() + days);
  
  db.users[targetId].tier = tier === 'A' ? 'A-Tier (Aero Premium)' : 'S-Tier (Infinite Eclipse)';
  db.users[targetId].tierExpiry = exp.toISOString();
  await writeDB(db);
  
  await bot.sendMessage(chatId, `✅ Berhasil memulihkan/upgrade akun \`${targetId}\` ke ${tier}-Tier selama *${days} Hari* ya Owner!`, { parse_mode: 'Markdown' });
  try { 
    await bot.sendMessage(targetId, `🎉 *Status Premium Dipulihkan!*\n\nHalo Kak! Status lisensi premium kamu telah disesuaikan kembali menjadi *${db.users[targetId].tier}* selama *${days} hari* ke depan yaa. Terima kasih atas kesabaran kamu! 🥰`, { parse_mode: 'Markdown' }); 
  } catch {}
});

// -------------------------------------------------------------
// INTERACTIVE CALLBACK INTERFACE DISPATCHER
// -------------------------------------------------------------
bot.on('callback_query', async (query) => {
  const chatId = String(query.message.chat.id).trim();
  const data = query.data;
  try { await bot.answerCallbackQuery(query.id); } catch {}

  if (!checkRateLimit(chatId, data)) {
    return bot.sendMessage(chatId, '⏳ Jeda sebentar ya Kak, jangan buru-buru kliknya..');
  }

  const db = await readDB();
  const isAdmin = chatId === String(OWNER_ID);
  const user = db.users[chatId] || await verifyUser(chatId, query.from.first_name);

  if (data === 'run_mail_random' || data === 'run_mail_custom') {
    await bot.deleteMessage(chatId, query.message.message_id).catch(() => {});
    
    // PEMBAGIAN JAM FIXED SESUAI TIER MASING-MASING
    let hours = (isAdmin || user.tier.includes('S-Tier')) ? 24 : (user.tier.includes('A-Tier') ? 10 : 3);
    
    let cost = data === 'run_mail_custom' ? 10 : 5;
    if (user.tier.includes('A-Tier')) cost = data === 'run_mail_custom' ? 5 : 2;
    if (user.tier.includes('S-Tier') || isAdmin) cost = 0;

    // VALIDASI PEMBATASAN UNTUK ANTI-ABUSE USER KAKAK
    if (!isAdmin && !user.tier.includes('S-Tier')) {
      if (user.tier.includes('B-Tier')) {
        if (data === 'run_mail_custom' && (user.dailyUsageCustom || 0) >= 1) {
          return bot.sendMessage(chatId, `❌ Maaf ya Kak, kuota kustom B-Tier (Free) dibatasi 1x per hari.`);
        }
      } else if (user.tier.includes('A-Tier')) {
        const totalUsed = (user.dailyUsageCustom || 0) + (user.dailyUsageRandom || 0);
        if (totalUsed >= 10) {
          return bot.sendMessage(chatId, `❌ Maaf Kak, kuota limit harian paket A-Tier kamu sudah penuh (Maks. 10 sesi).`);
        }
      }
      
      if (user.points < cost) {
        return bot.sendMessage(chatId, `❌ Yah, saldo poin kamu tidak cukup Kak. Saldo kamu: ${user.points} Poin.`);
      }
    }

    const liveMsg = await bot.sendMessage(chatId, `\`[System]\` Sedang menyiapkan sesi cloud untuk kamu... 💖`, { parse_mode: 'Markdown' });

    try {
      const domRes = await apiCall('https://api.mail.tm/domains');
      const domain = domRes.data['hydra:member'][0].domain;
      const username = (data === 'run_mail_custom' && customNameStorage.has(chatId)) ? customNameStorage.get(chatId) : makeRandomString(9);
      const pass = makeRandomString(12);
      const email = `${username}@${domain}`;
      customNameStorage.delete(chatId);

      await apiCall('https://api.mail.tm/accounts', { method: 'POST', data: { address: email, password: pass } });
      const tokRes = await apiCall('https://api.mail.tm/token', { method: 'POST', data: { address: email, password: pass } });
      
      // PERHITUNGAN EXPIRED DI-KUNCI AMAN BERDASARKAN UTC GLOBAL MILIDETIK
      const now = new Date();
      const exp = new Date(now.getTime() + (hours * 60 * 60 * 1000));

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

      // FORCE FORMAT WIB ASIA/JAKARTA UNTUK NOTIFIKASI USER
      const waktuHancurTeks = exp.toLocaleTimeString('id-ID', { 
        timeZone: 'Asia/Jakarta', 
        hour12: false 
      }).replace(/\./g, ':');

      const successTemplate = `✅ *Temp Mail Deployed*

• *Alamat Email:* \`${email}\`
• *Masa Aktif:* \`${hours} Jam\`
• *Waktu Hancur:* \`${waktuHancurTeks} WIB\`

_Ketik /checkinbox sekarang untuk memantau kotak masuk surat yaa Kak! ✨_`;

      await bot.editMessageText(successTemplate, { chat_id: chatId, message_id: liveMsg.message_id, parse_mode: 'Markdown' }).catch(async () => {
        await bot.sendMessage(chatId, successTemplate, { parse_mode: 'Markdown' });
      });
    } catch (err) {
      await bot.editMessageText(`❌ Maaf Kak, gagal mendaftarkan sesi baru ke cloud API server.`, { chat_id: chatId, message_id: liveMsg.message_id }).catch(()=>{});
      customNameStorage.delete(chatId);
    }
  }
});

// CRASH SHIELD LAYER
process.on('uncaughtException', (err) => { console.error('CRITICAL UNCAUGHT EXCEPTION:', err.message); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection at:', promise, 'reason:', reason); });

console.log(`=================================================\n    CORE SYSTEM v17.8 BOT FINAL PRODUCTION OPEN\n=================================================`);

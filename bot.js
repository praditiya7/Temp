// =============================================================
// TELEGRAM MAIL GATEWAY CORE ENGINE v18.0 - FEMININE SPECIAL
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
const adminSessionStorage = new Map(); // Untuk mencatat alur input menu rahasia Admin

// REGISTER MENU BLUE COMMANDS INTERFACE
bot.setMyCommands([
  { command: 'start', description: 'Buka dashboard utama' },
  { command: 'profile', description: 'Cek saldo poin, tier & status email' },
  { command: 'createmailr', description: 'Buat email acak' },
  { command: 'createmailc', description: 'Buat email kustom' },
  { command: 'checkinbox', description: 'Periksa kotak masuk / kode OTP' },
  { command: 'emailactive', description: 'Cek sisa waktu sesi email' },
  { command: 'topuppoint', description: 'Topup poin & upgrade tier' },
  { command: 'claimdaily', description: 'Klaim bonus harian' },
  { command: 'aboutdev', description: 'Info developer & dukungan' },
  { command: 'help', description: 'Pusat bantuan' },
  { command: 'setpoint', description: '(Owner) Atur poin user' },
  { command: 'settier', description: '(Owner) Atur tier user' },
  { command: 'sendmessage', description: '(Owner) Kirim pesan ke user ID' }
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

// Audit logging for admin actions
async function appendAuditLog(operatorId, action, targetId, before, after) {
  const logPath = path.join(__dirname, 'audit.log');
  const entry = {
    timestamp: new Date().toISOString(),
    operatorId: String(operatorId),
    action: String(action),
    targetId: String(targetId),
    before: before === undefined ? null : before,
    after: after === undefined ? null : after
  };
  try {
    await fs.appendFile(logPath, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('Audit Log Error:', err.message);
  }
}

async function verifyUser(chatId, firstName) {
  const db = await readDB();
  const today = getJakartaDateString();
  chatId = String(chatId).trim();

  if (!db.users[chatId]) {
    db.users[chatId] = {
      name: firstName || 'Pengguna',
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
      await bot.sendMessage(chatId, `*Masa Langganan Telah Berakhir*\n\nHalo, masa paket premium kamu telah berakhir. Status akun kamu otomatis kembali ke B-Tier (Free). Untuk memperpanjang, silakan cek /topuppoint.`, { parse_mode: 'Markdown' });
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
        await bot.sendMessage(chatId, `*Email Otomatis Dihapus*\n\nMasa aktif email temporary kamu telah berakhir dan email telah dihapus demi keamanan. Jika kamu membutuhkan sesi baru, silakan buat yang baru.`, { parse_mode: 'Markdown' });
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
// CORE BOT COMMAND HANDLERS (SUPER FEMININE STYLE)
// -------------------------------------------------------------
bot.onText(/\/(start|menu)/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (!checkRateLimit(chatId)) return bot.sendMessage(chatId, "Sistem sedang sibuk, silakan tunggu beberapa detik lalu coba lagi.");

  await verifyUser(chatId, msg.from.first_name);
  const userName = msg.from.username ? `@${msg.from.username}` : (msg.from.first_name || 'Pengguna');

  const text = `Halo ${userName}, selamat datang di dashboard utama.

Bot ini siap membantu kamu menyiapkan email sementara yang aman, cepat, dan terpercaya. Berikut fitur yang tersedia:

Fitur pembuatan email sementara:
- /CreateMailR : Buat sesi email acak
- /CreateMailC : Buat sesi email kustom
- /CheckInbox : Periksa kotak masuk / kode OTP
- /EmailActive : Lihat sisa waktu sesi email aktif

Menu akun & layanan premium:
- /Profile : Cek saldo poin & level tier
- /TopupPoint : Topup poin & upgrade tier
- /ClaimDaily : Klaim bonus harian
- /Help : Pusat bantuan
- /AboutDev : Info developer

Gunakan perintah di atas sesuai kebutuhan.`;

  try { await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/profile/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (!checkRateLimit(chatId, 'profile')) return;

  const user = await verifyUser(chatId, msg.from.first_name);
  const isAdmin = chatId === String(OWNER_ID);

  let customLimitText = (user.dailyUsageCustom || 0) + ' / 1 Sesi Hari Ini';
  let randomLimitText = 'Tanpa Batas (Unlimited)';

  if (isAdmin || user.tier.includes('S-Tier')) {
    customLimitText = 'Tanpa Batas (Unlimited)';
    randomLimitText = 'Tanpa Batas (Unlimited)';
  } else if (user.tier.includes('A-Tier')) {
    const totalUsed = (user.dailyUsageCustom || 0) + (user.dailyUsageRandom || 0);
    customLimitText = `${totalUsed} / 10 Pembuatan`;
    randomLimitText = `${totalUsed} / 10 Pembuatan`;
  }

  const expInfo = user.tierExpiry ? `\n• Masa Aktif Premium: \`${new Date(user.tierExpiry).toLocaleDateString('id-ID')}\`` : '';
  let emailStatusText = 'Belum ada sesi aktif.';
  
  if (user.activeEmail && user.emailExpiry) {
    const diffMs = new Date(user.emailExpiry).getTime() - Date.now();
    if (diffMs > 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      emailStatusText = `\`${user.activeEmail}\` \n└─ (Sisa waktu: ${diffHours}j ${diffMins}m lagi)`;
    }
  }

  const profileText = `Profil akun kamu:

Halo *${user.name}*, berikut detail akun kamu di sistem:

- ID Telegram: \`${chatId}\`
- Saldo poin: *${isAdmin ? 'Bypass (Owner)' : `${user.points} Points`}*
- Level tier: \`${isAdmin ? 'S-Tier (Owner)' : user.tier}\`${expInfo}

Sisa kuota pembuatan hari ini:
- Email Kustom: \`${customLimitText}\`
- Email Acak: \`${randomLimitText}\`

Status sesi aktif saat ini:
- Alamat email: ${emailStatusText}`;

  try { await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/emailactive/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name);

  if (!user.activeEmail || !user.emailExpiry) {
    return bot.sendMessage(chatId, `*Sesi Tidak Ditemukan*\n\nSaat ini kamu tidak memiliki sesi email temporary yang aktif. Silakan buat sesi baru menggunakan /createmailr atau /createmailc.`, { parse_mode: 'Markdown' });
  }

  const diffMs = new Date(user.emailExpiry).getTime() - Date.now();
  if (diffMs <= 0) {
    return bot.sendMessage(chatId, `*Sesi Telah Berakhir*\n\nSesi email temporary kamu sudah berakhir. Silakan buat sesi baru jika masih membutuhkan akses ke email sementara.`, { parse_mode: 'Markdown' });
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);

  const waktuHancurTeks = new Date(user.emailExpiry).toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour12: false
  }).replace(/\./g, ':');

  const activeText = `Detail sesi email yang sedang aktif:\n\n- Alamat email: \`${user.activeEmail}\`\n- Sisa masa aktif: \`${diffHours} Jam, ${diffMins} Menit, ${diffSecs} Detik\`\n- Waktu otomatis berakhir: \`${waktuHancurTeks} WIB\`\n\n_Tips: Ketik /checkinbox secara berkala untuk memeriksa pesan masuk atau kode OTP._`;

  try { await bot.sendMessage(chatId, activeText, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/topuppoint/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);
  
  const priceText = `Store & Topup Center Resmi Emy

Daftar paket poin:
- 10 Poin — Rp1.500
- 50 Poin — Rp6.000
- 100 Poin — Rp10.000

Tier:
• B-Tier (Standard Free) — Harga: Rp0 — Masa Aktif Email: 3 Jam | Limit Kustom: 1x / Hari
• A-Tier — Harga: Rp11.000 — Masa Aktif: 14 Hari — Limit: 10x Sesi / Hari
• S-Tier — Harga: Rp15.000 — Masa Aktif: 30 Hari — Keuntungan: Unlimited Sesi

Langkah Pembayaran:
1. Scan QRIS.
2. Selesaikan pembayaran sesuai paket.
3. Kirim bukti transfer ke Admin untuk proses pengisian koin/lisensi: [Hubungi Admin](tg://user?id=${OWNER_ID})`;
  
  try {
    await bot.sendPhoto(chatId, QRIS_URL, { caption: priceText, parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, priceText + `\n\n_(Maaf, gambar QRIS gagal dimuat. Pastikan link QRIS_URL di environment sudah benar.)_`, { parse_mode: 'Markdown' });
  }
});

bot.onText(/\/claimdaily/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const db = await readDB();
  await verifyUser(chatId, msg.from.first_name);
  
  const todayStr = getJakartaDateString();

  if (db.users[chatId].lastDailyClaim === todayStr) {
    return bot.sendMessage(chatId, `*Perhatian*\n\nKamu sudah mengklaim hadiah gratis untuk hari ini. Silakan coba lagi besok untuk klaim berikutnya.`, { parse_mode: 'Markdown' });
  }

  db.users[chatId].points = (db.users[chatId].points || 0) + 10;
  db.users[chatId].lastDailyClaim = todayStr;
  await writeDB(db);

  await bot.sendMessage(chatId, `Klaim berhasil. Saldo kamu telah ditambah sebesar *+10 Poin*. Gunakan dengan bijak.`, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);

  const helpText = `Pusat bantuan dan pengaduan kendala sesi:

Halo! Ada masalah atau kendala dengan sesi email atau akun premium kamu? Silakan jelaskan masalahnya dan tim akan membantu menyelesaikannya.

Sesi email tiba-tiba hilang atau terhapus?
Bot ini berjalan di sistem otomatis Cloud GitHub Engine. Jika server mengalami pemeliharaan (restart), sesi email temporary aktif dapat terputus demi menjaga keamanan privasi.
- Solusi: buat sesi email baru menggunakan perintah /createmailr atau /createmailc.

Masa aktif paket premium berkurang atau ke-reset?
Jika langganan Premium kamu hilang atau berubah menjadi free akibat pemeliharaan server/database:
1. Salin ID Telegram kamu (lihat di menu /profile).
2. Kirim ID tersebut beserta detail kronologi ke Email CS Support resmi kami.
3. Tim teknis akan memeriksa log dan memulihkan sisa jatah premium jika diperlukan.

Surat pengaduan resmi dapat dikirim ke:
- Email CS Support: \`${CS_EMAIL}\`

_Catatan: Kontak Telegram Admin hanya untuk transaksi pembayaran. Untuk komplain teknis atau error, gunakan email CS Support._`;

  try {
    await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {}
});

bot.onText(/\/aboutdev/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);

  const aboutText = `Profil developer bot:

Sistem Mail Gateway ini dirancang dan dioperasikan secara mandiri untuk kebutuhan email sementara.

- Developer utama: \`Emy\`
- Email CS Support: \`${CS_EMAIL}\`

Donasi:
Jika kamu merasa bot ini bermanfaat, kamu dapat memberi dukungan donasi sukarela untuk membantu biaya operasional server:

- Link Saweria: [Saweria Donasi Resmi Emy](${SAWERIA_URL})

_Catatan: Untuk kendala teknis atau error, gunakan email CS Support di atas._`;
  
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
  
  const inlineText = `Deploy system random email:

- Jenis fitur: \`Auto Generated Address\`
- Biaya pemotongan: \`${cost} Poin\`

Silakan konfirmasi pembuatan email acak otomatis dengan menekan tombol di bawah ini.`;

  try {
    await bot.sendMessage(chatId, inlineText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: 'Kirim perintah buat email random', callback_data: 'run_mail_random' }]] }
    });
  } catch (err) {}
});

bot.onText(/\/(createmailc|createc)(?:\s+(.+))?/i, async (msg, match) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name);
  const isAdmin = chatId === String(OWNER_ID);
  const requestedName = match[2] ? match[2].trim().toLowerCase().replace(/[^a-z0-9.]/g, '') : '';

  if (!requestedName) {
    return bot.sendMessage(chatId, `*Format salah*\n\nHarap masukkan nama kustom yang diinginkan setelah perintah. Contoh: \`/CreateMailC emyber\``, { parse_mode: 'Markdown' });
  }

  customNameStorage.set(chatId, requestedName);
  let cost = user.tier.includes('A-Tier') ? 5 : (user.tier.includes('S-Tier') || isAdmin ? 0 : 10);
  
  const inlineText = `Deploy system custom email:

- Pilihan nama: \`${requestedName}\`
- Biaya pemotongan: \`${cost} Poin\`

Silakan konfirmasi pembuatan email kustom dengan menekan tombol di bawah ini.`;

  try {
    await bot.sendMessage(chatId, inlineText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: 'Kirim perintah buat email custom', callback_data: 'run_mail_custom' }]] }
    });
  } catch (err) {}
});

bot.onText(/\/checkinbox/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name); 
  if (!user.activeEmailToken || !user.activeEmail) {
    return bot.sendMessage(chatId, `*Kotak Sesi Kosong*\n\nSesi email kamu terdeteksi kosong atau masa berlakunya sudah habis. Silakan buat sesi baru agar aku bisa cek pesan masuknya.`, { parse_mode: 'Markdown' });
  }
  
  await bot.sendChatAction(chatId, 'typing').catch(()=>{});
  try {
    const res = await apiCall('https://api.mail.tm/messages', { headers: { 'Authorization': `Bearer ${user.activeEmailToken}` } });
    const messages = res.data['hydra:member'];
    if (messages.length === 0) {
      return bot.sendMessage(chatId, `Inbox kosong.\n\nBelum ada pesan atau kode OTP yang masuk ke \`${user.activeEmail}\`. Silakan minta pengirim mengirim ulang dan coba /checkinbox lagi.`, { parse_mode: 'Markdown' });
    }
    const details = await apiCall(`https://api.mail.tm/messages/${messages[0].id}`, { headers: { 'Authorization': `Bearer ${user.activeEmailToken}` } });
    
    const text = `Pesan masuk baru:\n\n- Nama pengirim: ${details.data.from.name || 'Anonim'} <\`${details.data.from.address}\`>\n- Subjek surat: *${details.data.subject || 'Tidak Ada Subjek'}*\n\nIsi pesan / kode OTP:\n\`\`\`text\n${(details.data.text || details.data.intro || '').substring(0, 3000)}\n\`\`\``;

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ *Aduh, Terjadi Kegagalan Sinkronisasi..*\n\nGagal memuat data pesan masuk dari server gateway cloud nih Kak. Tolong coba beberapa saat lagi yaa, maafin aku..`, { parse_mode: 'Markdown' });
  }
});


// Owner-only: setpoint - set user's points to a specific value
bot.onText(/\/setpoint(?:\s+(\d+)\s+(-?\d+))?/i, async (msg, match) => {
  const chatId = String(msg.chat.id).trim();
  const fromId = String(msg.from && msg.from.id).trim();
  if (fromId !== String(OWNER_ID)) return bot.sendMessage(chatId, 'Hanya Owner yang dapat menggunakan perintah ini.');

  if (!match || !match[1] || typeof match[2] === 'undefined') {
    return bot.sendMessage(chatId, 'Usage: /setpoint <userId> <points>');
  }

  const targetId = String(match[1]).trim();
  const points = parseInt(match[2], 10);
  if (Number.isNaN(points)) return bot.sendMessage(chatId, 'Nilai poin tidak valid.');

  const db = await readDB();
  if (!db.users[targetId]) {
    db.users[targetId] = { name: 'Unknown', points: 0 };
  }
  const prevPoints = db.users[targetId].points || 0;
  db.users[targetId].points = points;
  await writeDB(db);
  await appendAuditLog(fromId, 'setpoint', targetId, { points: prevPoints }, { points });
  await bot.sendMessage(chatId, `Poin untuk user ${targetId} telah diset menjadi ${points}.`);
  try {
    await bot.sendMessage(Number(targetId), `Pemberitahuan perubahan poin:\n\n- Sebelumnya: *${prevPoints} poin*\n- Sekarang: *${points} poin*\n\nPerubahan ini dilakukan oleh Owner/Admin. Jika ada kesalahan, hubungi Admin segera.`, { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, `Gagal mengirim notifikasi ke user ${targetId}: ${err.message}`);
  }
});

// Owner-only: settier - set user's tier (optionally with days of expiry)
bot.onText(/\/settier(?:\s+(\d+)\s+(\S+)(?:\s+(\d+))?)?/i, async (msg, match) => {
  const chatId = String(msg.chat.id).trim();
  const fromId = String(msg.from && msg.from.id).trim();
  if (fromId !== String(OWNER_ID)) return bot.sendMessage(chatId, 'Hanya Owner yang dapat menggunakan perintah ini.');

  if (!match || !match[1] || !match[2]) {
    return bot.sendMessage(chatId, 'Usage: /settier <userId> <tierName> [days]');
  }

  const targetId = String(match[1]).trim();
  const tierName = String(match[2]).trim();
  const days = match[3] ? parseInt(match[3], 10) : null;

  const db = await readDB();
  if (!db.users[targetId]) {
    db.users[targetId] = { name: 'Unknown', points: 0 };
  }
  const prevTier = db.users[targetId].tier || null;
  const prevExpiry = db.users[targetId].tierExpiry || null;
  db.users[targetId].tier = tierName;
  if (days && !Number.isNaN(days)) {
    const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    db.users[targetId].tierExpiry = expiry;
  } else {
    db.users[targetId].tierExpiry = null;
  }
  await writeDB(db);
  await appendAuditLog(fromId, 'settier', targetId, { tier: prevTier, tierExpiry: prevExpiry }, { tier: tierName, tierExpiry: db.users[targetId].tierExpiry });
  await bot.sendMessage(chatId, `Tier untuk user ${targetId} telah diset menjadi ${tierName}${days ? ` (selama ${days} hari)` : ''}.`);
  try {
    const expiryText = db.users[targetId].tierExpiry ? `\n- Masa aktif: ${new Date(db.users[targetId].tierExpiry).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}` : '';
    await bot.sendMessage(Number(targetId), `Pemberitahuan perubahan tier:\n\n- Sebelumnya: *${prevTier || 'B-Tier (Standard Free)'}*\n- Sekarang: *${tierName}*${expiryText}\n\nPerubahan ini dilakukan oleh Owner/Admin. Jika ada kesalahan, hubungi Admin segera.`, { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, `Gagal mengirim notifikasi ke user ${targetId}: ${err.message}`);
  }
});

bot.onText(/\/sendmessage(?:\s+(\d+))?/, async (msg, match) => {
  const chatId = String(msg.chat.id).trim();
  const fromId = String(msg.from?.id).trim();
  if (fromId !== String(OWNER_ID)) return bot.sendMessage(chatId, 'Hanya Owner yang dapat menggunakan perintah ini.');

  const text = String(msg.text || '').trim();
  const parts = text.split(' ').slice(1);
  const targetId = parts.shift();
  const messageText = parts.join(' ').trim();

  if (!targetId || !messageText) {
    return bot.sendMessage(chatId, 'Usage: /sendmessage <userId> <message>');
  }

  try {
    await bot.sendMessage(Number(targetId), messageText);
    await bot.sendMessage(chatId, `Pesan berhasil dikirim ke user ${targetId}.`);
  } catch (err) {
    await bot.sendMessage(chatId, `Gagal mengirim pesan ke user ${targetId}: ${err.message}`);
  }
});

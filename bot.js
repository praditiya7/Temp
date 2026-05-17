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
  { command: 'start', description: '🎀 Buka dashboard utama bot kamu' },
  { command: 'profile', description: '👤 Cek saldo poin, tier & status email' },
  { command: 'createmailr', description: '🎲 Buat email acak (Random)' },
  { command: 'createmailc', description: '✍️ Buat email kustom nama kamu' },
  { command: 'checkinbox', description: '📩 Periksa kotak masuk / kode OTP' },
  { command: 'emailactive', description: '⏰ Cek sisa waktu sesi email kamu' },
  { command: 'topuppoint', description: '💳 Topup poin & upgrade tier premium' },
  { command: 'claimdaily', description: '🎁 Klaim bonus 10 poin harian kamu' },
  { command: 'aboutdev', description: '👨‍💻 Informasi Developer & Link Dukungan' },
  { command: 'help', description: '🙋‍♀️ Butuh bantuan? Sesi premium hilang?' },
  { command: 'paneladmin', description: '👑 Menu Rahasia Developer (Owner Only)' } // <-- MENU BARU!
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
      await bot.sendMessage(chatId, `⚠️ *Masa Langganan Habis yaa, Sayang..* Rose sedih banget ih..\n\nHalo Kakak.. Masa paket premium kamu sudah berakhir nih. Status akun kamu otomatis kembali ke B-Tier (Free) yaa. Mau perpanjang lagi biar makin eksklusif? Yuk langsung cek di /topuppoint 💕`, { parse_mode: 'Markdown' });
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
        await bot.sendMessage(chatId, `⏰ *Yah, Email Terhapus Otomatis..*\n\nMasa aktif email temporary kamu sudah habis nih, Kakak Cantik/Ganteng. Aku terpaksa menghapusnya demi keamanan data kamu. Kalau butuh lagi, silakan buat yang baru yaa! Semangat! ✨`, { parse_mode: 'Markdown' });
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
  if (!checkRateLimit(chatId)) return bot.sendMessage(chatId, "⏳ Ih, sabar dong Kakak.. Aku kewalahan nih, tunggu 5 detik yaa~");

  await verifyUser(chatId, msg.from.first_name);
  
  const text = `🎀 *Halo Kakak Sayang! Selamat Datang di Dashboard Utama* 🎀

Aku siap banget nih bantuin kamu buat sediain email temporary yang aman, cepat, dan terpercaya! Yuk lihat fitur-fitur manis yang bisa kamu gunakan:

*✨ Fitur Pembuatan Email Temporary*
🎲 /CreateMailR • Buat Sesi Email Acak (Random)
✍️ /CreateMailC • Buat Sesi Email Kustom Nama Kamu
📥 /CheckInbox • Periksa Kotak Masuk / Kode OTP Kamu
⏰ /EmailActive • Lihat Sisa Waktu Sesi Email Aktif

*👑 Menu Akun & Layanan Premium*
👤 /Profile • Intip Saldo Poin & Level Tier Kamu
💳 /TopupPoint • Isi Koin Poin & Upgrade Premium
🎁 /ClaimDaily • Ambil Hadiah Bonus 10 Poin Harian
🙋‍♀️ /Help • Pusat Bantuan & Pengaduan Sesi Hilang
👨‍💻 /AboutDev • Berkenalan Sama Developer Bot

_Caranya gampang banget, tinggal ketuk salah satu perintah berwarna biru di atas yang kamu butuhkan yaa, Kakak Cantik/Ganteng! Happy deploying~ 💕_`;

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

  const expInfo = user.tierExpiry ? `\n• 📅 *Masa Aktif Premium:* \`${new Date(user.tierExpiry).toLocaleDateString('id-ID')}\`` : '';
  let emailStatusText = 'Belum ada sesi aktif nih, Kak..';
  
  if (user.activeEmail && user.emailExpiry) {
    const diffMs = new Date(user.emailExpiry).getTime() - Date.now();
    if (diffMs > 0) {
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      emailStatusText = `\`${user.activeEmail}\` \n└─ (Sisa waktu: ${diffHours}j ${diffMins}m lagi)`;
    }
  }

  const profileText = `👤 *Metadata Profil Kamu (Estetik & Akurat)*

Halo Kak *${user.name}*, ini adalah detail kartu keanggotaan akun kamu di sistem aku yaa:

• 🆔 *ID Telegram Kamu:* \`${chatId}\`
• 💰 *Saldo Poin Kamu:* *${isAdmin ? 'Bypass (Owner Terkasih ❤️)' : `${user.points} Points`}*
• 👑 *Level Tier Kamu:* \`${isAdmin ? 'S-Tier (Developer Engine)' : user.tier}\`${expInfo}

📊 *Sisa Kuota Pembuatan Hari Ini:*
• ✍️ *Email Kustom:* \`${customLimitText}\`
• 🎲 *Email Acak:* \`${randomLimitText}\`

📥 *Status Sesi Terpasang Saat Ini:*
• 📧 *Alamat Email:* ${emailStatusText}`;

  try { await bot.sendMessage(chatId, profileText, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/emailactive/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name);

  if (!user.activeEmail || !user.emailExpiry) {
    return bot.sendMessage(chatId, `❌ *Duh, Sesi Tidak Ditemukan..*\n\nSaat ini Kakak tidak memiliki sesi email temporary yang aktif nih. Yuk buat dulu lewat menu /createmailr atau /createmailc yaa, cantik!`, { parse_mode: 'Markdown' });
  }

  const diffMs = new Date(user.emailExpiry).getTime() - Date.now();
  if (diffMs <= 0) {
    return bot.sendMessage(chatId, `❌ *Yah, Sesi Baru Saja Habis..*\n\nSesi email temporary kamu barusan banget kedalwarsa Kak. Buruan buat sesi baru lagi gih biar gak ketinggalan OTP-nya!`, { parse_mode: 'Markdown' });
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);

  const waktuHancurTeks = new Date(user.emailExpiry).toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour12: false
  }).replace(/\./g, ':');

  const activeText = `📧 *Detail Sesi Email yang Sedang Aktif*

Ini rincian waktu email kamu, dicatat baik-baik yaa biar gak kelewatan:

• 📬 *Alamat Email:* \`${user.activeEmail}\`
• ⏳ *Sisa Masa Aktif:* \`${diffHours} Jam, ${diffMins} Menit, ${diffSecs} Detik\`
• 💥 *Waktu Hancur Otomatis:* \`${waktuHancurTeks} WIB\`

_💡 Tips Cantik: Selalu ketik /checkinbox secara berkala untuk memicu pembacaan kode OTP atau pesan masuk yang dikirim ke email di atas yaa! 💕_`;

  try { await bot.sendMessage(chatId, activeText, { parse_mode: 'Markdown' }); } catch (err) {}
});

bot.onText(/\/topuppoint/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);
  
  const priceText = `💳 *Store & Topup Center Resmi Emy* 💳

Mau tambah poin atau upgrade akun biar makin powerful? Aku punya pilihan paket menarik dan hemat nih buat Kakak sayang:

💰 *[ 🎁 Pilihan Paket Poin Eceran ]*
• 💎 *10 Poin* • Rp1.500
• 💎 *50 Poin* • Rp6.000 *(Paling Hemat!)*
• 💎 *100 Poin* • Rp10.000 *(Pilihan Best Seller!)*

👑 *[ 🔓 B-Tier ] Standard Free*
• Harga: Rp0 (Gratis Selamanya)
• Masa Aktif Email: 3 Jam | Limit Kustom: 1x / Hari

👑 *[ ✨ A-Tier ] Aero Custom Mail*
• Harga: *Rp11.000* (Masa Aktif 14 Hari)
• Masa Aktif Email: 10 Jam Lumayan Lama!
• Limit Buat: 10x Sesi / Hari
• Keuntungan: Diskon Potongan Biaya Poin Sebesar 50%

👑 *[ 🌌 S-Tier ] Infinite Eclipse*
• Harga: *Rp15.000* (Masa Aktif 30 Hari Luar Biasa!)
• Masa Aktif Email: 24 Jam Penuh Tanpa Mati!
• Keuntungan: Unlimited Sesi & Bisa Bypass Pembuatan walau 0 Poin!

📌 *Langkah Mudah Pembayaran:*
1. Scan QRIS resmi Developer di atas yaa, Kak.
2. Selesaikan pembayaran sesuai nominal paket yang Kakak pilih.
3. Kirimkan foto bukti resi transfer sukses ke kontak Admin Telegram untuk proses pengisian koin/lisensi Kakak: [Hubungi Admin Terkasih](tg://user?id=${OWNER_ID})`;
  
  try {
    await bot.sendPhoto(chatId, QRIS_URL, { caption: priceText, parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, priceText + `\n\n⚠️ _(Duh maaf Kak, gambar QRIS gagal dimuat nih. Pastikan link QRIS_URL di environment sudah benar yaa)_`, { parse_mode: 'Markdown' });
  }
});

bot.onText(/\/claimdaily/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const db = await readDB();
  await verifyUser(chatId, msg.from.first_name);
  
  const todayStr = getJakartaDateString();

  if (db.users[chatId].lastDailyClaim === todayStr) {
    return bot.sendMessage(chatId, `⏰ *Eits, Jangan Serakah Dong Kakak Sayang..* 🤭\n\nKamu kan sudah mengambil jatah bonus hadiah gratis untuk hari ini. Balik lagi besok pagi yaa sayang untuk ambil bonus koin berikutnya. Aku bakal setia nungguin kamu kok! MUAACH~`, { parse_mode: 'Markdown' });
  }

  db.users[chatId].points = (db.users[chatId].points || 0) + 10;
  db.users[chatId].lastDailyClaim = todayStr;
  await writeDB(db);

  await bot.sendMessage(chatId, `🎁 *Horeee! Klaim Hadiah Berhasil!* 🎁\n\nSelamat yaa Kakak Cantik/Ganteng! Saldo dompet koin kamu berhasil ditambahkan sebesar *+10 Poin* secara gratis murni dari aku! Gunakan dengan bijak yaa sayang~ ✨`, { parse_mode: 'Markdown' });
});

bot.onText(/\/help/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);

  const helpText = `🙋‍♀️ *Pusat Bantuan & Pengaduan Kendala Sesi*

Halo Kakak sayang! Ada masalah atau kendala dengan sesi email atau akun premium kamu? Jangan panik atau marah-marah dulu yaa, aku bakal bantu selesaikan kok! 😊

⏰ *Sesi Email Tiba-tiba Hilang / Terhapus?*
Bot kesayangan kamu ini berjalan di sistem otomatis *Cloud GitHub Engine*. Jika server pusat mengalami pemeliharaan (restart rutin), sesi email temporary yang sedang berjalan terpaksa diputus demi menjaga keamanan privasi.
• Solusinya mudah banget, Kakak tinggal buat sesi email baru lagi yaa menggunakan perintah /createmailr atau /createmailc.

👑 *Masa Aktif Paket Premium Berkurang / Ke-reset?*
Jika langganan Premium (A-Tier / S-Tier) Kakak mendadak hilang atau kembali jadi free akibat kendala pemeliharaan database server:
1. Salin **ID Telegram** Kakak (Bisa disalin di menu /profile).
2. Kirimkan nomor ID tersebut beserta detail kronologinya ke Email CS Support resmi kami.
3. Tim teknis kami akan langsung memeriksa data log keuangan dan memulihkan sisa jatah hari premium Kakak secara utuh tanpa potongan!

Surat pengaduan resmi bisa langsung dilayangkan ke:
• 📧 *Email CS Support:* \`${CS_EMAIL}\`

_⚠️ Catatan Penting: Kontak chat Telegram Admin hanya dikhususkan untuk melayani jalur transaksi pembayaran deposit & top up saja ya Kak. Untuk komplain teknis/error wajib lewat jalur email di atas. Terima kasih atas pengertiannya yang baik, sayang! 💕_`;

  try {
    await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {}
});

bot.onText(/\/aboutdev/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  await verifyUser(chatId, msg.from.first_name);

  const aboutText = `👨‍💻 *Profil Manajemen Developer Bot*

Sistem Mail Gateway yang cantik dan minimalis ini dirancang serta dioperasikan secara penuh mandiri untuk mencukupi kebutuhan temporary deployment email kamu sehari-hari.

• 👑 *Developer Utama:* \`Emy\`
• 📧 *Email Hubungan CS Support:* \`${CS_EMAIL}\`

☕ *Donation & Dukungan Semangat*
Kalau Kakak merasa bot buatan aku ini sangat bermanfaat dan membantu pekerjaan kamu, Kakak boleh banget loh memberikan dukungan donasi sukarela demi membantu biaya sewa server cloud biar bot ini tetep hidup dan nyala terus menemani kamu:

• 💝 *Link Saweria:* [Saweria Donasi Resmi Emy](${SAWERIA_URL})

_⚠️ Catatan: Jika ditemukan kendala teknis atau error merugikan pada sistem, silakan layangkan laporan komplain kamu murni melalui Email CS Support di atas yaa Kakak. Terima kasih banyak atas dukungan tulusnya! 🥰_`;
  
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
  
  const inlineText = `🎲 *Deploy System Random Email*

• ✨ *Jenis Fitur:* \`Auto Generated Address\`
• 💸 *Biaya Pemotongan:* \`${cost} Poin\`

_Yuk konfirmasi pembuatan email acak otomatis kamu dengan menekan tombol anggun di bawah ini yaa, Kak!_`;

  try {
    await bot.sendMessage(chatId, inlineText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🚀 Sikat! Deploy Random Email', callback_data: 'run_mail_random' }]] }
    });
  } catch (err) {}
});

bot.onText(/\/(createmailc|createc)(?:\s+(.+))?/i, async (msg, match) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name);
  const isAdmin = chatId === String(OWNER_ID);
  const requestedName = match[2] ? match[2].trim().toLowerCase().replace(/[^a-z0-9.]/g, '') : '';

  if (!requestedName) {
    return bot.sendMessage(chatId, `⚠️ *Aduh Kak, Formatnya Keliru..* 🤭\n\nHarap masukkan nama kustom yang kamu inginkan langsung di sebelah perintah yaa, cantik. Jangan dikosongin ih!\n\nContoh ketikan manis: \`/CreateMailC emyber\``, { parse_mode: 'Markdown' });
  }

  customNameStorage.set(chatId, requestedName);
  let cost = user.tier.includes('A-Tier') ? 5 : (user.tier.includes('S-Tier') || isAdmin ? 0 : 10);
  
  const inlineText = `✍️ *Deploy System Custom Email*

• 🎭 *Pilihan Nama Kamu:* \`${requestedName}\`
• 💸 *Biaya Pemotongan:* \`${cost} Poin\`

_Yuk konfirmasi pembuatan email kustom idaman kamu dengan menekan tombol anggun di bawah ini yaa, Kak!_`;

  try {
    await bot.sendMessage(chatId, inlineText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: [[{ text: '🚀 Sikat! Deploy Custom Email', callback_data: 'run_mail_custom' }]] }
    });
  } catch (err) {}
});

bot.onText(/\/checkinbox/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  const user = await verifyUser(chatId, msg.from.first_name); 
  if (!user.activeEmailToken || !user.activeEmail) {
    return bot.sendMessage(chatId, `❌ *Yahh, Kotak Sesi Kosong..*\n\nSesi email kamu terdeteksi kosong atau masa berlakunya sudah habis nih Kak. Buat baru dulu yuk biar aku bisa cek pesan masuknya!`, { parse_mode: 'Markdown' });
  }
  
  await bot.sendChatAction(chatId, 'typing').catch(()=>{});
  try {
    const res = await apiCall('https://api.mail.tm/messages', { headers: { 'Authorization': `Bearer ${user.activeEmailToken}` } });
    const messages = res.data['hydra:member'];
    if (messages.length === 0) {
      return bot.sendMessage(chatId, `📭 *Inbox Masih Kosong Nih, Kak..*\n\nBelum ada surat atau kiriman kode OTP baru yang masuk ke \`${user.activeEmail}\`. Bersabar sebentar yaa sayang, coba minta pengirim untuk kirim ulang lalu ketik /checkinbox lagi! 💕`, { parse_mode: 'Markdown' });
    }
    const details = await apiCall(`https://api.mail.tm/messages/${messages[0].id}`, { headers: { 'Authorization': `Bearer ${user.activeEmailToken}` } });
    
    const text = `📩 *Hore! Ada Pesan Masuk Baru untuk Kakak!* 📩

• 👤 *Nama Pengirim:* ${details.data.from.name || 'Anonim'} <\`${details.data.from.address}\`>
• 📑 *Subjek Surat:* *${details.data.subject || 'Tidak Ada Subjek'}*

*📝 Isi Pesan / Kode OTP Kamu:*
\`\`\`text
${(details.data.text || details.data.intro || '').substring(0, 3000)}
\`\`\``;

    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, `❌ *Aduh, Terjadi Kegagalan Sinkronisasi..*\n\nGagal memuat data pesan masuk dari server gateway cloud nih Kak. Tolong coba beberapa saat lagi yaa, maafin aku..`, { parse_mode: 'Markdown' });
  }
});


// =============================================================
// NEW: PRIVILEGED INTERACTIVE ADMIN PANEL (MENU KEDUA KHUSUS OWNER)
// =============================================================

// Handler Membuka Panel Utama Admin via Command
bot.onText(/\/paneladmin/i, async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (chatId !== String(OWNER_ID)) {
    return bot.sendMessage(chatId, `🔒 *Akses Ditolak Ketat!* 🤭\n\nIh, Kakak mau ngapain hayo? Menu rahasia dan sakral ini cuma bisa diakses oleh Owner/Developer Developer aja yaa! Kamu gak boleh masuk, wleee~`, { parse_mode: 'Markdown' });
  }
  
  adminSessionStorage.delete(chatId); // Reset sisa sesi input admin
  const panelText = `👑 *Selamat Datang di Control Panel Rahasia Developer* 👑

Halo Bos Emy Cantik! Silakan pilih tindakan manajemen database yang ingin kamu eksekusi hari ini secara praktis lewat tombol di bawah yaa:`;

  try {
    await bot.sendMessage(chatId, panelText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Pengisian / Tambah Poin User', callback_data: 'adm_trigger_point' }],
          [{ text: '👑 Upgrade / Restore Hari Tier Premium', callback_data: 'adm_trigger_tier' }],
          [{ text: '❌ Tutup Menu Panel', callback_data: 'adm_close_panel' }]
        ]
      }
    });
  } catch (err) {}
});

// Listener Membaca Alur Percakapan Teks Bebas khusus Penginputan Admin Panel
bot.on('message', async (msg) => {
  const chatId = String(msg.chat.id).trim();
  if (chatId !== String(OWNER_ID)) return;
  if (

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const axios = require("axios");
const qrcode = require("qrcode-terminal");
require("dotenv").config();

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const sock = makeWASocket({ auth: state, printQRInTerminal: false });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("📌 Scan QR Code untuk menghubungkan bot ke WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      console.log("❌ Bot terputus, mencoba menyambungkan kembali...");
      if (
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      ) {
        startBot();
      } else {
        console.log("⚠️ Anda harus scan QR Code lagi.");
      }
    } else if (connection === "open") {
      console.log("✅ Bot terhubung ke WhatsApp!");
    }
  });

  sock.ev.on("messages.upsert", async (msg) => {
    try {
      const m = msg.messages[0];
      if (!m.message || !m.key.remoteJid || m.key.fromMe) return;

      const sender = m.key.remoteJid;
      const text =
        m.message.conversation || m.message.extendedTextMessage?.text || "";

      console.log(`📩 Pesan dari ${sender}: ${text}`);

      const lowerText = text.toLowerCase();

      if (lowerText === "!menu") {
        const menu =
          "📌 *Menu Bot WhatsApp Islami* 📌\n\n" +
          "🕌 *!shalat* → Cek jadwal shalat\n" +
          "📖 *!hadits* → Hadits harian acak\n" +
          "🙏 *!doa <nama doa>* → Cari doa spesifik\n" +
          "💰 *!zakat <jumlah>* → Kalkulator zakat penghasilan\n\n";

        await sock.sendMessage(sender, { text: menu });
      } else if (lowerText === "!shalat") {
        await sendWithErrorHandler(sock, sender, getPrayerTimes);
      } else if (lowerText === "!hadits") {
        await sendWithErrorHandler(sock, sender, getHadith);
      } else if (lowerText.startsWith("!doa")) {
        const doaQuery = text.replace("!doa", "").trim();
        await sendWithErrorHandler(sock, sender, () => getDoa(doaQuery));
      } else if (lowerText.startsWith("!zakat")) {
        await sock.sendMessage(sender, { text: calculateZakat(text) });
      }
    } catch (error) {
      console.error("❌ Error saat memproses pesan:", error);
    }
  });
}

async function sendWithErrorHandler(sock, sender, callback) {
  try {
    const response = await callback();
    await sock.sendMessage(sender, { text: response });
  } catch (error) {
    console.error("❌ Error saat mengambil data:", error);
    await sock.sendMessage(sender, {
      text: "⚠️ Terjadi kesalahan. Coba lagi nanti.",
    });
  }
}

async function getPrayerTimes() {
  try {
    const response = await axios.get(process.env.PRAYER_API);
    if (!response.data?.data?.timings) throw new Error("Data tidak valid");

    const timings = response.data.data.timings;
    return `🕌 *Jadwal Shalat Hari Ini* 🕌\n\n🌅 Subuh: ${timings.Fajr}\n☀️ Dhuha: ${timings.Sunrise}\n🕌 Dzuhur: ${timings.Dhuhr}\n🌇 Ashar: ${timings.Asr}\n🌆 Maghrib: ${timings.Maghrib}\n🌙 Isya: ${timings.Isha}`;
  } catch (error) {
    throw new Error("❌ Gagal mengambil jadwal shalat.");
  }
}

async function getHadith() {
  try {
    const response = await axios.get(process.env.HADITH_API);
    if (!response.data?.data?.hadiths) throw new Error("Data tidak valid");

    const hadiths = response.data.data.hadiths;
    const randomIndex = Math.floor(Math.random() * hadiths.length);
    const { arab, id } = hadiths[randomIndex];

    return `📖 *Hadits Shahih Hari Ini* 📖\n\n📜 *Sanad:* \n_${arab}_\n\n📖 *Artinya:* \n"${id}"\n\n📚 *HR. ${response.data.data.name}*`;
  } catch (error) {
    throw new Error("❌ Gagal mengambil hadits.");
  }
}

async function getDoa(query) {
  try {
    if (!query) {
      return "🙏 *Gunakan perintah dengan format:* `!doa <nama doa>`\n\nContoh: `!doa tidur`, `!doa makan`";
    }

    const response = await axios.get(process.env.DOA_API);
    if (!Array.isArray(response.data)) throw new Error("Data tidak valid");

    const matchedDoa = response.data.find((doa) =>
      doa.doa.toLowerCase().includes(query.toLowerCase())
    );

    if (!matchedDoa) {
      return `🙏 Doa dengan kata kunci *"${query}"* tidak ditemukan. Coba gunakan kata kunci lain.`;
    }

    return `🙏 *${matchedDoa.doa}* 🙏\n\n📜 _${matchedDoa.ayat}_\n🔤 *Latin*: ${matchedDoa.latin}\n📖 *Arti*: ${matchedDoa.artinya}`;
  } catch (error) {
    throw new Error("❌ Gagal mengambil doa.");
  }
}

function calculateZakat(text) {
  const amount = parseFloat(text.split(" ")[1]);
  if (isNaN(amount) || amount <= 0) {
    return "💰 *Kalkulator Zakat*\n\nKetik: `!zakat <jumlah pendapatan>`\n\nContoh: `!zakat 5000000` untuk menghitung zakat dari Rp5.000.000";
  }
  const zakat = amount * 0.025;
  return `💰 *Kalkulator Zakat*\n\n📌 Pendapatan: Rp${amount.toLocaleString()}\n📌 Zakat (2.5%): Rp${zakat.toLocaleString()}\n\nHarap dikeluarkan untuk mereka yang berhak.`;
}

startBot();

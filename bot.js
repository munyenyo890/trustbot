// bot.js
import axios from "axios";
import { Telegraf } from "telegraf";
import schedule from "node-schedule";
import { GoogleSpreadsheet } from "google-spreadsheet";

// ======== Environment Variables ========
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const CHECK_INTERVAL_MINUTES = process.env.CHECK_INTERVAL_MINUTES || 15;

// Decode Base64 Google Service Account JSON
const CREDENTIALS = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_B64, "base64").toString("utf-8")
);

// ======== Initialize Bot & Sheet ========
const bot = new Telegraf(TELEGRAM_TOKEN);
const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

// ======== Load Google Sheet ========
async function loadSheet() {
  await doc.useServiceAccountAuth(CREDENTIALS);
  await doc.loadInfo();
  const domainSheet = doc.sheetsByTitle["DaftarDomain"];
  const resultSheet = doc.sheetsByTitle["HasilCek"];
  const logSheet = doc.sheetsByTitle["LogRiwayat"];
  return { domainSheet, resultSheet, logSheet };
}

// ======== Ambil daftar domain ========
async function getDomains(domainSheet) {
  await domainSheet.loadCells();
  const rows = await domainSheet.getRows();
  return rows.map(r => r.Domain).filter(Boolean);
}

// ======== Cek domain ========
async function checkDomain(domain) {
  try {
    const res = await axios.get(`https://trustpositif.komdigi.go.id/?domain=${domain}`);
    const html = res.data;

    // parsing sederhana
    if (html.includes("Terdaftar")) return "Terdaftar";
    if (html.includes("Tidak terdeteksi")) return "Tidak terdeteksi";
    return "Error (-)";
  } catch (err) {
    return "Error (-)";
  }
}

// ======== Jalankan pengecekan ========
async function runCheck() {
  try {
    const { domainSheet, resultSheet, logSheet } = await loadSheet();
    const domains = await getDomains(domainSheet);

    const results = [];
    for (const domain of domains) {
      const status = await checkDomain(domain);
      results.push({ domain, status });

      // update HasilCek sheet
      await resultSheet.addRow({ Domain: domain, Status: status, Waktu: new Date().toLocaleString() });
    }

    // update LogRiwayat
    for (const r of results) {
      await logSheet.addRow({ Domain: r.domain, Status: r.status, Waktu: new Date().toLocaleString() });
    }

    // kirim Telegram
    let msg = `📋 Hasil Pengecekan Domain (${new Date().toLocaleString()})\n\n`;
    results.forEach(r => {
      msg += `⚠️ ${r.domain} → ${r.status}\n`;
    });
    await bot.telegram.sendMessage(CHAT_ID, msg);

    console.log("✅ Pengecekan selesai!");
  } catch (err) {
    console.error("❌ Error runCheck:", err);
  }
}

// ======== Schedule pengecekan otomatis ========
schedule.scheduleJob(`*/${CHECK_INTERVAL_MINUTES} * * * *`, () => {
  console.log("⏰ Mulai pengecekan domain...");
  runCheck();
});

// ======== Bot command manual ========
bot.command("ceksekarang", async ctx => {
  await ctx.reply("🚀 Memulai pengecekan sekarang...");
  await runCheck();
  await ctx.reply("✅ Pengecekan selesai!");
});

// ======== Jalankan bot ========
bot.launch().then(() => {
  console.log(`🤖 Bot Telegram aktif!`);
});

// ======== Shutdown gracefully ========
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

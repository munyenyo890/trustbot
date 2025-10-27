// bot.js
import puppeteer from "puppeteer";
import TelegramBot from "node-telegram-bot-api";
import { google } from "googleapis";
import fs from "fs";

// ========================================
// KONFIGURASI
// ========================================
const TELEGRAM_TOKEN = "7819076845:AAF69GceVhJ9p15p2VoHWARKqkx5dk8_Vxg";
const CHAT_ID = "7331623214";
const SPREADSHEET_ID = "1S_SA2ghsa8dYHRk8uoMiMALgCpwm_CzuW-hSJ5wcUj8";
const INTERVAL_MINUTES = 15;

// ========================================
// SETUP GOOGLE SHEET
// ========================================
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(fs.readFileSync("trustbot-credentials.json")),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// ========================================
// TELEGRAM
// ========================================
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ========================================
// BROWSER
// ========================================
let browser;

async function initBrowser() {
  if (browser) return browser;
  console.log("🌐 Membuka browser...");
  browser = await puppeteer.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    ],
  });

  const page = await browser.newPage();
  await page.goto("https://trustpositif.komdigi.go.id/", {
    waitUntil: "domcontentloaded",
  });

  await bot.sendMessage(
    CHAT_ID,
    "🧩 Silakan buka jendela browser dan klik CAPTCHA satu kali (‘Saya bukan robot’). Setelah centang ✅, bot akan berjalan otomatis setiap 15 menit."
  );
  return browser;
}

// ========================================
// BACA DOMAIN DARI SHEET
// ========================================
async function getDomains() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "DaftarDomain!A2:A",
  });
  const rows = res.data.values || [];
  return rows.map((r) => r[0]).filter((x) => x && x.trim() !== "");
}

// ========================================
// CEK DOMAIN
// ========================================
async function checkDomain(browser, domain) {
  try {
    const page = await browser.newPage();
    const url = `https://trustpositif.komdigi.go.id/welcome?domains=${domain}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const bodyText = await page.evaluate(() => document.body.innerText);
    await page.close();

    if (bodyText.includes("Tidak Ada")) {
      return "✅ Tidak Ada (Aman)";
    } else if (bodyText.includes("Diblokir") || bodyText.includes("Terdaftar")) {
      return "🚫 Diblokir (Terdeteksi di TrustPositif)";
    } else {
      return "❓ Tidak Diketahui";
    }
  } catch (err) {
    console.error(`⚠️ Gagal cek ${domain}:`, err.message);
    return "⚠️ Error";
  }
}

// ========================================
// SIMPAN KE SHEET
// ========================================
async function saveToSheet(results, timestamp) {
  // HasilCek
  const values = results.map((r) => [r.domain, r.status, timestamp]);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "HasilCek!A2",
    valueInputOption: "RAW",
    requestBody: { values },
  });

  // LogRiwayat (append)
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: "LogRiwayat!A2",
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

// ========================================
// JALANKAN PENGECEKAN
// ========================================
async function runCheck() {
  const now = new Date().toLocaleString("id-ID");
  console.log(`\n📋 Mulai pengecekan domain (${now})`);

  const browser = await initBrowser();
  const domains = await getDomains();

  const results = [];
  for (const domain of domains) {
    const status = await checkDomain(browser, domain);
    results.push({ domain, status });
  }

  await saveToSheet(results, now);

  // Kirim ke Telegram
  let message = `📋 Hasil Pengecekan Domain (${now})\n\n`;
  for (const { domain, status } of results) {
    const icon = status.startsWith("✅")
      ? "✅"
      : status.startsWith("🚫")
      ? "🚫"
      : "⚠️";
    message += `${icon} ${domain} → ${status}\n`;
  }

  await bot.sendMessage(CHAT_ID, message);
  console.log("📤 Hasil dikirim ke Telegram dan disimpan di Google Sheet.");
}

// ========================================
// TRIGGER MANUAL
// ========================================
bot.onText(/\/ceksekarang/, async () => {
  await bot.sendMessage(CHAT_ID, "🚀 Mengecek domain sekarang...");
  await runCheck();
});

// ========================================
// MULAI OTOMATIS
// ========================================
(async () => {
  await initBrowser();
  await runCheck();
  console.log(`⏰ Bot aktif — cek tiap ${INTERVAL_MINUTES} menit.`);
  setInterval(runCheck, INTERVAL_MINUTES * 60 * 1000);
})();

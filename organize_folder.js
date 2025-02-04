const fs = require("fs");
const path = require("path");

// Asosiy kataloglarni aniqlash
const baseDir = path.join(__dirname, "data/train");
const voicesDir = path.join(baseDir, "voices");
const metadataFile = path.join(baseDir, "metadata.json");

// JSON faylni o'qish
if (!fs.existsSync(metadataFile)) {
  console.error("❌ ERROR: metadata.json topilmadi!");
  process.exit(1);
}

const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf-8"));

// Fayllarni ko'chirish
metadata.forEach((item) => {
  const filePath = item.file_name; // file_name dan foydalanamiz
  const subfolder = path.dirname(filePath); // subfolder nomini ajratamiz
  const fullSubfolderPath = path.join(baseDir, subfolder);
  const sourceFile = path.join(voicesDir, path.basename(filePath));
  const destinationFile = path.join(fullSubfolderPath, path.basename(filePath));

  // Subfolderni yaratish
  if (!fs.existsSync(fullSubfolderPath)) {
    fs.mkdirSync(fullSubfolderPath, { recursive: true });
    console.log(`📁 Subfolder yaratildi: ${fullSubfolderPath}`);
  }

  // Faylni ko'chirish
  if (fs.existsSync(sourceFile)) {
    fs.renameSync(sourceFile, destinationFile);
    console.log(`✅ Fayl ko'chirildi: ${sourceFile} → ${destinationFile}`);
  } else {
    console.warn(`⚠️ Fayl topilmadi: ${sourceFile}`);
  }
});

console.log("✅ Barcha audio fayllar muvaffaqiyatli ko'chirildi!");

const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors"); 
const app = express();
const PORT = 3000;
const csvParser = require("csv-parser");
const { Parser } = require("json2csv");

// JSON fayl yo'li
const JSON_FILE = path.join(__dirname, "train", "metadata.json");

// CSV faylni o'qib, JSON formatiga o'tkazish
const csvToJson = async () => {
    const csvFilePath = path.join(__dirname, "train", "metadata.csv");
    const jsonData = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(csvFilePath)
            .pipe(csvParser())
            .on("data", (data) => {
                // is_correct maydoni uchun default qiymat va tur o'zgartirish
                const converted = {
                    id: parseInt(data.id, 10), // ID raqam sifatida saqlanadi
                    text: data.text, // Matn
                    file_name: data.file_name.startsWith("audio/") ? data.file_name : null, // Audio fayl yo'li
                    is_correct: data.is_correct.toLowerCase() === "true", // Boolean qiymat
                };
                // JSON arrayga qo'shish
                jsonData.push(converted);
            })
            .on("end", () => {
                resolve(jsonData);
            })
            .on("error", (err) => {
                reject(err);
            });
    });
};

// Serverni ishga tushirishdan oldin metadata.json ni tekshirish va yangilash
const initializeJsonFile = async () => {
    if (!fs.existsSync(JSON_FILE) || readJSON().length === 0) {
        console.log("metadata.json mavjud emas yoki bo'sh. CSV dan ma'lumotlar yuklanmoqda...");
        try {
            const jsonData = await csvToJson();
            writeJSON(jsonData);
            console.log("metadata.json muvaffaqiyatli yaratildi!");
        } catch (error) {
            console.error("CSV o'qishda xatolik yuz berdi:", error);
        }
    } else {
        console.log("metadata.json mavjud va ma'lumotlar yuklangan.");
    }
};

// JSON faylni o'qish
const readJSON = () => {
    if (!fs.existsSync(JSON_FILE)) {
        fs.writeFileSync(JSON_FILE, "[]", "utf8");
    }
    const data = fs.readFileSync(JSON_FILE, "utf8");
    return JSON.parse(data);
};

// JSON faylga yozish
const writeJSON = (data) => {
    fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2), "utf8");
};

// Middleware
app.use(bodyParser.json());

app.use(cors());
// Endpointlar

// 1. GET /data - Barcha ma'lumotlarni qaytaradi
app.get("/data", (req, res) => {
    const { page = 1, limit = 10 } = req.query; // Default qiymatlar: page=1, limit=10

    try {
        const data = readJSON();

        // Faqat is_correct false bo'lganlarni filtrlash
        const filteredData = data.filter((item) => item.is_correct === false);

        // Paginationni hisoblash
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;

        const paginatedData = filteredData.slice(startIndex, endIndex);

        res.status(200).json({
            page: parseInt(page, 10),
            limit: parseInt(limit, 10),
            total: filteredData.length,
            totalPages: Math.ceil(filteredData.length / limit),
            data: paginatedData,
        });
    } catch (error) {
        res.status(500).json({ message: "Ma'lumotlarni o'qishda xatolik yuz berdi." });
    }
});

// 2. GET /data/:id - ID bo'yicha ma'lumotni qaytaradi
app.get("/data/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        const data = readJSON();
        const item = data.find((obj) => obj.id === id);

        if (!item) {
            return res.status(404).json({ message: `ID ${id} ga tegishli ma'lumot topilmadi.` });
        }

        res.status(200).json(item);
    } catch (error) {
        res.status(500).json({ message: "Ma'lumotlarni o'qishda xatolik yuz berdi." });
    }
});

// 3. PATCH /data/:id - ID bo'yicha ma'lumotni o'zgartiradi
app.patch("/data/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { is_correct, text } = req.body; // is_correct yoki text orqali o'zgartirish kiritiladi

    if (is_correct === undefined && !text) {
        return res.status(400).json({ 
            message: "Yangi text yoki is_correct maydoni talab qilinadi." 
        });
    }

    try {
        const data = readJSON();
        const updatedData = data.map((item) => {
            if (item.id === id) {
                // is_correct maydonini yangilash
                if (is_correct !== undefined) {
                    item.is_correct = is_correct;
                }

                // text maydonini yangilash
                if (text) {
                    item.text = text;
                }
            }
            return item;
        });

        writeJSON(updatedData);

        res.status(200).json({ 
            message: `ID ${id} uchun ma'lumot muvaffaqiyatli o'zgartirildi.` 
        });
    } catch (error) {
        res.status(500).json({ 
            message: "Ma'lumotlarni o'zgartirishda xatolik yuz berdi." 
        });
    }
});

// 4. DELETE /data/:id - ID bo'yicha ma'lumotni o'chiradi
app.delete("/data/:id", (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        const data = readJSON();
        const updatedData = data.filter((item) => item.id !== id);

        writeJSON(updatedData);
        res.status(200).json({ message: `ID ${id} muvaffaqiyatli o'chirildi.` });
    } catch (error) {
        res.status(500).json({ message: "Ma'lumotlarni o'chirishda xatolik yuz berdi." });
    }
});

// 5. GET /file/:subfolder/:fileName - subfolder va file_name bo'yicha faylni qaytaradi
app.get("/file/:subfolder/:fileName", (req, res) => {
    const { subfolder, fileName } = req.params;
    const filePath = path.join(__dirname, "train", "audio", subfolder, fileName);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath); // Faylni qaytaradi
    } else {
        res.status(404).json({ message: `Fayl ${fileName} subfolder ${subfolder} ichida topilmadi.` });
    }
});

// 6. GET /export-csv - JSON ma'lumotlarni CSV formatida qaytaradi
app.get("/export-csv", (req, res) => {
    try {
        const data = readJSON();

        if (!data.length) {
            return res.status(400).json({ message: "JSON faylda ma'lumot topilmadi." });
        }

        // JSON -> CSV ga o'tkazish
        const fields = Object.keys(data[0]); // CSV ustun nomlarini aniqlash
        const json2csvParser = new Parser({ fields });
        const csvData = json2csvParser.parse(data);

        // CSV faylni vaqtinchalik saqlash
        const csvFilePath = path.join(__dirname, "train", "metadata_export.csv");
        fs.writeFileSync(csvFilePath, csvData, "utf8");

        // Faylni yuklab olish uchun browserga qaytarish
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", "attachment; filename=metadata_export.csv");
        res.send(csvData);
    } catch (error) {
        console.error("CSV yaratishda xatolik:", error);
        res.status(500).json({ message: "CSV yaratishda xatolik yuz berdi." });
    }
});
// Serverni ishga tushirish
// app.listen(PORT, () => {
//     console.log(`Server http://localhost:${PORT} da ishlayapti`);
// });

initializeJsonFile().then(() => {
    app.listen(PORT, () => {
        console.log(`Server http://localhost:${PORT} da ishlayapti`);
    });
});
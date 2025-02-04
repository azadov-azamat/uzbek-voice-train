const { Telegraf, Markup } = require("telegraf");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { Parser } = require("json2csv");

// Bot tokeni
const BOT_TOKEN = "7647522228:AAEBy3H05JdflvZrL99dAy30JQFL2q7aBrU";
const bot = new Telegraf(BOT_TOKEN);

// Fayl yo'llari
const CSV_FILE = path.join(__dirname, "train", "metadata.csv");
const JSON_FILE = path.join(__dirname, "train", "metadata.json");

// CSV dan JSON ga o'tkazish funksiyasi
const convertCSVToJSON = (csvFilePath, jsonFilePath) => {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(csvFilePath)
            .pipe(csv())
            .on("data", (data) => {
                // CSV ma'lumotlarni JSON formatga moslashtirish
                const converted = {
                    id: parseInt(data.id, 10), // ID raqam sifatida saqlanadi
                    text: data.text, // Matn
                    file_name: data.file_name.startsWith("audio/") ? data.file_name : null, // Audio fayl yo'li
                    is_correct: data.is_correct.toLowerCase() === "true", // Boolean qiymat
                };
                results.push(converted);
            })
            .on("end", () => {
                // JSON faylga yozish
                fs.writeFileSync(jsonFilePath, JSON.stringify(results, null, 2), "utf8");
                console.log(`JSON fayl muvaffaqiyatli yaratildi: ${jsonFilePath}`);
                resolve(results);
            })
            .on("error", (err) => {
                console.error("Xatolik yuz berdi:", err);
                reject(err);
            });
    });
};

// JSON faylni o'qish
const readJSON = () => {
    if (!fs.existsSync(JSON_FILE)) {
        fs.writeFileSync(JSON_FILE, "[]", "utf8"); // Agar JSON fayl mavjud bo'lmasa, bo'sh massiv yoziladi
    }
    const data = fs.readFileSync(JSON_FILE, "utf8");
    return JSON.parse(data);
};

// JSON faylga yozish
const writeJSON = (data) => {
    fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2), "utf8");
};

// Foydalanuvchining false qiymatlari va navbati
const clientState = {};

// Start buyrug'i
bot.start(async (ctx) => {
    try {
        if (!fs.existsSync(JSON_FILE) || readJSON().length === 0) {
            // CSV dan JSON ga o'tkazish
            await convertCSVToJSON(CSV_FILE, JSON_FILE);
        }

        ctx.reply(
            "Assalomu alaykum! Datalarni boshqarish uchun tugmalardan foydalaning:",
            Markup.keyboard([
                ["ID orqali topish", "False qiymatlarni to'g'irlash"],
                ["CSV-ni yuklab olish"] // CSV yuklash tugmasi qo'shildi
            ]).resize()
        );
    } catch (error) {
        ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
    }
});
// ID orqali topish tugmasi
bot.hears("ID orqali topish", (ctx) => {
    ctx.reply("Iltimos, ma'lumotni qidirish uchun ID yuboring.");
});

// CSV faylni yuklab olish tugmasi
bot.hears("CSV-ni yuklab olish", (ctx) => {
    try {
        const data = readJSON();

        if (!data || data.length === 0) {
            ctx.reply("JSON faylda hech qanday ma'lumot mavjud emas.");
            return;
        }

        // JSON -> CSV ga o'tkazish
        const fields = Object.keys(data[0]); // Ustun nomlarini aniqlash
        const json2csvParser = new Parser({ fields });
        const csvData = json2csvParser.parse(data);

        // CSV faylni vaqtinchalik saqlash
        const csvFilePath = path.join(__dirname, "train", "metadata.csv");
        fs.writeFileSync(csvFilePath, csvData, "utf8");

        // CSV faylni foydalanuvchiga yuborish
        ctx.replyWithDocument({
            source: csvFilePath,
            filename: "metadata.csv"
        });
    } catch (error) {
        console.error("CSV faylni yaratishda xatolik:", error);
        ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
    }
});

// False qiymatlarni to'g'irlash tugmasi
bot.hears("False qiymatlarni to'g'irlash", async (ctx) => {
    const chatId = ctx.chat.id;
    try {
        const data = readJSON();
        const incorrectData = data.filter((item) => !item.is_correct);

        if (incorrectData.length === 0) {
            ctx.reply("Barcha ma'lumotlar `true` holatda.");
            return;
        }

        clientState[chatId] = { incorrectData, index: 0 };
        sendFalseData(ctx, chatId);
    } catch (error) {
        ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
    }
});

// ID bo'yicha ma'lumotni topish
bot.on("text", async (ctx) => {
    const chatId = ctx.chat.id;
    const id = ctx.message.text;

    // Agar client yangi text kiritayotgan bo'lsa
    if (clientState[chatId] && clientState[chatId].editId) {
        const editId = clientState[chatId].editId;
        const data = readJSON();

        const updatedData = data.map((item) => {
            if (item.id === editId) {
                item.text = id; // Yangi matnni o'rnatish
                item.is_correct = true;
            }
            return item;
        });

        writeJSON(updatedData);

        // O'zgartirish muvaffaqiyatli bo'lgan xabar bilan "Keyingisi" tugmasi
        ctx.reply(
            `ID ${editId} uchun matn muvaffaqiyatli o'zgartirildi!`,
            Markup.inlineKeyboard([
                Markup.button.callback("Keyingisi", `next_${clientState[chatId]?.index + 1 || 0}`)
            ])
        );

        delete clientState[chatId].editId; // Edit holatini o'chirish
        return;
    }

    if (isNaN(id)) {
        ctx.reply("Iltimos, faqat raqamli ID kiriting.");
        return;
    }

    try {
        const data = readJSON();
        const item = data.find((obj) => obj.id === parseInt(id, 10));

        if (!item) {
            ctx.reply(`ID ${id} ga tegishli ma'lumot topilmadi.`);
            return;
        }

        // Audio faylni yuborish
        const audioPath = path.join(__dirname, "train", item.file_name);

        if (!fs.existsSync(audioPath)) {
            ctx.reply(`Audio fayl topilmadi: ${audioPath}`);
            return;
        }

        ctx.replyWithAudio(
            { source: audioPath },
            {
                caption: `ID: ${item.id}\nText: ${item.text}\nIs Correct: ${item.is_correct}`,
                reply_markup: {
                    inline_keyboard: [
                        [Markup.button.callback("True qilish", `correct_${item.id}`)],
                        [Markup.button.callback("Textni o'zgartirish", `edit_${item.id}`)],
                        [Markup.button.callback("O'chirish", `delete_${item.id}`)],
                    ],
                },
            }
        );
    } catch (error) {
        ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
    }
});

// False qiymatlarni birma-bir yuborish
const sendFalseData = (ctx, chatId) => {
    const user = clientState[chatId];
    const { incorrectData, index } = user;
    const item = incorrectData[index];

    if (!item) {
        ctx.reply("Boshqa false qiymat qoldirolmagan.");
        return;
    }

    const audioPath = path.join(__dirname, "train", item.file_name);

    if (!fs.existsSync(audioPath)) {
        ctx.reply(
            `Audio fayl topilmadi: ${audioPath}`,
            Markup.inlineKeyboard([
                Markup.button.callback("Keyingisi", `next_${index + 1}`)
            ])
        );
        return;
    }
    ctx.deleteMessage();
    ctx.replyWithAudio(
        { source: audioPath },
        {
            caption: `ID: ${item.id}\nText: ${item.text}\nIs Correct: ${item.is_correct}`,
            reply_markup: {
                inline_keyboard: [
                    [Markup.button.callback("True qilish", `correct_${item.id}`)],
                    [Markup.button.callback("Textni o'zgartirish", `edit_${item.id}`)],
                    [Markup.button.callback("O'chirish", `delete_${item.id}`)],
                    [Markup.button.callback("Keyingisi", `next_${index + 1}`)],
                ],
            },
        }
    );
};

// Inline tugma - Textni o'zgartirish
bot.action(/^edit_(.+)$/, (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    const chatId = ctx.chat.id;

    clientState[chatId] = { ...clientState[chatId], editId: id };
    ctx.reply(`ID ${id} uchun yangi matnni kiriting:`);
});

// Inline tugma - True qilish
bot.action(/^correct_(.+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    const chatId = ctx.chat.id;

    try {
        const data = readJSON();

        const updatedData = data.map((item) => {
            if (item.id === id) {
                item.is_correct = true; // True holatiga o'zgartirish
            }
            return item;
        });

        writeJSON(updatedData);

        // Delete message and show confirmation with a "Keyingisi" button
        ctx.deleteMessage();
        ctx.reply(
            `ID ${id} muvaffaqiyatli true holatiga o'zgartirildi!`,
            Markup.inlineKeyboard([
                Markup.button.callback("Keyingisi", `next_${clientState[chatId]?.index + 1 || 0}`)
            ])
        );
    } catch (error) {
        ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
    }
});

bot.action(/^next_(.+)$/, (ctx) => {
    const chatId = ctx.chat.id;
    const nextIndex = parseInt(ctx.match[1], 10);

    if (!clientState[chatId]) {
        ctx.reply("Xatolik yuz berdi. Iltimos, boshidan urinib ko'ring.");
        return;
    }

    // Yangilangan index bilan keyingi ma'lumotni yuborish
    clientState[chatId].index = nextIndex;
    sendFalseData(ctx, chatId);
});

// Inline tugma - O'chirish
bot.action(/^delete_(.+)$/, async (ctx) => {
    const id = parseInt(ctx.match[1], 10);
    const chatId = ctx.chat.id;

    try {
        const data = readJSON();

        const updatedData = data.filter((item) => item.id !== id);

        writeJSON(updatedData);

        // Delete message and show confirmation with a "Keyingisi" button
        ctx.deleteMessage();
        ctx.reply(
            `ID ${id} muvaffaqiyatli o'chirildi!`,
            Markup.inlineKeyboard([
                Markup.button.callback("Keyingisi", `next_${clientState[chatId]?.index + 1 || 0}`)
            ])
        );
    } catch (error) {
        ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
    }
});


// Botni ishga tushirish
bot.launch();
console.log("Bot ishga tushdi!");

// Xatoliklarni to'g'rilash uchun sigintni tutish
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));


// const { Telegraf, Markup } = require("telegraf");
// const fs = require("fs");
// const csv = require("csv-parser");
// const fse = require("fs-extra");
// const path = require("path");
// const { exec } = require("child_process");
// const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path; // FFmpeg yo'li

// // Bot tokeni
// const BOT_TOKEN = "7647522228:AAEBy3H05JdflvZrL99dAy30JQFL2q7aBrU"; // O'rnatildi
// const bot = new Telegraf(BOT_TOKEN);

// // CSV fayllar
// const CSV_FILE = path.join(__dirname, "train", "metadata.csv");
// const CSV_COPY_FILE = path.join(__dirname, "train", "metadata_copy.csv");

// // Fayl nusxasini yaratish
// if (!fs.existsSync(CSV_COPY_FILE)) {
//     fse.copySync(CSV_FILE, CSV_COPY_FILE);
// }

// // CSV faylni o'qish
// const readCSV = (filePath) => {
//     return new Promise((resolve, reject) => {
//         const results = [];
//         fs.createReadStream(filePath)
//             .pipe(csv())
//             .on("data", (data) => results.push(data))
//             .on("end", () => resolve(results))
//             .on("error", (err) => reject(err));
//     });
// };

// // CSV faylga yozish
// const writeCSV = (filePath, data) => {
//     const csvData = data.map((row) => `${row.id},${row.text},${row.file_name},${row.is_correct}`).join("\n");
//     fs.writeFileSync(filePath, `id,text,file_name,is_correct\n${csvData}`);
// };

// // Foydalanuvchining false qiymatlari va navbati
// const userState = {};

// // Start buyrug'i
// bot.start((ctx) => {
//     ctx.reply(
//         "Assalomu alaykum! Datalarni boshqarish uchun tugmalardan foydalaning:",
//         Markup.keyboard([["ID orqali topish", "False qiymatlarni to'g'irlash"]]).resize()
//     );
// });

// // ID orqali topish tugmasi
// bot.hears("ID orqali topish", (ctx) => {
//     ctx.reply("Iltimos, ma'lumotni qidirish uchun ID yuboring.");
// });

// // False qiymatlarni to'g'irlash tugmasi
// bot.hears("False qiymatlarni to'g'irlash", async (ctx) => {
//     const chatId = ctx.chat.id;
//     try {
//         const data = await readCSV(CSV_COPY_FILE);
//         const incorrectData = data.filter((item) => item.is_correct === "False");

//         if (incorrectData.length === 0) {
//             ctx.reply("Barcha ma'lumotlar `true` holatda.");
//             return;
//         }

//         userState[chatId] = { incorrectData, index: 0 };
//         sendFalseData(ctx, chatId);
//     } catch (error) {
//         ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
//     }
// });

// // ID bo'yicha ma'lumotni topish
// bot.on("text", async (ctx) => {
//     const chatId = ctx.chat.id;
//     const id = ctx.message.text;

//     if (isNaN(id)) {
//         ctx.reply("Iltimos, faqat raqamli ID kiriting.");
//         return;
//     }

//     try {
//         const data = await readCSV(CSV_COPY_FILE);
//         const item = data.find((obj) => obj.id === id);

//         if (!item) {
//             ctx.reply(`ID ${id} ga tegishli ma'lumot topilmadi.`);
//             return;
//         }

//         // Audio faylni yuborish
//         const audioPath = path.join(__dirname, "train", item.file_name);

//         if (!fs.existsSync(audioPath)) {
//             ctx.reply(`Audio fayl topilmadi: ${audioPath}`);
//             return;
//         }

//         ctx.replyWithAudio(
//             { source: audioPath },
//             {
//                 caption: `ID: ${item.id}\nText: ${item.text}\nIs Correct: ${item.is_correct}`,
//                 reply_markup: {
//                     inline_keyboard: [
//                         [Markup.button.callback("True qilish", `correct_${item.id}`)],
//                         [Markup.button.callback("O'chirish", `delete_${item.id}`)],
//                     ],
//                 },
//             }
//         );
//     } catch (error) {
//         ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
//     }
// });

// // False qiymatlarni birma-bir yuborish
// const sendFalseData = (ctx, chatId) => {
//     const user = userState[chatId];
//     const { incorrectData, index } = user;
//     const item = incorrectData[index];

//     if (!item) {
//         ctx.reply("Boshqa false qiymat qoldirolmagan.");
//         return;
//     }

//     const oggPath = path.join(__dirname, "train", item.file_name);
//     const mp3Path = oggPath.replace(".ogg", ".mp3"); // Mp3 yo'lini aniqlash

//     // Mp3 formatga konvertatsiya qilish
//     exec(`${ffmpegPath} -i "${oggPath}" -c copy "${oggPath}"`, (error) => {
//         if (error) {
//             console.error("Faylni tuzatishda xatolik yuz berdi:", error);
//             ctx.reply("Audio faylni tuzatishda xatolik yuz berdi.");
//             return;
//         }
    
//         // Tiklangan faylni mp3 formatga o‘tkazish
//         exec(`${ffmpegPath} -i "${oggPath}" "${mp3Path}"`, (error) => {
//             if (error) {
//                 console.error("Konvertatsiyada xatolik yuz berdi:", error);
//                 ctx.reply("Audio faylni konvertatsiya qilishda xatolik yuz berdi.");
//                 return;
//             }
    
//             ctx.replyWithAudio(
//                 { source: mp3Path },
//                 {
//                     caption: `ID: ${item.id}\nText: ${item.text}\nIs Correct: ${item.is_correct}`,
//                     reply_markup: {
//                         inline_keyboard: [
//                             [Markup.button.callback("True qilish", `correct_${item.id}`)],
//                             [Markup.button.callback("O'chirish", `delete_${item.id}`)],
//                             [Markup.button.callback("Keyingisi", "next_false")],
//                         ],
//                     },
//                 }
//             );
//         });
//     });
    
// };

// // Inline tugma - True qilish
// bot.action(/^correct_(.+)$/, async (ctx) => {
//     const chatId = ctx.chat.id;
//     const id = ctx.match[1];

//     try {
//         let data = await readCSV(CSV_COPY_FILE);

//         data = data.map((item) => {
//             if (item.id === id && item.is_correct === "False") {
//                 item.is_correct = "True";
//             }
//             return item;
//         });

//         writeCSV(CSV_COPY_FILE, data);

//         ctx.reply(`ID ${id} muvaffaqiyatli true holatiga o'zgartirildi!`);
//     } catch (error) {
//         ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
//     }
// });

// // Inline tugma - O'chirish
// bot.action(/^delete_(.+)$/, async (ctx) => {
//     const chatId = ctx.chat.id;
//     const id = ctx.match[1];

//     try {
//         let data = await readCSV(CSV_COPY_FILE);

//         data = data.filter((item) => item.id !== id);
//         writeCSV(CSV_COPY_FILE, data);
//         ctx.deleteMessage();
//         ctx.reply(`ID ${id} muvaffaqiyatli o'chirildi!`);
//     } catch (error) {
//         ctx.reply("Xatolik yuz berdi. Iltimos, keyinroq urinib ko'ring.");
//     }
// });

// // Inline tugma - Keyingi
// bot.action("next_false", (ctx) => {
//     const chatId = ctx.chat.id;
//     if (!userState[chatId]) {
//         ctx.reply("Birinchi 'False qiymatlarni to'g'irlash' tugmasini bosing.");
//         return;
//     }

//     // Navbatni keyingisiga o'tkazish
//     userState[chatId].index++;
//     sendFalseData(ctx, chatId);
// });

// // Botni ishga tushirish
// bot.launch();
// console.log("Bot ishga tushdi!");

// // Xatoliklarni to'g'rilash uchun sigintni tutish
// process.once("SIGINT", () => bot.stop("SIGINT"));
// process.once("SIGTERM", () => bot.stop("SIGTERM"));


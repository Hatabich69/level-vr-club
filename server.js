require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// ===== Middleware =====
app.use(express.json());
app.use(cors());

// ⚠️ ВАЖЛИВО: тут має бути папка з index.html, styles.css, script.js
// Якщо твій фронт лежить у "FrondEnd", залиш як є.
// Якщо у "public" — заміни на 'public'.
app.use(express.static(path.join(__dirname, 'FrondEnd')));


async function sendTelegram(message) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    };

    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('❌ Telegram error:', err);
  }
}

// ===== WebSocket (Socket.io) =====
io.on('connection', socket => {
  console.log('📡 Admin connected');
  socket.on('disconnect', () => console.log('🔌 Admin disconnected'));
});

// ===== API бронювання =====
app.post('/api/book', async (req, res) => {
  try {
    const { cart, totalPrice, date, time, name, phone, comment } = req.body;

    if (!cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ success: false, message: 'Порожній кошик' });
    }
    if (!date || !time) {
      return res.status(400).json({ success: false, message: 'Оберіть дату та час' });
    }

    const cartLines = cart.map((c, i) =>
      `${i + 1}) ${c.device}, ${c.persons} ос., ${c.duration} год — ${c.price} грн`
    ).join('\n');

    const mailText = `
Нове бронювання Level VR Club:

📅 Дата: ${date}
🕒 Час: ${time}

${cartLines}

💰 Разом: ${totalPrice} грн

👤 Ім'я: ${name || 'не вказано'}
📞 Телефон: ${phone || 'не вказано'}
💬 Коментар: ${comment || '—'}

Створено: ${new Date().toLocaleString('uk-UA')}
IP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}
`.trim();

    // Надсилаємо лист
    await transporter.sendMail({
      from: `"Level VR Club" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_TO,
      subject: `Нове бронювання — ${date} ${time} — ${totalPrice} грн`,
      text: mailText
    });

    // Шлемо в адмін-панель
    io.emit('newBooking', {
      cart,
      totalPrice,
      date,
      time,
      name,
      phone,
      comment
    });

    // Telegram повідомлення
    const tgMsg = `
📢 <b>Нове бронювання Level VR Club</b>

👤 Ім'я: <b>${name || 'не вказано'}</b>
📞 Телефон: ${phone || '—'}
📅 Дата: ${date}
🕒 Час: ${time}
💰 Сума: <b>${totalPrice} грн</b>

🎮 <b>Обрано:</b>
${cart.map((c, i) => `${i + 1}) ${c.device} — ${c.duration} год, ${c.persons} ос. — ${c.price} грн`).join('\n')}

💬 Коментар: ${comment || '—'}

🕓 Створено: ${new Date().toLocaleString('uk-UA')}
`.trim();

    await sendTelegram(tgMsg);

    return res.json({ success: true, message: 'Бронювання відправлено ✅' });
  } catch (err) {
    console.error('❌ Помилка бронювання:', err);
    return res.status(500).json({ success: false, message: 'Помилка сервера' });
  }
});

// ===== Start =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// index.js - BOT PRO VENDEDOR FINAL 🔥

import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import pino from "pino";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

dotenv.config();

const logger = pino({ level: "silent" });
const USER_DATA_DIR = "./user_data";
await fs.mkdir(USER_DATA_DIR, { recursive: true }).catch(() => {});

// 📦 PRODUCTOS (CORREGIDO)
const productos = {
    "1": { nombre: "Lavadora portátil", precio: 8 },
    "2": { nombre: "Selladora al vacío portátil", precio: 28 },
    "3": { nombre: "Faja moldeadora de papada", precio: 8 },
    "4": { nombre: "Masajeador eléctrico corporal", precio: 15 }
};

const ASESOR_JID = "593979108339@s.whatsapp.net";

// 🤖 OPENAI
if (!process.env.OPENAI_API_KEY) {
    console.error("❌ Falta OPENAI_API_KEY");
    process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🧠 PROMPT VENDEDOR PRO (CORREGIDO)
const SYSTEM_PROMPT = `
Eres un vendedor experto de Minegoc8.

Productos (precios FIJOS):
1 Lavadora portátil $8
2 Selladora al vacío portátil $28
3 Faja moldeadora de papada $8
4 Masajeador $15

Reglas:
- No inventes precios
- Responde corto y claro
- Siempre intenta cerrar la venta
- La faja es SOLO para moldear la papada (rostro), NO el cuerpo

Envíos:
- Hacemos envíos a varias ciudades del país
- Contraentrega SOLO disponible en Quito
- Para otras ciudades el pago es previo

Ubicación SOLO si la piden:
Centro Histórico Quito, Benalcázar y Manabí

IMPORTANTE:
- Si el cliente quiere comprar → [COMPRA:X]
- Si pregunta por envío → [ENVIO]
`;

// 📁 MEMORIA
async function loadUserState(jid) {
    const file = path.join(USER_DATA_DIR, `${jid.split("@")[0]}.json`);
    try {
        return JSON.parse(await fs.readFile(file, "utf-8"));
    } catch {
        return { history: [], selectedProduct: null, step: "menu" };
    }
}

async function saveUserState(jid, state) {
    const file = path.join(USER_DATA_DIR, `${jid.split("@")[0]}.json`);
    await fs.writeFile(file, JSON.stringify(state, null, 2));
}

// 📲 ENVIAR AL ASESOR
async function enviarAsesor(sock, from, texto, extra) {
    const numero = from.split("@")[0];

    await sock.sendMessage(ASESOR_JID, {
        text: `🔥 NUEVO CLIENTE

📞 +${numero}
🧾 Info: ${extra}
💬 Mensaje: ${texto}

👉 https://wa.me/${numero}`
    });
}

// 🤖 IA
async function responderIA(sock, from, text, state) {

    if (state.history.length > 10) {
        state.history = state.history.slice(-10);
    }

    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...state.history,
        { role: "user", content: text }
    ];

    const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages
    });

    let respuesta = res.choices[0].message.content || "";

    const compra = respuesta.match(/\[COMPRA:(\d)\]/);
    const envio = respuesta.includes("[ENVIO]");

    if (compra) {
        const id = compra[1];
        const prod = productos[id]?.nombre;

        await enviarAsesor(sock, from, text, `Quiere comprar → ${prod}`);

        state.step = "comprando";
        state.selectedProduct = id;
    }

    if (envio) {
        await enviarAsesor(sock, from, text, "Pregunta sobre envío");
    }

    respuesta = respuesta.replace(/\[.*?\]/g, "").trim();

    state.history.push({ role: "user", content: text });
    state.history.push({ role: "assistant", content: respuesta });

    await saveUserState(from, state);

    return respuesta || "Te ayudo con gusto 😊";
}

// 🚀 BOT
async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger
    });

    sock.ev.on("connection.update", (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            console.log("📱 ESCANEA ESTE QR:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            console.log("✅ BOT CONECTADO");
        }

        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) {
                console.log("🔁 Reconectando...");
                setTimeout(startBot, 3000);
            }
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        const cleanText = text.trim().toLowerCase();
        if (!cleanText) return;

        let state = await loadUserState(from);

        // 🟢 MENÚ
        if (["hola","menu","menú","inicio"].some(x => cleanText.includes(x))) {

            await sock.sendMessage(from, {
                text: `👋 Bienvenido a Minegoc8

1️⃣ Lavadora portátil $8
2️⃣ Selladora al vacío $28
3️⃣ Faja papada $8
4️⃣ Masajeador $15

Escribe el número o escribe *asesor*`
            });

            return;
        }

        // 👨‍💼 ASESOR
        if (cleanText.includes("asesor")) {
            await enviarAsesor(sock, from, cleanText, "Cliente pide asesor");

            await sock.sendMessage(from, {
                text: "Un asesor te escribirá en breve 📞"
            });
            return;
        }

        // 📦 SELECCIÓN
        if (/^[1-4]$/.test(cleanText)) {
            const p = productos[cleanText];

            state.selectedProduct = cleanText;

            await sock.sendMessage(from, {
                text: `✨ ${p.nombre} - $${p.precio}

¿Te lo reservo? Escríbeme *comprar* 😏`
            });

            await saveUserState(from, state);
            return;
        }

        // 🛒 COMPRA
        if (cleanText.includes("comprar")) {

            state.step = "comprando";

            await sock.sendMessage(from, {
                text: `Perfecto 😎

Envíame:
Nombre
Dirección
Teléfono`
            });

            await saveUserState(from, state);
            return;
        }

        // 📦 DATOS
        if (state.step === "comprando" && cleanText.length > 10) {

            const prod = productos[state.selectedProduct]?.nombre || "Producto";

            await enviarAsesor(sock, from, cleanText, `PEDIDO FINAL → ${prod}`);

            await sock.sendMessage(from, {
                text: "✅ Pedido enviado. Te contactamos enseguida 🚚"
            });

            state.step = "menu";
            await saveUserState(from, state);
            return;
        }

        // 🤖 IA
        const respuesta = await responderIA(sock, from, cleanText, state);

        await sock.sendMessage(from, { text: respuesta });
    });
}

startBot();
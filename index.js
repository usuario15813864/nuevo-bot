// BOT SIMPLE - FAJA DE PAPADA 🔥

import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
import makeWASocket, {
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import pino from "pino";
import OpenAI from "openai";

dotenv.config();

const logger = pino({ level: "silent" });

// ⚠️ ASESOR (SIN +)
const ASESOR_JID = "593979108339@s.whatsapp.net";

// 🤖 OPENAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 🧠 PROMPT SIMPLE Y CLARO
const SYSTEM_PROMPT = `
Eres un vendedor experto.

Producto: faja moldeadora de papada ($8)

Reglas:
- Responde corto
- Explica beneficios: reduce papada, mejora apariencia
- No inventar nada

Envío:
- Quito: pago contraentrega
- Otras ciudades: pago previo + envío

IMPORTANTE:
- Si el cliente quiere comprar o pide info → responde con [ASESOR]
`;

// 🔥 DETECTAR INTENCIÓN DE COMPRA
function detectarCompra(texto) {
    texto = texto.toLowerCase();
    return [
        "precio",
        "vale",
        "cuanto",
        "cuánto",
        "quiero",
        "me interesa",
        "comprar",
        "info",
        "informacion"
    ].some(p => texto.includes(p));
}

// 📲 ENVIAR AL ASESOR
async function enviarAsesor(sock, msg, texto) {

    let jid = msg.key.remoteJid;

    if (!jid || !jid.endsWith("@s.whatsapp.net")) return;

    const numero = jid.replace("@s.whatsapp.net", "");
    const nombre = msg.pushName || "Cliente";

    console.log("📤 ENVIANDO AL ASESOR:", numero);

    await sock.sendMessage(ASESOR_JID, {
        text: `🔥 CLIENTE INTERESADO

👤 ${nombre}
📞 +${numero}
💬 ${texto}

👉 https://wa.me/${numero}`
    });
}

// 🤖 RESPUESTA IA
async function responderIA(text) {

    const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text }
        ],
        temperature: 0.7
    });

    let respuesta = res.choices[0].message.content || "";

    const asesor = respuesta.includes("[ASESOR]");

    return {
        texto: respuesta.replace(/\[ASESOR\]/g, "").trim(),
        enviarAsesor: asesor
    };
}

// 🚀 BOT
async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: true
    });

    sock.ev.on("connection.update", (update) => {
        if (update.connection === "open") {
            console.log("✅ BOT CONECTADO");
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        let jid = msg.key.remoteJid;
        if (!jid || jid.endsWith("@g.us")) return;

        const from = jid;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        const cleanText = text.trim().toLowerCase();
        if (!cleanText) return;

        // 🤖 IA RESPONDE
        const ia = await responderIA(cleanText);

        await sock.sendMessage(from, { text: ia.texto });

        // 🔥 SI DETECTA COMPRA → ENVÍA AL ASESOR
        if (ia.enviarAsesor || detectarCompra(cleanText)) {
            await enviarAsesor(sock, msg, cleanText);
        }
    });
}

startBot();

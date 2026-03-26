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

// ⚠️ ASESOR
const ASESOR_NUMERO = "593979108339"; 
const ASESOR_JID = `${ASESOR_NUMERO}@s.whatsapp.net`;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 🧠 PROMPT
const SYSTEM_PROMPT = `
Eres vendedor de una faja de papada ($8).

- Beneficios: reduce papada, mejora apariencia
- Quito: contraentrega
- Provincias: pago previo

Si quiere comprar o info envia al asesor
`;

function detectarCompra(texto) {
    texto = texto.toLowerCase();
    return [
        "precio","cuanto","cuánto","vale",
        "quiero","me interesa","comprar","info"
    ].some(p => texto.includes(p));
}

// 🔥 ENVÍO AL ASESOR (VERSIÓN SEGURA)
async function enviarAsesor(sock, msg, texto) {

    try {
        let jid = msg.key.remoteJid;

        if (!jid) return;

        const numero = jid.replace("@s.whatsapp.net", "");
        const nombre = msg.pushName || "Cliente";

        console.log("📤 Intentando enviar al asesor...");

        // ✅ Verificar número
        const [result] = await sock.onWhatsApp(ASESOR_NUMERO);

        if (!result || !result.exists) {
            console.log("❌ El número del asesor no existe en WhatsApp");
            return;
        }

        const asesorJidReal = result.jid;

        await sock.sendMessage(asesorJidReal, {
            text: `🔥 CLIENTE INTERESADO

👤 ${nombre}
📞 +${numero}
💬 ${texto}

👉 https://wa.me/${numero}`
        });

        console.log("✅ ENVIADO AL ASESOR CORRECTAMENTE");

    } catch (error) {
        console.log("❌ ERROR ENVIANDO AL ASESOR:", error);
    }
}

// 🤖 IA
async function responderIA(text) {

    const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text }
        ]
    });

    return res.choices[0].message.content;
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

        if (!text) return;

        const cleanText = text.trim().toLowerCase();

        // 🤖 RESPUESTA
        const respuesta = await responderIA(cleanText);

        await sock.sendMessage(from, { text: respuesta });

        // 🔥 SI HAY INTENCIÓN → ENVÍA AL ASESOR
        if (detectarCompra(cleanText)) {
            await enviarAsesor(sock, msg, cleanText);
        }
    });
}

startBot();

// index.js - BOT PRO VENDEDOR FINAL 🔥 FULL CORREGIDO

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

// 📦 PRODUCTOS
const productos = {
    "1": { nombre: "Lavadora portátil", precio: 8 },
    "2": { nombre: "Selladora al vacío portátil", precio: 28 },
    "3": { nombre: "Faja moldeadora de papada", precio: 8 },
    "4": { nombre: "Masajeador eléctrico corporal", precio: 15 }
};

const ASESOR_JID = "593979108339@s.whatsapp.net";

// 🤖 OPENAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🧠 PROMPT
const SYSTEM_PROMPT = `
Eres un vendedor experto de Minegoc8.

Productos:
1 Lavadora portátil $8
2 Selladora al vacío portátil $28
3 Faja moldeadora de papada $8
4 Masajeador $15

Reglas:
- No inventes precios
- Responde corto
- Cierra ventas
- La faja es SOLO para papada

Envíos:
- Envíos a todo el país
- Contraentrega SOLO en Quito
- Otras ciudades pago previo

IMPORTANTE:
- Si quiere comprar → [COMPRA:X]
- Si pregunta envío → [ENVIO]
`;

// 🔍 DETECTAR PRODUCTO
function detectarProducto(texto) {
    texto = texto.toLowerCase();
    if (texto.includes("faja")) return "3";
    if (texto.includes("selladora")) return "2";
    if (texto.includes("lavadora")) return "1";
    if (texto.includes("masajeador")) return "4";
    return null;
}

// 📁 MEMORIA
async function loadUserState(jid) {
    const file = path.join(USER_DATA_DIR, `${jid.split("@")[0]}.json`);
    try {
        return JSON.parse(await fs.readFile(file, "utf-8"));
    } catch {
        return { history: [], selectedProduct: null, step: "menu", telefono: null };
    }
}

async function saveUserState(jid, state) {
    const file = path.join(USER_DATA_DIR, `${jid.split("@")[0]}.json`);
    await fs.writeFile(file, JSON.stringify(state, null, 2));
}

// 📲 ENVIAR AL ASESOR
async function enviarAsesor(sock, msg, texto, extra, state) {

    let jid = msg.key.remoteJid;

    // 🚫 Ignorar LID
    if (jid.includes("@lid")) return;

    if (!jid.endsWith("@s.whatsapp.net")) return;

    const numero = jid.replace("@s.whatsapp.net", "");

    const nombre = msg.pushName || "Cliente";
    const producto = productos[state.selectedProduct]?.nombre || "No definido";
    const telefonoConfirmado = state.telefono || "No proporcionado";

    await sock.sendMessage(ASESOR_JID, {
        text: `🔥 CLIENTE REAL

👤 ${nombre}
📞 WhatsApp: +${numero}
📲 Tel confirmado: ${telefonoConfirmado}
🛒 ${producto}
🧾 ${extra}
💬 ${texto}

👉 https://wa.me/${numero}`
    });
}

// 🤖 IA
async function responderIA(sock, msg, text, state) {

    const detectado = detectarProducto(text);
    if (detectado) state.selectedProduct = detectado;

    const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        ...state.history,
        { role: "user", content: text }
    ];

    const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7
    });

    let respuesta = res.choices[0].message.content || "";

    const compra = respuesta.match(/\[COMPRA:(\d)\]/);
    const envio = respuesta.includes("[ENVIO]");

    if (compra) {
        state.selectedProduct = compra[1];
        state.step = "comprando";
        await enviarAsesor(sock, msg, text, "Quiere comprar", state);
    }

    if (envio) {
        await enviarAsesor(sock, msg, text, "Consulta envío", state);
    }

    respuesta = respuesta.replace(/\[.*?\]/g, "").trim();

    state.history.push({ role: "user", content: text });
    state.history.push({ role: "assistant", content: respuesta });

    await saveUserState(msg.key.remoteJid, state);

    return respuesta || "Te ayudo con gusto 😊";
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
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            console.log("📱 ESCANEA QR:");
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            console.log("✅ BOT CONECTADO");
        }

        if (connection === "close") {
            const reconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

            if (reconnect) setTimeout(startBot, 3000);
        }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        let jid = msg.key.remoteJid;

        // 🚫 Ignorar LID
        if (jid.includes("@lid")) return;

        if (jid.endsWith("@g.us")) return;

        const from = jid;

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            "";

        const cleanText = text.trim().toLowerCase();
        if (!cleanText) return;

        let userState = await loadUserState(from);

        const detectado = detectarProducto(cleanText);
        if (detectado) userState.selectedProduct = detectado;

        // 🟢 MENÚ
        if (["hola","menu","menú","inicio"].some(x => cleanText.includes(x))) {
            await sock.sendMessage(from, {
                text: `👋 Bienvenido a Minegoc8

1️⃣ Lavadora $8
2️⃣ Selladora $28
3️⃣ Faja papada $8
4️⃣ Masajeador $15

Escribe el número o *asesor*`
            });
            return;
        }

        // 👨‍💼 ASESOR
        if (cleanText.includes("asesor")) {
            await enviarAsesor(sock, msg, cleanText, "Pidió asesor", userState);
            await sock.sendMessage(from, {
                text: "Un asesor te escribirá enseguida 📞"
            });
            return;
        }

        // 📦 SELECCIÓN
        if (/^[1-4]$/.test(cleanText)) {
            const p = productos[cleanText];
            userState.selectedProduct = cleanText;

            await sock.sendMessage(from, {
                text: `✨ ${p.nombre} - $${p.precio}

¿Te lo reservo? Escribe *comprar* 😏`
            });

            await saveUserState(from, userState);
            return;
        }

        // 🛒 COMPRA
        if (cleanText.includes("comprar")) {

            userState.step = "pidiendo_datos";

            await sock.sendMessage(from, {
                text: `Perfecto 😎

Envíame:
Nombre
Dirección
Número de teléfono 📞`
            });

            await saveUserState(from, userState);
            return;
        }

        // 📲 CAPTURAR TELÉFONO
        if (userState.step === "pidiendo_datos") {

            const telefonoDetectado = cleanText.match(/09\d{8}/);

            if (telefonoDetectado) {
                userState.telefono = telefonoDetectado[0];
                userState.step = "confirmado";

                await sock.sendMessage(from, {
                    text: `✅ Pedido confirmado

En breve te contactamos 🚚`
                });

                await enviarAsesor(sock, msg, cleanText, "PEDIDO FINAL", userState);

                await saveUserState(from, userState);
                return;
            } else {
                await sock.sendMessage(from, {
                    text: "Por favor envía un número válido 📞 (ej: 0987654321)"
                });
                return;
            }
        }

        // 🤖 IA
        const respuesta = await responderIA(sock, msg, cleanText, userState);
        await sock.sendMessage(from, { text: respuesta });
    });
}

startBot();
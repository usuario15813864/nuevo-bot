// index.js - BOT FINAL ESTABLE 🔥

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

// ⚠️ SIN +
const ASESOR_JID = "593979108339@s.whatsapp.net";

// 🤖 OPENAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🧠 PROMPT CONTROLADO
const SYSTEM_PROMPT = `
Eres un vendedor experto de Minegoc8.

PRODUCTOS:
1 Lavadora portátil $8
2 Selladora al vacío portátil $28
3 Faja moldeadora de papada $8
4 Masajeador $15

REGLAS:
- Responde corto, claro y directo
- NO inventes información
- NO menciones ciudades que no sean Quito
- La faja es SOLO para papada

ENVÍOS:
- si realizamos envios
- Pago contraentrega solo quito
-otras provincias pago pyevio
VENTAS:
- Si el cliente muestra interés o dice "sí", "quiero", "me interesa" → responde con [COMPRA:X]
- X es el número del producto

- Si pregunta por envío → [ENVIO]

PROHIBIDO:
- Inventar condiciones
- Dar información no definida
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

// 📲 ENVIAR AL ASESOR (FORZADO)
async function enviarAsesor(sock, msg, texto, extra, state) {

    let jid = msg.key.remoteJid;

    if (!jid || !jid.endsWith("@s.whatsapp.net")) {
        console.log("❌ JID inválido:", jid);
        return;
    }

    const numero = jid.replace("@s.whatsapp.net", "");

    console.log("📤 ENVIANDO AL ASESOR:", numero);

    const nombre = msg.pushName || "Cliente";
    const producto = productos[state.selectedProduct]?.nombre || "No definido";
    const telefono = state.telefono || "No enviado";

    try {
        await sock.sendMessage(ASESOR_JID, {
            text: `🔥 CLIENTE NUEVO

👤 ${nombre}
📞 WhatsApp: +${numero}
📲 Tel confirmado: ${telefono}
🛒 ${producto}
🧾 ${extra}
💬 ${texto}

👉 https://wa.me/${numero}`
        });

        console.log("✅ ENVIADO CORRECTO");

    } catch (err) {
        console.log("❌ ERROR AL ENVIAR:", err);
    }
}

// 🤖 IA
async function responderIA(text, state) {

    const detectado = detectarProducto(text);
    if (detectado) state.selectedProduct = detectado;

    const res = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text }
        ]
    });

    let respuesta = res.choices[0].message.content || "";

    const compra = respuesta.match(/\[COMPRA:(\d)\]/);
    if (compra) {
        state.selectedProduct = compra[1];
        state.step = "pidiendo_datos";
    }

    return respuesta.replace(/\[.*?\]/g, "").trim();
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

        let stateUser = await loadUserState(from);

        // 🔥 DETECTAR PRODUCTO
        const detectado = detectarProducto(cleanText);
        if (detectado) stateUser.selectedProduct = detectado;

        // 🔥 DETECTAR COMPRA MANUAL
        if (
            ["si","sí","quiero","me interesa","lo quiero","comprar"].some(p =>
                cleanText.includes(p)
            ) &&
            stateUser.selectedProduct
        ) {
            stateUser.step = "pidiendo_datos";

            await sock.sendMessage(from, {
                text: `Perfecto 😎

Envíame:
Nombre
Dirección en Quito
Número 📞`
            });

            await enviarAsesor(sock, msg, cleanText, "QUIERE COMPRAR", stateUser);
            await saveUserState(from, stateUser);
            return;
        }

        // 📲 CAPTURAR DATOS
        if (stateUser.step === "pidiendo_datos") {

            const telefonoDetectado = cleanText.match(/09\d{8}/);

            if (telefonoDetectado) {

                stateUser.telefono = telefonoDetectado[0];
                stateUser.step = "finalizado";

                await sock.sendMessage(from, {
                    text: "✅ Pedido confirmado 🚚"
                });

                await enviarAsesor(sock, msg, cleanText, "PEDIDO FINAL", stateUser);
                await saveUserState(from, stateUser);
                return;
            } else {
                await sock.sendMessage(from, {
                    text: "Envíame un número válido 📞"
                });
                return;
            }
        }

        // 🟢 MENÚ
        if (["hola","menu","menú"].includes(cleanText) && !stateUser.selectedProduct) {
            await sock.sendMessage(from, {
                text: `👋 Bienvenido

1️⃣ Lavadora $8
2️⃣ Selladora $28
3️⃣ Faja papada $8
4️⃣ Masajeador $15`
            });
            return;
        }

        // 📦 SELECCIÓN
        if (/^[1-4]$/.test(cleanText)) {
            const p = productos[cleanText];
            stateUser.selectedProduct = cleanText;

            await sock.sendMessage(from, {
                text: `✨ ${p.nombre} $${p.precio}

¿Lo deseas comprar? 😏`
            });

            await saveUserState(from, stateUser);
            return;
        }

        // 🤖 IA
        const respuesta = await responderIA(cleanText, stateUser);
        await sock.sendMessage(from, { text: respuesta });
    });
}

startBot();

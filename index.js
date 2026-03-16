console.log("🚀 BOT ARRANCANDO EN SERVIDOR");
// index.js
import dotenv from "dotenv";
dotenv.config();

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import OpenAI from "openai";

const logger = pino({ level: "silent" });
const userStates = new Map();

// Productos disponibles
const productos = {
    "1": { nombre: "Lavadora portátil ", precio: 8, descripcion: "Compacta, bajo consumo" },
    "2": { nombre: "Selladora al vacío portátil", precio: 28, descripcion: "Conserva alimentos frescos" },
    "3": { nombre: "Faja modeladora reductora", precio: 8, descripcion: "Compresión cómoda" },
    "4": { nombre: "Masajeador eléctrico corporal", precio: 15, descripcion: "Alivio muscular" }
};

// JID del asesor que recibirá los pedidos
const ASESOR_JID = "593979108339@s.whatsapp.net";

// Inicializar cliente de OpenAI
if (!process.env.OPENAI_API_KEY) {
    console.error("❌ Falta OPENAI_API_KEY en el archivo .env");
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `
Eres un asistente amable de Minegoc8. 
Productos disponibles: lavadora $8, selladora $28, faja $8, masajeador $15,fundas para selladora al vacio el precio depende de el tamaño de la funda.
Si preguntan por comprar → di: "Escribe *menú* y el número del producto (1-4) 😊"

Cuando el usuario pregunte por la ubicación, dirección o dónde estamos, responde exactamente:
"Estamos ubicados en el Centro Histórico de Quito, calle Benalcázar y Manabí."

Responde corto, claro y en español. No inventes otras direcciones.
`;
async function startBot(reconnectDelay = 2000) {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: true,
        browser: ["Chrome", "Windows", "10"],
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    // Conexión y QR
    sock.ev.on("connection.update", async (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === "open") console.log("✅ BOT CONECTADO");
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(() => startBot(reconnectDelay * 2), reconnectDelay);
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // Mensaje entrante
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
        const mensaje = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Crear estado si es primer contacto
        if (!userStates.has(from)) {
            userStates.set(from, { step: "menu" });
            await sock.sendMessage(from, { text: 
`¡Hola! 👋 Bienvenido a Minegoc8
Productos disponibles:
1 Lavadora $8
2 Selladora $28
3 Faja $8
4 Masajeador $15

Escribe el número para ver detalles` 
            });
            return;
        }

        let state = userStates.get(from);

        // Menú y selección de producto
        if (["hola","menu","menú","inicio"].some(w => mensaje.includes(w)) || /^[1-4]$/.test(mensaje)) {
            if (/^[1-4]$/.test(mensaje)) {
                const prod = productos[mensaje];
                state.step = "producto";
                state.selectedProduct = mensaje;
                await sock.sendMessage(from, { text: 
`✨ *${prod.nombre}* - $${prod.precio}
${prod.descripcion}

Escribe *comprar* para continuar` });
            } else {
                state.step = "menu";
                await sock.sendMessage(from, { text: 
`Productos disponibles:
1 Lavadora $8
2 Selladora $28
3 Faja $8
4 Masajeador $15

Elige número` });
            }
            userStates.set(from, state);
            return;
        }

        // Flujo de compra
        if (["comprar","pedir","quiero"].some(w => mensaje.includes(w)) || state.step === "comprando") {
            if (state.step === "producto") {
                state.step = "comprando";
                const prod = productos[state.selectedProduct];
                await sock.sendMessage(from, { text: "Envía: nombre, dirección, teléfono" });
            } else if (state.step === "comprando" && text.length > 10) {
                const prod = productos[state.selectedProduct];
                const cliente = from.split("@")[0];
                await sock.sendMessage(ASESOR_JID, { text: `PEDIDO: ${prod.nombre} $${prod.precio}\nCliente: +${cliente}\nDatos: ${text}` });
                await sock.sendMessage(from, { text: "¡Pedido recibido! El asesor te contactará pronto" });
                state.step = "menu";
            }
            userStates.set(from, state);
            return;
        }

        // Cualquier otra pregunta → OpenAI
        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: text }
                ]
            });
            await sock.sendMessage(from, { text: completion.choices[0].message.content });
        } catch (err) {
            console.error("Error al llamar a OpenAI:", err.message);
            await sock.sendMessage(from, { text: "Ups... intenta *menú*" });
        }
    });
}

startBot().catch(err => console.error(err));
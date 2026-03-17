// index.js
console.log("🚀 BOT ARRANCANDO");

import dotenv from "dotenv";
dotenv.config();

import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";
import pino from "pino";
import OpenAI from "openai";

const logger = pino({ level: "silent" });
const userStates = new Map();

// Productos disponibles
const productos = {
    "1": { nombre: "Lavadora portátil", precio: 8, descripcion: "Compacta, bajo consumo, ideal para departamentos pequeños" },
    "2": { nombre: "Selladora al vacío portátil", precio: 28, descripcion: "Conserva alimentos frescos por más tiempo" },
    "3": { nombre: "Faja modeladora reductora", precio: 8, descripcion: "Compresión cómoda y discreta" },
    "4": { nombre: "Masajeador eléctrico corporal", precio: 15, descripcion: "Alivio muscular y relajación inmediata" }
};

// JID del asesor que recibirá los pedidos
const ASESOR_JID = "593979108339@s.whatsapp.net";

// Inicializar cliente de OpenAI
if (!process.env.OPENAI_API_KEY) {
    console.error("❌ Falta OPENAI_API_KEY en el archivo .env");
    process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Prompt mejorado: super vendedor
const SYSTEM_PROMPT = `
const SYSTEM_PROMPT = `
Eres un asistente de ventas experto de Minegoc8. 
No inventes nada que no esté aquí. Usa únicamente estos productos y precios exactos:

1. Lavadora portátil - $8
2. Selladora al vacío portátil - $28
3. Faja modeladora reductora - $8
4. Masajeador eléctrico corporal - $15

Reglas de venta:
- Hacemos envíos a domicilio.
- Pago contra entrega en efectivo o transferencia.
- También aceptamos pagos con de una.

Si el usuario pregunta ubicación, responde exactamente:
"Estamos ubicados en el Centro Histórico de Quito, calle Benalcázar y Manabí."

Responde corto, claro y en español. Siempre menciona **productos, precios, envíos y pagos**. No inventes otros precios.
`;

async function startBot(reconnectDelay = 2000) {
    const { state, saveCreds } = await useMultiFileAuthState("auth_info");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger,
        printQRInTerminal: false, // <--- No QR en Railway
        browser: ["MinegocBot", "Chrome", "1.0"],
        syncFullHistory: false,
        markOnlineOnConnect: true
    });

    // Conexión y reconexión
    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "open") console.log("✅ BOT CONECTADO");
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("🔄 Reconectando...");
                setTimeout(() => startBot(reconnectDelay * 2), reconnectDelay);
            }
        }
    });

    sock.ev.on("creds.update", saveCreds);

    // Manejo de mensajes entrantes
    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || "").trim();
        const mensaje = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Crear estado si primer contacto
        if (!userStates.has(from)) {
            userStates.set(from, { step: "menu" });
            await sock.sendMessage(from, { text: 
`¡Hola! 👋 Bienvenido a Minegoc8
Productos disponibles:
1 Lavadora $8
2 Selladora $28
3 Faja $8
4 Masajeador $15

Escribe el número del producto para ver más detalles y cómo comprar 😊`
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

Escribe *comprar* para recibir instrucciones de pago y envío.`
                });
            } else {
                state.step = "menu";
                await sock.sendMessage(from, { text: 
`Productos disponibles:
1 Lavadora $8
2 Selladora $28
3 Faja $8
4 Masajeador $15

Elige un número para ver detalles.`
                });
            }
            userStates.set(from, state);
            return;
        }

        // Flujo de compra
        if (["comprar","pedir","quiero"].some(w => mensaje.includes(w)) || state.step === "comprando") {
            if (state.step === "producto") {
                state.step = "comprando";
                await sock.sendMessage(from, { text: 
`Genial! 😊 Para completar tu pedido, envía tu nombre, dirección y teléfono.`
                });
            } else if (state.step === "comprando" && text.length > 10) {
                const prod = productos[state.selectedProduct];
                const cliente = from.split("@")[0];
                await sock.sendMessage(ASESOR_JID, { text: `PEDIDO: ${prod.nombre} $${prod.precio}\nCliente: +${cliente}\nDatos: ${text}` });
                await sock.sendMessage(from, { text: 
`¡Pedido recibido! Nuestro asesor te contactará pronto. Recuerda que hacemos envíos y aceptamos pagos contra entrega, transferencia o DUEÑA.`
                });
                state.step = "menu";
            }
            userStates.set(from, state);
            return;
        }

        // OpenAI para otras consultas
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
            console.error("Error OpenAI:", err.message);
            await sock.sendMessage(from, { text: "Ups... intenta *menú*" });
        }
    });
}

startBot().catch(err => console.error(err));
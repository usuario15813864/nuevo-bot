console.log("🤖 BOT MINEGOC8 INICIANDO...");

import dotenv from "dotenv";
dotenv.config();

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from "@whiskeysockets/baileys";

import pino from "pino";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import OpenAI from "openai";

const logger = pino({ level: "silent" });
const userStates = new Map();

/* ------------------ PRODUCTOS ------------------ */

const productos = {
  "1": { nombre: "Lavadora portátil", precio: 8, descripcion: "Compacta y bajo consumo" },
  "2": { nombre: "Selladora al vacío portátil", precio: 28, descripcion: "Mantiene alimentos frescos" },
  "3": { nombre: "Faja modeladora reductora", precio: 8, descripcion: "Compresión cómoda" },
  "4": { nombre: "Masajeador eléctrico corporal", precio: 15, descripcion: "Relajación muscular" }
};

const ASESOR_JID = "593979108339@s.whatsapp.net";

/* ------------------ OPENAI ------------------ */

if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Falta OPENAI_API_KEY");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* ------------------ PROMPT IA ------------------ */

const SYSTEM_PROMPT = `
Eres un asistente de ventas amable para Minegoc8.

Productos disponibles:

1. Lavadora portátil $8
2. Selladora al vacío $28
3. Faja modeladora $8
4. Masajeador eléctrico $15

También vendemos fundas para selladora al vacío (precio depende del tamaño).

Reglas:
- Responde corto, claro y amable.
- Si el cliente quiere comprar dile:
"Escribe *menú* y el número del producto (1-4) 😊"

Si preguntan la ubicación responde EXACTAMENTE:
"Estamos ubicados en el Centro Histórico de Quito, calle Benalcázar y Manabí."

No inventes direcciones.
`;

/* ------------------ BOT ------------------ */

async function startBot() {

  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: true,
    browser: ["MinegocBot", "Chrome", "1.0"]
  });

  /* ---------- CONEXIÓN ---------- */

  sock.ev.on("connection.update", async (update) => {

    const { connection, qr, lastDisconnect } = update;

    if (qr) {

      console.log("📱 ESCANEA ESTE QR:");

      qrcode.generate(qr, { small: true });

      const qrLink = await QRCode.toDataURL(qr);

      console.log("🔗 QR LINK (copiar en navegador):");
      console.log(qrLink);
    }

    if (connection === "open") {
      console.log("✅ BOT CONECTADO A WHATSAPP");
    }

    if (connection === "close") {

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {

        console.log("🔄 Reconectando en 5 segundos...");

        setTimeout(startBot, 5000);
      }
    }
  });

  sock.ev.on("creds.update", saveCreds);

  /* ---------- MENSAJES ---------- */

  sock.ev.on("messages.upsert", async ({ messages }) => {

    const msg = messages[0];

    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;

    let text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      "";

    text = text.trim();

    const mensaje = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    /* ---------- PRIMER MENSAJE ---------- */

    if (!userStates.has(from)) {

      userStates.set(from, { step: "menu" });

      await sock.sendMessage(from, {
        text:
`¡Hola! 👋 Bienvenido a Minegoc8

Productos disponibles:

1️⃣ Lavadora $8
2️⃣ Selladora $28
3️⃣ Faja $8
4️⃣ Masajeador $15

Escribe el número para ver detalles`
      });

      return;
    }

    let state = userStates.get(from);

    /* ---------- MENÚ ---------- */

    if (
      ["hola", "menu", "menú", "inicio"].some(w => mensaje.includes(w)) ||
      /^[1-4]$/.test(mensaje)
    ) {

      if (/^[1-4]$/.test(mensaje)) {

        const prod = productos[mensaje];

        state.step = "producto";
        state.selectedProduct = mensaje;

        await sock.sendMessage(from, {
          text:
`✨ *${prod.nombre}* - $${prod.precio}

${prod.descripcion}

Escribe *comprar* para continuar`
        });

      } else {

        state.step = "menu";

        await sock.sendMessage(from, {
          text:
`Productos disponibles:

1 Lavadora $8
2 Selladora $28
3 Faja $8
4 Masajeador $15

Elige número`
        });
      }

      userStates.set(from, state);

      return;
    }

    /* ---------- COMPRA ---------- */

    if (
      ["comprar", "pedir", "quiero"].some(w => mensaje.includes(w)) ||
      state.step === "comprando"
    ) {

      if (state.step === "producto") {

        state.step = "comprando";

        await sock.sendMessage(from, {
          text: "Envía: nombre, dirección y teléfono"
        });

      } else if (state.step === "comprando" && text.length > 10) {

        const prod = productos[state.selectedProduct];
        const cliente = from.split("@")[0];

        await sock.sendMessage(ASESOR_JID, {
          text:
`📦 PEDIDO NUEVO

Producto: ${prod.nombre}
Precio: $${prod.precio}

Cliente: +${cliente}

Datos:
${text}`
        });

        await sock.sendMessage(from, {
          text: "✅ Pedido recibido. El asesor te contactará pronto."
        });

        state.step = "menu";
      }

      userStates.set(from, state);

      return;
    }

    /* ---------- IA ---------- */

    try {

      const completion = await openai.chat.completions.create({

        model: "gpt-4o-mini",

        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text }
        ]

      });

      await sock.sendMessage(from, {
        text: completion.choices[0].message.content
      });

    } catch (err) {

      console.error("Error OpenAI:", err.message);

      await sock.sendMessage(from, {
        text: "Ups... escribe *menú* para ver productos."
      });
    }

  });
}

startBot().catch(err => console.error(err));
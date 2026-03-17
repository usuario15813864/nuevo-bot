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

/* PRODUCTOS */

const productos = {
"1": { nombre: "Lavadora portátil", precio: 8, descripcion: "Compacta, bajo consumo" },
"2": { nombre: "Selladora al vacío portátil", precio: 28, descripcion: "Conserva alimentos frescos" },
"3": { nombre: "Faja modeladora", precio: 8, descripcion: "Compresión cómoda" },
"4": { nombre: "Masajeador eléctrico", precio: 15, descripcion: "Relaja músculos" }
};

const ASESOR_JID = "593979108339@s.whatsapp.net";

/* OPENAI */

const openai = new OpenAI({
apiKey: process.env.OPENAI_API_KEY
});

/* PROMPT */

const SYSTEM_PROMPT = `
Eres un asistente de ventas de Minegoc8.

Productos:
1 Lavadora $8
2 Selladora $28
3 Faja $8
4 Masajeador $15

Si preguntan cómo comprar di:
"Escribe menú y el número del producto 😊"

Si preguntan ubicación responde exactamente:
"Estamos ubicados en el Centro Histórico de Quito, calle Benalcázar y Manabí."

Responde corto y amable.
`;

async function startBot() {

const { state, saveCreds } = await useMultiFileAuthState("auth_info");

const { version } = await fetchLatestBaileysVersion();

const sock = makeWASocket({
version,
auth: state,
logger,
browser: ["MinegocBot","Chrome","1.0"]
});

/* PAIRING CODE */

if (!sock.authState.creds.registered) {

const numero = "593XXXXXXXXX"; 

const code = await sock.requestPairingCode(numero);

console.log("📱 CODIGO DE EMPAREJAMIENTO:");
console.log(code);

console.log("En WhatsApp ve a:");
console.log("Dispositivos vinculados > Vincular con numero");
}

/* CONEXION */

sock.ev.on("connection.update", (update) => {

const { connection, lastDisconnect } = update;

if (connection === "open") {
console.log("✅ BOT CONECTADO");
}

if (connection === "close") {

const shouldReconnect =
lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

if (shouldReconnect) {
console.log("🔄 Reconectando...");
startBot();
}

}

});

sock.ev.on("creds.update", saveCreds);

/* MENSAJES */

sock.ev.on("messages.upsert", async ({ messages }) => {

const msg = messages[0];

if (!msg.message || msg.key.fromMe) return;

const from = msg.key.remoteJid;

let text =
msg.message.conversation ||
msg.message.extendedTextMessage?.text ||
"";

text = text.trim();

const mensaje = text.toLowerCase();

/* PRIMER MENSAJE */

if (!userStates.has(from)) {

userStates.set(from, { step: "menu" });

await sock.sendMessage(from,{
text:
`Hola 👋 Bienvenido a Minegoc8

Productos:

1 Lavadora $8
2 Selladora $28
3 Faja $8
4 Masajeador $15

Escribe el número`
});

return;
}

let state = userStates.get(from);

/* MENU */

if (["hola","menu","menú"].some(w=>mensaje.includes(w)) || /^[1-4]$/.test(mensaje)) {

if (/^[1-4]$/.test(mensaje)) {

const prod = productos[mensaje];

state.step = "producto";
state.selectedProduct = mensaje;

await sock.sendMessage(from,{
text:`${prod.nombre} $${prod.precio}

${prod.descripcion}

Escribe comprar`
});

}

else {

await sock.sendMessage(from,{
text:`Productos

1 Lavadora $8
2 Selladora $28
3 Faja $8
4 Masajeador $15`
});

}

userStates.set(from,state);

return;
}

/* COMPRA */

if (mensaje.includes("comprar") || state.step === "comprando") {

if (state.step === "producto") {

state.step = "comprando";

await sock.sendMessage(from,{
text:"Envía nombre, dirección y teléfono"
});

}

else if (text.length > 10) {

const prod = productos[state.selectedProduct];

const cliente = from.split("@")[0];

await sock.sendMessage(ASESOR_JID,{
text:
`PEDIDO

${prod.nombre}
$${prod.precio}

Cliente +${cliente}

${text}`
});

await sock.sendMessage(from,{
text:"Pedido recibido 👍"
});

state.step = "menu";
}

userStates.set(from,state);

return;
}

/* IA */

try {

const completion = await openai.chat.completions.create({

model:"gpt-4o-mini",

messages:[
{role:"system",content:SYSTEM_PROMPT},
{role:"user",content:text}
]

});

await sock.sendMessage(from,{
text:completion.choices[0].message.content
});

}

catch(err){

await sock.sendMessage(from,{
text:"Escribe menú"
});

}

});

}

startBot();
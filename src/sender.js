// src/sender.js
// All outbound WhatsApp messages go through this file.
// Never call the Meta API directly from handlers — always use sendMessage().

const axios = require('axios');

const META_API_URL = `https://graph.facebook.com/v19.0/${process.env.PHONE_NUMBER_ID}/messages`;

function devLog(to, text, buttons) {
  const btnLine = buttons
    ? `\n  Buttons: [${buttons.map(b => b.title).join('] [')}]`
    : '';
  console.log(`\n[DEV] → ${to}:\n─────────────────────\n${text}${btnLine}\n─────────────────────\n`);
}

/**
 * Send a plain text message to a WhatsApp number.
 */
async function sendMessage(to, text) {
  if (!process.env.WHATSAPP_TOKEN) {
    devLog(to, text);
    return true;
  }

  try {
    await axios.post(
      META_API_URL,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`Sent to ${to}: "${text.substring(0, 60)}..."`);
    return true;

  } catch (err) {
    const metaError = err.response?.data?.error;

    // Token expired or invalid — fall back to dev log
    if (metaError?.code === 190) {
      devLog(to, text);
      return true;
    }

    console.error('sendMessage failed:', metaError || err.message);
    return false;
  }
}

/**
 * Send interactive buttons message.
 */
async function sendButtons(to, bodyText, buttons) {
  if (!process.env.WHATSAPP_TOKEN) {
    devLog(to, bodyText, buttons);
    return true;
  }

  try {
    await axios.post(
      META_API_URL,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: bodyText },
          action: {
            buttons: buttons.map(b => ({
              type: 'reply',
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return true;
  } catch (err) {
    const metaError = err.response?.data?.error;

    // Token expired or invalid — fall back to dev log
    if (metaError?.code === 190) {
      devLog(to, bodyText, buttons);
      return true;
    }

    console.error('sendButtons failed:', metaError || err.message);
    return false;
  }
}

module.exports = { sendMessage, sendButtons };

const logger = require('../utils/logger');

function normalizeProvider() {
  return String(process.env.WHATSAPP_PROVIDER || 'meta').trim().toLowerCase();
}

function isWhatsAppSendingEnabled() {
  return String(process.env.WHATSAPP_SENDING_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

function buildMetaPayload({ to, messageType = 'template', message }) {
  const {
    WHATSAPP_TEST_TEMPLATE_NAME = 'jaspers_market_plain_text_v1',
    WHATSAPP_TEST_TEMPLATE_LANGUAGE = 'en_US',
  } = process.env;

  if (messageType === 'text') {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: message,
      },
    };
  }

  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: WHATSAPP_TEST_TEMPLATE_NAME,
      language: { code: WHATSAPP_TEST_TEMPLATE_LANGUAGE },
    },
  };
}

async function sendViaMeta({ to, messageType, message }) {
  const {
    WHATSAPP_GRAPH_VERSION = 'v25.0',
    WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_ACCESS_TOKEN,
  } = process.env;

  if (!WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_ACCESS_TOKEN) {
    const error = new Error('WhatsApp Meta API is not configured on the server.');
    error.status = 500;
    throw error;
  }

  const graphUrl = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const payload = buildMetaPayload({ to, messageType, message });
  const response = await fetch(graphUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    logger.error('WhatsApp Meta message failed', {
      status: response.status,
      error: data?.error?.message || data,
    });
    const error = new Error(data?.error?.message || 'WhatsApp Meta message failed.');
    error.status = response.status;
    error.meta = data;
    throw error;
  }

  return {
    provider: 'meta',
    meta: data,
  };
}

function formatTwilioWhatsAppAddress(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('whatsapp:')) return raw;
  let numeric = raw.replace(/\D/g, '');
  if (/^03\d{9}$/.test(numeric)) numeric = `92${numeric.slice(1)}`;
  if (/^3\d{9}$/.test(numeric)) numeric = `92${numeric}`;
  return numeric ? `whatsapp:+${numeric}` : '';
}

async function sendViaTwilio({ to, messageType, message, contentSid, contentVariables }) {
  const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_WHATSAPP_FROM = 'whatsapp:+14155238886',
    TWILIO_CONTENT_SID,
    TWILIO_STATUS_CALLBACK_URL,
  } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    const error = new Error('Twilio WhatsApp API is not configured on the server.');
    error.status = 500;
    throw error;
  }

  const from = formatTwilioWhatsAppAddress(TWILIO_WHATSAPP_FROM);
  const recipient = formatTwilioWhatsAppAddress(to);
  if (!from || !recipient) {
    const error = new Error('Twilio WhatsApp sender or recipient number is invalid.');
    error.status = 400;
    throw error;
  }

  const params = new URLSearchParams();
  params.append('From', from);
  params.append('To', recipient);

  const selectedContentSid = String(contentSid || TWILIO_CONTENT_SID || '').trim();
  if (messageType === 'template' && selectedContentSid) {
    params.append('ContentSid', selectedContentSid);
    const variables = String(contentVariables || process.env.TWILIO_CONTENT_VARIABLES || '').trim();
    if (variables) params.append('ContentVariables', variables);
  } else {
    params.append('Body', message || 'JM Mangoes WhatsApp test message.');
  }

  if (TWILIO_STATUS_CALLBACK_URL) {
    params.append('StatusCallback', TWILIO_STATUS_CALLBACK_URL);
  }

  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    logger.error('WhatsApp Twilio message failed', {
      status: response.status,
      error: data?.message || data,
      code: data?.code,
    });
    const error = new Error(data?.message || 'WhatsApp Twilio message failed.');
    error.status = response.status;
    error.meta = data;
    throw error;
  }

  return {
    provider: 'twilio',
    meta: data,
  };
}

async function sendWhatsAppMessage({ to, messageType = 'template', message = '', contentSid = '', contentVariables = '' }) {
  if (!isWhatsAppSendingEnabled()) {
    logger.info('WhatsApp sending skipped because WHATSAPP_SENDING_ENABLED=false', { to });
    return {
      provider: normalizeProvider(),
      skipped: true,
      reason: 'whatsapp-sending-disabled',
      meta: {},
    };
  }

  const provider = normalizeProvider();

  if (provider === 'meta') {
    return sendViaMeta({ to, messageType, message });
  }

  if (provider === 'twilio') {
    return sendViaTwilio({ to, messageType, message, contentSid, contentVariables });
  }

  const error = new Error(`Unsupported WhatsApp provider: ${provider}`);
  error.status = 500;
  throw error;
}

module.exports = {
  sendWhatsAppMessage,
};

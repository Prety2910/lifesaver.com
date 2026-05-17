const twilio = require('twilio');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, contacts } = req.body;

  if (!message || !contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: 'Missing message or contacts' });
  }

  // To use this, the user needs to set these environment variables in Vercel.
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhone) {
    console.error('Missing Twilio credentials in environment variables.');
    return res.status(500).json({ error: 'Server misconfiguration: Missing Twilio credentials.' });
  }

  const client = twilio(accountSid, authToken);
  const results = [];

  for (const contact of contacts) {
    try {
      // Ensure the contact is a phone number
      const phone = String(contact).replace(/\D/g, '');
      if (phone.length < 10) continue;

      const toPhone = phone.startsWith('91') || phone.startsWith('1') ? `+${phone}` : `+91${phone}`; // Fallback to India code

      const msg = await client.messages.create({
        body: message,
        from: twilioPhone,
        to: toPhone
      });
      
      results.push({ contact: toPhone, status: 'sent', sid: msg.sid });
    } catch (err) {
      console.error(`Failed to send SMS to ${contact}:`, err);
      results.push({ contact, status: 'error', error: err.message });
    }
  }

  return res.status(200).json({ success: true, results });
}

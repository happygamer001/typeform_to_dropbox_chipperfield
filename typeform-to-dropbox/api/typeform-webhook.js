const { verifySignature } = require('../lib/verify-signature');
const { generateResponsePDF } = require('../lib/generate-pdf');
const { uploadToDropbox } = require('../lib/dropbox');
const formsConfig = require('../config/forms.json');

// Signature verification needs the EXACT raw bytes Typeform sent, so we
// disable Vercel's automatic JSON body parsing and read the raw stream ourselves.
module.exports.config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function extractAnswerValue(answer) {
  switch (answer.type) {
    case 'text':
    case 'email':
    case 'phone_number':
    case 'url':
      return answer[answer.type];
    case 'choice':
      return answer.choice?.label;
    case 'choices':
      return answer.choices?.labels?.join(', ');
    case 'number':
      return String(answer.number);
    case 'boolean':
      return answer.boolean ? 'Yes' : 'No';
    case 'date':
      return answer.date;
    case 'file_url':
      return answer.file_url;
    default:
      return JSON.stringify(answer);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['typeform-signature'];

  // Signature check only runs if you've set a webhook secret - skip while
  // testing locally without one, but always set this in production.
  if (process.env.TYPEFORM_WEBHOOK_SECRET) {
    const valid = verifySignature(signature, rawBody, process.env.TYPEFORM_WEBHOOK_SECRET);
    if (!valid) {
      console.error('Rejected webhook: invalid signature');
      res.status(401).send('Invalid signature');
      return;
    }
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error('Rejected webhook: invalid JSON', err);
    res.status(400).send('Invalid JSON');
    return;
  }

  try {
    const { form_response } = payload;
    if (!form_response) {
      res.status(400).send('Missing form_response');
      return;
    }

    const formId = form_response.form_id;
    const formConfig = formsConfig[formId];

    if (!formConfig) {
      // Return 200 (not an error) so Typeform doesn't keep retrying -
      // this just means a form fired that isn't in our config yet.
      console.warn(`No config for form ID: ${formId} - ignoring`);
      res.status(200).send('Ignored - no config for this form');
      return;
    }

    const answers = (form_response.answers || []).map((answer) => {
      const label = formConfig.fields[answer.field.id] || `Unmapped field (${answer.field.id})`;
      return { label, value: extractAnswerValue(answer) };
    });

    const submittedAt = new Date(form_response.submitted_at).toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const pdfBuffer = await generateResponsePDF({
      formName: formConfig.name,
      submittedAt,
      answers,
    });

    const datePart = form_response.submitted_at.slice(0, 10); // YYYY-MM-DD
    const tokenPart = form_response.token.slice(0, 6);
    const filename = `${formConfig.name.replace(/\s+/g, '_')}_${datePart}_${tokenPart}.pdf`;
    const dropboxPath = `${formConfig.dropboxFolder}/${filename}`;

    await uploadToDropbox(pdfBuffer, dropboxPath);

    console.log(`Uploaded ${dropboxPath}`);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook processing error:', err);
    // 500 tells Typeform to retry - appropriate for transient failures
    // (e.g. Dropbox hiccup). If it becomes a recurring issue, check logs.
    res.status(500).send('Internal error');
  }
};

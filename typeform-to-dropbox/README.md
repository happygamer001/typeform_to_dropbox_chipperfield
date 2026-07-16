# Typeform → PDF → Dropbox

Receives a Typeform webhook on submission, converts the response into a
readable PDF, and uploads it to a form-specific Dropbox folder. Config-driven
so adding new forms later doesn't require new code.

## How it works

1. Typeform fires a webhook to `/api/typeform-webhook` on every submission
2. The handler verifies the signature, looks up the form in `config/forms.json`
3. Field IDs are translated to human-readable labels using that config
4. A PDF is rendered in memory (no disk writes - Vercel functions are ephemeral)
5. The PDF is uploaded to that form's configured Dropbox folder

## Setup

### 1. Install dependencies
```bash
cd typeform-to-dropbox
npm install
```

### 2. Fill in `config/forms.json`

Replace the placeholder form ID and field IDs with real ones. To get them:

**Option A - from the Typeform API** (recommended, avoids typos):
```bash
curl -H "Authorization: Bearer YOUR_TYPEFORM_TOKEN" \
  "https://api.typeform.com/forms/YOUR_FORM_ID"
```
Look for the `fields` array in the response - each has an `id` and `title`.

**Option B - from a sample webhook payload**: send a real test submission
once webhooks are wired up (step 5), check the Vercel function logs, and
copy the `field.id` values from the `answers` array.

Each form needs its own entry:
```json
{
  "your_actual_form_id": {
    "name": "Equipment Inspection",
    "dropboxFolder": "/Chipperfield AG/Equipment Inspections",
    "fields": {
      "field_id_abc": "Inspector Name",
      "field_id_def": "Equipment ID"
    }
  }
}
```

### 3. Set environment variables

Copy `.env.example` to `.env` for local testing. For production, add the
same variables in the Vercel dashboard: **Project → Settings → Environment
Variables**. Never commit `.env` — it's already covered by not including it
in the outputs, but double check your `.gitignore` if you push this to GitHub.

- `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` — same
  values you're already using in `enex_to_dropbox.py`
- `TYPEFORM_WEBHOOK_SECRET` — you'll get this in step 5, add it after

### 4. Deploy to Vercel
```bash
npm install -g vercel   # one-time
vercel                  # follow prompts, links/creates a project
vercel --prod           # deploy to your production URL
```
This gives you a URL like `https://typeform-to-dropbox.vercel.app`.

### 5. Register the webhook in Typeform

In the Typeform dashboard: your form → **Connect** → **Webhooks** → add
endpoint → paste `https://your-project.vercel.app/api/typeform-webhook`.

Typeform will show you a **webhook secret** at this point — copy it into
your Vercel environment variables as `TYPEFORM_WEBHOOK_SECRET`, then
redeploy (`vercel --prod`) so the function picks it up.

Repeat for each additional form, all pointing at the same URL — the handler
dispatches based on `form_id` in the payload.

### 6. Test it
Submit a real test response to the form. Check:
- Vercel dashboard → your project → **Logs** for the `Uploaded ...` line or any errors
- Dropbox folder for the PDF

## Adding a new form later
No code changes needed - just add a new entry to `config/forms.json` with
the form's ID, name, Dropbox folder, and field mapping, then register the
same webhook URL against that form in Typeform.

## Notes / things to watch for
- **Unmapped fields**: if a form's fields array is missing an ID, the PDF
  will show `Unmapped field (xxxx)` as the label instead of failing silently
  — that's your cue to update `forms.json`.
- **Retries**: Typeform retries on non-2xx responses. A form not yet in
  config returns 200 (ignored, not an error) so it won't retry forever.
- **Dropbox `mode: 'add'`**: won't overwrite existing files; duplicates get
  auto-renamed with `(1)`, `(2)` etc. Change to `'overwrite'` in
  `lib/dropbox.js` if you'd rather replace on conflict.

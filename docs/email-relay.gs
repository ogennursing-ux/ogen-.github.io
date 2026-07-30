/**
 * Ogen — email relay for the digital-signature app (Google Apps Script).
 *
 * WHY THIS EXISTS
 * The app is a static site (GitHub Pages) that runs entirely in the browser.
 * A browser cannot open an SMTP connection, and putting a Gmail App Password in
 * client-side JavaScript would expose it to every visitor. So the app POSTs the
 * signed PDF to this tiny Google-hosted script, which sends the email from your
 * own Gmail — no SMTP, no App Password, nothing secret in the website.
 *
 * SETUP (one time)
 * 1. Go to https://script.google.com  →  New project.
 * 2. Delete the sample code, paste THIS file, and Save.
 * 3. Set FALLBACK_TO below to your email.
 * 4. Deploy ▸ New deployment ▸ type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone        <-- must be "Anyone", NOT "Anyone with Google account"
 *    Click Deploy, authorize with your Google account, and copy the
 *    "Web app URL" (ends with /exec).
 * 5. In the app: ⚙ הגדרות → paste that URL into "כתובת שירות שליחת המייל",
 *    enter your email, Save. Then create a NEW signing link and sign to test.
 *
 * QUICK SELF-TEST (no app involved)
 *   Open this in a browser:   <your /exec URL>?test=1
 *   You should get a test email at FALLBACK_TO within a minute.
 */

// The address that receives the signed documents.
var FALLBACK_TO = 'ogen.manpower@gmail.com';

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var to = (data.to || FALLBACK_TO || '').trim();
    if (!to) return _ok('no recipient');

    var subject = data.subject || (data.title ? ('מסמך: ' + data.title) : 'התראת חתימה');
    var body = data.message || 'התקבלה חתימה חדשה.';
    if (data.link) body += '\n\n' + data.link;

    var options = { name: 'עוגן — חתימה דיגיטלית' };
    if (data.fileBase64) { // attached only on completion
      var bytes = Utilities.base64Decode(data.fileBase64);
      options.attachments = [Utilities.newBlob(bytes, 'application/pdf', data.fileName || 'signed.pdf')];
    }

    GmailApp.sendEmail(to, subject, body, options);
    return _ok('sent to ' + to);
  } catch (err) {
    return _ok('error: ' + err);
  }
}

// Open <url>/exec        -> confirms the app is deployed.
// Open <url>/exec?test=1 -> sends a test email to FALLBACK_TO.
function doGet(e) {
  if (e && e.parameter && e.parameter.test) {
    try {
      GmailApp.sendEmail(FALLBACK_TO, 'בדיקת שליחה — עוגן', 'זהו מייל בדיקה. אם קיבלת אותו, השירות עובד ✅');
      return _ok('test email sent to ' + FALLBACK_TO);
    } catch (err) {
      return _ok('error: ' + err);
    }
  }
  return _ok('Ogen email relay is running.');
}

// Run this from the Apps Script editor (Run ▸ sendTest) to check permissions.
function sendTest() {
  GmailApp.sendEmail(FALLBACK_TO, 'בדיקת שליחה — עוגן', 'בדיקה מעורך הסקריפט ✅');
}

function _ok(msg) {
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
}

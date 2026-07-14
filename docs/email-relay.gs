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
 * 3. (Optional) set FALLBACK_TO below to your email.
 * 4. Deploy ▸ New deployment ▸ type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Click Deploy, authorize with your Google account, and copy the
 *    "Web app URL" (ends with /exec).
 * 5. In the app: ⚙ הגדרות → paste that URL into "כתובת שירות שליחת המייל",
 *    enter your email, Save. Done — every signature now emails you the PDF.
 */

// Optional: an email to use if the app doesn't send one. Leave '' to require it.
var FALLBACK_TO = '';

function doPost(e) {
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    var to = (data.to || FALLBACK_TO || '').trim();
    if (!to) return _ok('no recipient');

    var subject = data.subject || (data.title ? ('מסמך: ' + data.title) : 'התראת חתימה');
    var body = data.message || 'התקבלה חתימה חדשה.';
    if (data.link) body += '\n\n' + data.link;

    var options = { name: 'עוגן — חתימה דיגיטלית' };

    // Attach the signed PDF when present (sent on completion).
    if (data.fileBase64) {
      var bytes = Utilities.base64Decode(data.fileBase64);
      var blob = Utilities.newBlob(bytes, 'application/pdf', data.fileName || 'signed.pdf');
      options.attachments = [blob];
    }

    GmailApp.sendEmail(to, subject, body, options);
    return _ok('sent');
  } catch (err) {
    return _ok('error: ' + err);
  }
}

// Lets you open the URL in a browser to confirm it deployed.
function doGet() {
  return _ok('Ogen email relay is running.');
}

function _ok(msg) {
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
}

// קליק חתימה — Google Apps Script email relay (v7)
//
// Deploy: paste into a Google Apps Script project → Save → Deploy ▸ Manage
// deployments ▸ New version, with "Execute as: Me" and "Who has access: Anyone".
//
// v7 changes (robust multi-signer + attachment delivery):
//   - retries the file fetch (handles storage propagation lag after signing)
//   - muteHttpExceptions so a not-yet-ready file never aborts the send
//   - ALWAYS sends the email; on attachment failure it falls back to a link
//   - guards the Gmail daily-quota error and reports it in the response
//   - ?quota=1 endpoint to instantly see remaining daily emails

var TO = "ogen.manpower@gmail.com";
var VERSION = "v7";

function doGet(e) {
  var p = (e && e.parameter) || {};

  if (p.quota == "1") {
    return _out("remaining daily emails: " + MailApp.getRemainingDailyQuota() + " (" + VERSION + ")");
  }

  if (p.test == "1") {
    MailApp.sendEmail({ to: TO, subject: "בדיקת שליחה — קליק חתימה", body: "עובד ✅ (" + VERSION + ")" });
    return _out("Test email sent ✅ (" + VERSION + ")");
  }

  if (p.notify == "1") {
    try {
      var to = p.to || TO;
      var subject = p.subject || "התראת חתימה — קליק חתימה";
      var body = p.message || "התקבלה חתימה חדשה.";
      if (p.link) body += "\n\n" + p.link;
      var options = { name: "קליק חתימה" };

      var urls = [];
      var names = [];
      if (p.fileUrls) {
        urls = p.fileUrls.split("|");
        names = (p.fileNames || "").split("|");
      } else if (p.fileUrl) {
        urls = [p.fileUrl];
        names = [p.fileName || "signed.pdf"];
      }

      var attachments = [];
      for (var i = 0; i < urls.length; i++) {
        var blob = fetchWithRetry(urls[i]);
        if (blob) {
          attachments.push(blob.setName(names[i] || "signed-" + (i + 1) + ".pdf"));
        } else {
          body += "\n\nלהורדת הקובץ:\n" + urls[i]; // fallback link if fetch failed
        }
      }
      if (attachments.length) options.attachments = attachments;

      // Guard the daily-quota error so we can report it clearly.
      if (MailApp.getRemainingDailyQuota() < 1) {
        return _out("error: daily email quota reached - try again tomorrow");
      }
      MailApp.sendEmail(to, subject, body, options);
      return _out("sent to " + to + " (" + attachments.length + " files, quota left " +
        MailApp.getRemainingDailyQuota() + ")");
    } catch (err) {
      return _out("error: " + err);
    }
  }

  return _out("קליק חתימה relay " + VERSION + " - running.");
}

// Fetch a file, retrying a few times so a file still propagating in storage
// right after signing gets attached rather than dropped.
function fetchWithRetry(url) {
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
      if (res.getResponseCode() === 200) return res.getBlob();
    } catch (e) {
      // network hiccup - fall through to retry
    }
    Utilities.sleep(1500); // wait for storage to catch up, then retry
  }
  return null;
}

function _out(s) {
  return ContentService.createTextOutput(s);
}

/* SMTP2GO send, ported from middleware/smtp2go.js. Same endpoint, same sender,
   same template_id and template_data shape.

   sendRaw() is the second door onto the same endpoint, for the one mail the
   portal holds no template for: the download gate's copy of the document. It
   carries its own html_body and text_body and, when the file is small enough,
   the file itself. */

"use strict";

const SENDER = "enquiries@gryd.energy";
const ENDPOINT = "https://api.smtp2go.com/v3/email/send";

async function sendEmail(to, templateData, subject, templateId) {
  if (!templateId || !process.env.SMTP_2_GO_API_KEY) {
    return { sent: false, reason: "not configured" };
  }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "X-Smtp2go-Api-Key": process.env.SMTP_2_GO_API_KEY
    },
    body: JSON.stringify({
      template_id: templateId,
      template_data: templateData,
      sender: SENDER,
      to: [to],
      subject: subject
    })
  });
  let json = null;
  try { json = await res.json(); } catch (err) { json = null; }
  if (!res.ok) { throw new Error("SMTP2GO error " + res.status); }
  return { sent: true, response: json };
}

/* A templateless send on the same endpoint. attachments is SMTP2GO's own shape:
   { filename, fileblob (base64), mimetype }. An empty list is left off the body
   rather than sent as an empty array. */
async function sendRaw(to, subject, htmlBody, textBody, attachments) {
  if (!process.env.SMTP_2_GO_API_KEY) {
    return { sent: false, reason: "not configured" };
  }
  const body = {
    sender: SENDER,
    to: [to],
    subject: subject,
    html_body: htmlBody,
    text_body: textBody
  };
  if (attachments && attachments.length) { body.attachments = attachments; }
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "X-Smtp2go-Api-Key": process.env.SMTP_2_GO_API_KEY
    },
    body: JSON.stringify(body)
  });
  let json = null;
  try { json = await res.json(); } catch (err) { json = null; }
  if (!res.ok) { throw new Error("SMTP2GO error " + res.status); }
  return { sent: true, response: json };
}

/* The old backend's formatCurrency, from routes/calculations.js line 33: a plain
   en-GB grouped number with no currency symbol, decimals only when the figure
   has them. The template prints the £ itself, which is why a raw number posted
   into it reads as "£15,211.32" and an empty string reads as "£". */
function formatCurrency(amount) {
  const n = Number(amount);
  if (!isFinite(n)) { return ""; }
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(n);
}

/* The percentage column of the results table, in the same two decimal form the
   page itself renders (assess-result.js pct). The template supplies no % sign,
   so it is written here. */
function formatPercent(value) {
  const n = Number(value);
  if (!isFinite(n)) { return ""; }
  return (Math.round(n * 100) / 100).toFixed(2) + "%";
}

module.exports = { sendEmail, sendRaw, formatCurrency, formatPercent };

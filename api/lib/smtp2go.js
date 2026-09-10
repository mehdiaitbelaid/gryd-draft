/* SMTP2GO send, ported from middleware/smtp2go.js. Same endpoint, same sender,
   same template_id and template_data shape. */

"use strict";

async function sendEmail(to, templateData, subject, templateId) {
  if (!templateId || !process.env.SMTP_2_GO_API_KEY) {
    return { sent: false, reason: "not configured" };
  }
  const res = await fetch("https://api.smtp2go.com/v3/email/send", {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "X-Smtp2go-Api-Key": process.env.SMTP_2_GO_API_KEY
    },
    body: JSON.stringify({
      template_id: templateId,
      template_data: templateData,
      sender: "enquiries@gryd.energy",
      to: [to],
      subject: subject
    })
  });
  let json = null;
  try { json = await res.json(); } catch (err) { json = null; }
  if (!res.ok) { throw new Error("SMTP2GO error " + res.status); }
  return { sent: true, response: json };
}

module.exports = { sendEmail };

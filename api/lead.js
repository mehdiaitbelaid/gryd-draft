/* POST /api/lead

   One entry point for the four lead sources on the new static site: the contact
   popup, the download gate, the site assessment and the FHS checker. It does
   what the old Express backend at api.gryd.energy does today, in the order it
   did it: block free and disposable domains, find or create the company by
   email domain, find or create the contact, associate the two, raise a follow up
   task on an owner, email the lead and the admin through SMTP2GO, and keep the
   HubSpot form history alive by forwarding the same submission to the form
   endpoint the browser used to post to directly.

   Copy this file to api/lead.js in the deploy repo. Plain Node runtime, not
   edge: it uses require and it may run for up to 30 seconds. */

"use strict";

const crypto = require("crypto");
const { createCompanyAndAssociateContact } = require("./lib/hubspot");
const { sendEmail, formatCurrency, formatPercent } = require("./lib/smtp2go");
const { storePayload } = require("./lib/dynamo");

const ALLOWED_ORIGINS = [
  "https://gryd.energy",
  "https://www.gryd.energy",
  "https://gryd-web.vercel.app"
];

const PORTAL = "144906745";
const FORMS = {
  contact: "8ce7ddd3-fe9e-4433-8741-077aae8f72c3",
  gate: "300acd1e-5c44-4728-b375-f51164c018b5",
  // Scott has no site assessment form yet, so assess rides the FHS form, which
  // is what assess-lead.js and fhs.js both post to today.
  assess: "ff5fca7b-c31f-4fb2-9e65-69b9e058973f",
  fhs: "ff5fca7b-c31f-4fb2-9e65-69b9e058973f"
};

const SOURCE_LABEL = {
  contact: "Website contact enquiry",
  gate: "Website case study download",
  assess: "Website site assessment Enquiry",
  fhs: "Website FHS check Enquiry"
};

const CONSENT_TEXT = "I consent to Gryd storing my details to provide this assessment "
  + "and contact me about their services.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Best effort rate limit. A serverless instance keeps this map only while it is
   warm and each instance counts on its own, so it slows a script down rather
   than stopping one. It replaces the old API key, which cannot be hidden in a
   static site. */
const HITS = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_HITS = 20;

function rateLimited(ip) {
  const now = Date.now();
  const seen = (HITS.get(ip) || []).filter(function (t) { return now - t < WINDOW_MS; });
  seen.push(now);
  HITS.set(ip, seen);
  if (HITS.size > 5000) { HITS.clear(); }
  return seen.length > MAX_HITS;
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (!fwd) { return "unknown"; }
  return String(fwd).split(",")[0].trim();
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return true;
  }
  // No origin at all is a server to server call, which the old API also allowed.
  return !origin;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") { return Promise.resolve(req.body); }
  if (typeof req.body === "string") {
    try { return Promise.resolve(JSON.parse(req.body)); }
    catch (err) { return Promise.resolve(null); }
  }
  return new Promise(function (resolve) {
    let raw = "";
    req.on("data", function (c) { raw += c; });
    req.on("end", function () {
      try { resolve(JSON.parse(raw || "{}")); } catch (err) { resolve(null); }
    });
    req.on("error", function () { resolve(null); });
  });
}

/* The task body. The old code wrote one labelled line per answer for the site
   assessment; the same shape carries the other three, with whatever the source
   actually knows. */
function taskBody(input) {
  const lines = [SOURCE_LABEL[input.source]];
  lines.push("");
  lines.push("Name: " + [input.firstname, input.lastname].filter(Boolean).join(" "));
  lines.push("Email: " + input.email);
  if (input.phone) { lines.push("Phone: " + input.phone); }
  if (input.company) { lines.push("Company: " + input.company); }
  if (input.message) { lines.push("Message: " + input.message); }
  if (input.notes) { lines.push(""); lines.push(input.notes); }
  if (input.payload && input.payload.shareLink) {
    lines.push("Results shareLink: " + input.payload.shareLink);
  }
  if (input.payload && input.payload.location) {
    const loc = input.payload.location;
    if (loc.lat != null && loc.lng != null) {
      lines.push("Google Maps Link: https://maps.google.com/?q=" + loc.lat + "," + loc.lng);
    }
  }
  return lines.join(" |\n");
}

function taskSubject(input) {
  const name = [input.firstname, input.lastname].filter(Boolean).join(" ") || input.email;
  return SOURCE_LABEL[input.source] + " - Follow-up for " + name;
}

/* The admin template's own variables, from the old /hubspot route. Anything the
   source does not know is left as an empty string rather than invented. */
function adminTemplateData(input, hubspotInfo, origin) {
  const p = input.payload || {};
  const beds = p.bedrooms || {};
  const loc = p.location || {};
  const pct = function (v) {
    return v == null ? "" : (Number(v) * 100).toFixed(0);
  };
  return {
    name: [input.firstname, input.lastname].filter(Boolean).join(" "),
    email: input.email,
    phone: input.phone || "",
    hubspot_owner: hubspotInfo.task_owner,
    time: hubspotInfo.timestamp,
    total_homes: p.totalHomes == null ? "" : p.totalHomes,
    bedrooms_1_2: pct(beds["1-2"]),
    bedrooms_3_4: pct(beds["3-4"]),
    bedrooms_5_plus: pct(beds["5+"]),
    energy_demand: p.energyDemand || "",
    orientation_base: p.orientation || "",
    postcode: p.postcode || "",
    location_latitude: loc.lat == null ? "" : loc.lat,
    location_longitude: loc.lng == null ? "" : loc.lng,
    map_link: loc.lat == null ? "" : "https://maps.google.com/?q=" + loc.lat + "," + loc.lng,
    results_link: p.shareLink || resultsLink(input, origin),
    source: SOURCE_LABEL[input.source],
    notes: input.notes || input.message || ""
  };
}

/* Where "View your results" points. The old email linked to a stored result in
   DynamoDB; DynamoDB was dropped, so the link goes to the assessment page on the
   origin the submission came from, which is the page the reader can run again.
   The reader's own page path is used when the browser sent one on our origin. */
const ASSESS_PATH = "/site-assessment.html";
const DEFAULT_ORIGIN = "https://gryd.energy";

function resultsLink(input, origin) {
  const base = origin && ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : DEFAULT_ORIGIN;
  if (input.pageUri) {
    try {
      const u = new URL(String(input.pageUri));
      if (u.origin === base) { return u.origin + u.pathname; }
    } catch (err) { /* an unparseable pageUri just falls through to the default */ }
  }
  return base + ASSESS_PATH;
}

/* The user template's variables, from the old /send-email route. Only the site
   assessment fills the savings half, and only from payload.results, which
   assess-lead.js builds out of what window.GrydAssess.compute returned. Every
   currency figure arrives as a plain number and is formatted here, the way the
   old backend formatted it on the way into the same template.

   A submission with no payload.results still produces every key, empty, so the
   email sends with blanks rather than failing. */
function userTemplateData(input, origin) {
  const p = input.payload || {};
  const r = p.results || {};
  const money = function (v) { return v == null || v === "" ? "" : formatCurrency(v); };
  const pct = function (v) { return v == null || v === "" ? "" : formatPercent(v); };
  const plain = function (v) { return v == null || v === "" ? "" : String(v); };
  return {
    number_homes: plain(r.number_homes != null ? r.number_homes : p.totalHomes),
    location_postcode: plain(r.location_postcode || p.postcode),
    average_orientation: plain(r.average_orientation || p.orientation),
    utility_setup: plain(r.utility_setup || p.energyDemand),
    developer_build_saving: money(r.developer_build_saving),
    carbon_emission_saving: plain(r.carbon_emission_saving),
    developer_build_per_unit_saving: money(r.developer_build_per_unit_saving),
    home_owner_saving: money(r.home_owner_saving),
    subscription_small: plain(r.subscription_small),
    saving_small: money(r.saving_small),
    saving_percent_small: pct(r.saving_percent_small),
    subscription_medium: plain(r.subscription_medium),
    saving_medium: money(r.saving_medium),
    saving_percent_medium: pct(r.saving_percent_medium),
    subscription_large: plain(r.subscription_large),
    saving_large: money(r.saving_large),
    saving_percent_large: pct(r.saving_percent_large),
    results_link: resultsLink(input, origin)
  };
}

/* The same submission the browser used to post directly, so the form history in
   HubSpot keeps filling. Never fatal. */
async function forwardToForm(input) {
  const formId = FORMS[input.source];
  if (!formId) { return { forwarded: false, reason: "no form" }; }
  const fields = [
    { objectTypeId: "0-1", name: "email", value: input.email },
    { objectTypeId: "0-1", name: "firstname", value: input.firstname || "" },
    { objectTypeId: "0-1", name: "lastname", value: input.lastname || "" }
  ];
  if (input.phone) { fields.push({ objectTypeId: "0-1", name: "phone", value: input.phone }); }
  if (input.company) { fields.push({ objectTypeId: "0-1", name: "company", value: input.company }); }
  if (input.message) { fields.push({ objectTypeId: "0-1", name: "message", value: input.message }); }
  if (input.notes && (input.source === "assess" || input.source === "fhs")) {
    fields.push({ objectTypeId: "0-1", name: "fhs_assessment_notes", value: input.notes });
  }
  const body = {
    fields: fields,
    context: {
      pageUri: input.pageUri || "https://gryd.energy/",
      pageName: input.pageName || SOURCE_LABEL[input.source]
    }
  };
  if (input.hutk) { body.context.hutk = input.hutk; }
  if (input.source === "assess" || input.source === "fhs") {
    body.legalConsentOptions = {
      consent: { consentToProcess: true, text: CONSENT_TEXT, communications: [] }
    };
  }
  try {
    const res = await fetch(
      "https://forms-eu1.hsforms.com/submissions/v3/integration/submit/"
        + PORTAL + "/" + formId,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }
    );
    return { forwarded: res.ok, status: res.status };
  } catch (err) {
    return { forwarded: false, error: String(err && err.message) };
  }
}

async function handler(req, res) {
  if (!cors(req, res)) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Not allowed by CORS" }));
    return;
  }
  if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const send = function (code, obj) {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
  };

  if (rateLimited(clientIp(req))) {
    send(429, { error: "Too many requests, please try again later." });
    return;
  }

  const input = await readBody(req);
  if (!input) { send(400, { error: "Invalid JSON body" }); return; }

  // Honeypot: a filled hidden field is a bot. Answer as if it worked.
  if (input.website || input.company_website || input._gotcha) {
    send(200, { status: "success", id: crypto.randomUUID(), stored: false });
    return;
  }

  if (!FORMS[input.source]) { send(400, { error: "Unknown source" }); return; }
  if (!input.email || !EMAIL_RE.test(String(input.email))) {
    send(400, { error: "A valid email is required" });
    return;
  }
  if (!input.firstname) { send(400, { error: "firstname is required" }); return; }

  const id = crypto.randomUUID();

  try {
    const hubspotInfo = await createCompanyAndAssociateContact({
      email: String(input.email).trim(),
      firstname: input.firstname,
      lastname: input.lastname || "",
      phone: input.phone || "",
      company: input.company || "",
      message: input.message || "",
      taskBody: taskBody(input),
      taskSubject: taskSubject(input)
    });

    const forward = await forwardToForm(input);

    let stored = { stored: false };
    if (input.payload) {
      try {
        stored = await storePayload(id, Object.assign({ email: input.email }, input.payload));
      } catch (err) {
        stored = { stored: false, error: String(err && err.message) };
      }
    }

    // Admin always, the lead only when a user template is configured.
    const emails = { admin: false, user: false };
    try {
      const out = await sendEmail(
        "enquiries@gryd.energy",
        adminTemplateData(input, hubspotInfo, req.headers.origin),
        "New " + SOURCE_LABEL[input.source] + " - Assigned to " + hubspotInfo.task_owner,
        process.env.SMTP_2_GO_TEMPLATE_ID_ADMIN
      );
      emails.admin = Boolean(out && out.sent);
    } catch (err) { emails.admin = false; }

    if (input.source === "assess") {
      try {
        const out = await sendEmail(
          input.email,
          userTemplateData(input, req.headers.origin),
          "Website Followup",
          process.env.SMTP_2_GO_TEMPLATE_ID_USER
        );
        emails.user = Boolean(out && out.sent);
      } catch (err) { emails.user = false; }
    }

    send(200, {
      id: id,
      status: "success",
      owner: hubspotInfo.task_owner,
      skipped: Boolean(hubspotInfo.skipped),
      forwarded: Boolean(forward.forwarded),
      stored: Boolean(stored && stored.stored),
      emails: emails
    });
  } catch (err) {
    send(500, { error: "Internal Server Error" });
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.taskBody = taskBody;
module.exports.taskSubject = taskSubject;
module.exports.adminTemplateData = adminTemplateData;
module.exports.userTemplateData = userTemplateData;
module.exports.resultsLink = resultsLink;
module.exports.forwardToForm = forwardToForm;
module.exports.ALLOWED_ORIGINS = ALLOWED_ORIGINS;
module.exports.FORMS = FORMS;
module.exports._resetRateLimit = function () { HITS.clear(); };

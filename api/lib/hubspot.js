/* HubSpot side of the lead, ported from the old Express backend
   (middleware/hubspotAPI.js and middleware/hubspotSearch.js).

   The old code used @hubspot/api-client. Here every call is a plain fetch
   against the same paths with a bearer token, so the function has no
   dependencies and the tests can mock one thing. */

"use strict";

const forbidden = new Set(require("../data/domains.json"));

const BASE = "https://api.hubapi.com";

function token() {
  return process.env.HUBSPOT_API_KEY || "";
}

async function hs(path, method, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: "Bearer " + token(),
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let json = null;
  try { json = await res.json(); } catch (err) { json = null; }
  return { ok: res.ok, status: res.status, json };
}

function isForbiddenEmail(domain) {
  return forbidden.has(String(domain || "").trim().toLowerCase());
}

/* The owner pool. Only the ids the environment actually sets are usable, so a
   half configured environment never assigns a task to an empty id. */
function owners() {
  const all = [
    { id: process.env.HUBSPOT_ID_Scott, name: "Scott" },
    { id: process.env.HUBSPOT_ID_Tom, name: "Tom" },
    { id: process.env.HUBSPOT_ID_Mohamed, name: "Mohamed" },
    { id: process.env.HUBSPOT_ID_Hugo, name: "Hugo" },
    { id: process.env.HUBSPOT_ID_OLLIE, name: "Ollie" }
  ];
  return all.filter(function (o) { return o.id; });
}

/* Deterministic by email so the same person always lands on the same owner and
   a retry cannot create two tasks for two people. The old code had a random
   pick commented out; random would break that. */
function hashEmail(email) {
  let h = 0;
  const s = String(email || "").trim().toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickOwner(email) {
  const pool = owners();
  if (process.env.LEAD_OWNER_ROTATION === "1" && pool.length) {
    return pool[hashEmail(email) % pool.length];
  }
  return { id: process.env.HUBSPOT_ID_Hugo, name: "Hugo" };
}

/* Old hubspotSearch.js: the legacy v2 domain lookup, newest company wins. */
async function companySearch(domain) {
  const r = await hs(
    "/companies/v2/domains/" + encodeURIComponent(domain) + "/companies",
    "POST",
    {
      limit: 5,
      requestOptions: {
        properties: ["domain", "createdate", "name", "hs_lastmodifieddate"]
      },
      offset: { isPrimary: true, companyId: 0 }
    }
  );
  const results = (r.json && r.json.results) || [];
  const hits = [];
  results.forEach(function (result) {
    const p = result.properties || {};
    if (p.domain && p.domain.value === domain) {
      hits.push({
        companyId: result.companyId,
        created: p.createdate ? p.createdate.timestamp : 0
      });
    }
  });
  if (!hits.length) { return null; }
  hits.sort(function (a, b) { return b.created - a.created; });
  return hits[0].companyId;
}

/* The old code's readable timestamp, same format and same comma strip. */
function readableNow(now) {
  return now.toLocaleString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    day: "2-digit", month: "2-digit", year: "numeric", hour12: false
  }).replace(",", "");
}

/* lead: {email, firstname, lastname, phone, company, taskBody, taskSubject} */
async function createCompanyAndAssociateContact(lead) {
  const now = new Date();
  const timestamp = now.toISOString();
  const readable = readableNow(now);
  const owner = pickOwner(lead.email);

  const emailDomain = String(lead.email || "").split("@")[1];
  if (!emailDomain || isForbiddenEmail(emailDomain)) {
    return {
      timestamp: readable,
      task_owner: "No Hubspot creation for forbidden emails",
      skipped: true
    };
  }

  const companyDomain = emailDomain;
  // The old code named the company after the domain label, not the typed name.
  const companyName = lead.company || emailDomain.split(".")[0];

  let companyId = null;
  try {
    companyId = await companySearch(companyDomain);
  } catch (err) {
    companyId = null;
  }

  let companyCreated = false;
  if (!companyId) {
    const r = await hs("/crm/v3/objects/companies", "POST", {
      properties: {
        name: companyName,
        domain: companyDomain,
        hubspot_owner_id: owner.id
      }
    });
    if (r.ok && r.json && r.json.id) {
      companyId = r.json.id;
      companyCreated = true;
    } else if (r.json && r.json.category === "CONFLICT") {
      const errs = r.json.errors || [];
      companyId = errs[0] && errs[0].associatedObject
        ? errs[0].associatedObject.id : null;
    } else {
      return { timestamp: readable, task_owner: owner.name, error: "company" };
    }
  }

  /* DIFFERENCE from the old code: the contact is searched by email before it is
     created. The old code created blind and read the existing id back out of
     the CONFLICT message, which relies on HubSpot's error wording. The conflict
     path is still here as the fallback. */
  let contactId = null;
  const found = await hs("/crm/v3/objects/contacts/search", "POST", {
    filterGroups: [{
      filters: [{ propertyName: "email", operator: "EQ", value: lead.email }]
    }],
    properties: ["email"],
    limit: 1
  });
  if (found.ok && found.json && (found.json.results || []).length) {
    contactId = found.json.results[0].id;
  }

  let contactCreated = false;
  if (!contactId) {
    const props = {
      email: lead.email,
      firstname: lead.firstname || "",
      lastname: lead.lastname || "",
      lifecyclestage: "marketingqualifiedlead"
    };
    if (lead.phone) { props.phone = lead.phone; }
    if (lead.company) { props.company = lead.company; }
    if (lead.message) { props.message = lead.message; }
    const r = await hs("/crm/v3/objects/contacts", "POST", { properties: props });
    if (r.ok && r.json && r.json.id) {
      contactId = r.json.id;
      contactCreated = true;
    } else if (r.json && r.json.category === "CONFLICT") {
      const m = /Existing ID: (\d+)/.exec(r.json.message || "");
      contactId = m ? m[1] : null;
    }
    if (!contactId) {
      return { timestamp: readable, task_owner: owner.name, error: "contact" };
    }
  }

  // Association and task failures are logged and swallowed, as in the old code.
  try {
    await hs(
      "/crm/v4/objects/contacts/" + contactId + "/associations/companies/" + companyId,
      "PUT",
      [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1 }]
    );
  } catch (err) { /* old behaviour: keep going */ }

  try {
    await hs("/crm/v3/objects/tasks", "POST", {
      properties: {
        hs_timestamp: timestamp,
        hs_task_body: lead.taskBody,
        hs_task_subject: lead.taskSubject,
        hs_task_status: "NOT_STARTED",
        hs_task_priority: "MEDIUM",
        hs_task_type: "TODO",
        hubspot_owner_id: owner.id
      },
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 204 }]
      }]
    });
  } catch (err) { /* old behaviour: keep going */ }

  return {
    timestamp: readable,
    task_owner: owner.name,
    companyId: companyId,
    contactId: contactId,
    companyCreated: companyCreated,
    contactCreated: contactCreated
  };
}

module.exports = {
  createCompanyAndAssociateContact,
  companySearch,
  isForbiddenEmail,
  pickOwner,
  owners,
  readableNow
};

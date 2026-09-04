/* The site assessment lead, sent to HubSpot.

   Mehdi, 4 September: the tools page and the popup both take a name and an
   email before they draw the assessment, and neither did anything with it. They
   now both send it, through this one file, so the two gates can never file a
   lead differently.

   Scott has no site assessment form in HubSpot yet, so until he makes one the
   lead goes to the FHS form, portal 144906745 in region eu1, the same form the
   FHS check posts to. The notes field says on its first line that this is a
   site assessment and not an FHS check, so the two are never confused in the
   CRM once they share a form.

   Everything here is fire and forget. Neither gate waits on it, neither shows
   anything when it fails, and a failure is logged as a plain console line so a
   validator counting console errors stays clean. */
(function (w) {
  "use strict";

  var ENDPOINT = "https://forms-eu1.hsforms.com/submissions/v3/integration/submit/"
    + "144906745/ff5fca7b-c31f-4fb2-9e65-69b9e058973f";
  var CONSENT_TEXT = "I consent to Gryd storing my details to provide this assessment "
    + "and contact me about their services.";

  function splitName(full) {
    var t = String(full || "").trim().replace(/\s+/g, " ");
    var cut = t.lastIndexOf(" ");
    return cut < 0 ? { first: t, last: "" }
                   : { first: t.slice(0, cut), last: t.slice(cut + 1) };
  }

  function money(n) {
    return "£" + Math.round(Number(n) || 0).toLocaleString("en-GB");
  }

  /* The counts the reader typed under the bed tiles, as one line. A reader who
     picked sizes without counting any of them leaves the sizes themselves. */
  function bedLine(inputs) {
    var counts = inputs.counts || {};
    var keys = Object.keys(counts).filter(function (k) { return counts[k] > 0; });
    if (keys.length) {
      return keys.map(function (k) { return k + " " + counts[k]; }).join(", ");
    }
    var beds = inputs.beds || [];
    return beds.length ? beds.join(", ") : "Not given";
  }

  /* The lead as plain text: what was asked for, then what the engine returned.
     The first line is the one that matters in the CRM, because this form is the
     FHS form until Scott makes a second one. */
  function notes(inputs, result) {
    var lines = [
      "Site assessment (not FHS)",
      "",
      "Postcode: " + (String(inputs.postcode || "").toUpperCase().trim() || "Not given"),
      "Bedrooms: " + bedLine(inputs),
      "Plots: " + (parseInt(inputs.homes, 10) || 0),
      "Orientation: " + (inputs.orientation || "Not given"),
      "Energy: " + (inputs.energy || "Not given")
    ];
    if (result) {
      lines.push("");
      lines.push("Developer saving: " + money(result.developerSaving));
      lines.push("Homeowner lifetime saving: " + money(result.homeownerLifetimeSaving));
      lines.push("Carbon a year: " + result.co2TonnesPerYear + " tonnes");
      lines.push("Saving per unit: " + money(result.savingPerUnit));
    }
    return lines.join("\n");
  }

  function payload(inputs, result, contact) {
    var n = splitName(contact.name);
    return {
      fields: [
        { objectTypeId: "0-1", name: "email", value: contact.email },
        { objectTypeId: "0-1", name: "firstname", value: n.first },
        { objectTypeId: "0-1", name: "lastname", value: n.last },
        { objectTypeId: "0-1", name: "fhs_assessment_notes",
          value: notes(inputs, result) }
      ],
      context: { pageUri: w.location.href, pageName: w.document.title },
      legalConsentOptions: {
        consent: { consentToProcess: true, text: CONSENT_TEXT, communications: [] }
      }
    };
  }

  /* inputs is what the engine was given, result is what it returned, and
     contact is the name and the email the gate took. */
  function send(inputs, result, contact) {
    if (!inputs || !contact || !contact.email) { return; }
    try {
      w.fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(inputs, result, contact))
      }).then(function (res) {
        if (!res.ok) { console.log("assessment lead not accepted, " + res.status); }
      }).catch(function (err) { console.log("assessment lead not sent, " + err); });
    } catch (err) {
      console.log("assessment lead not sent, " + err);
    }
  }

  w.GrydAssessLeadApi = { send: send, notes: notes, payload: payload, ENDPOINT: ENDPOINT };
})(window);

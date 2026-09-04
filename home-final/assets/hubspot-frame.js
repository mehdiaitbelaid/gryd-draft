/* The site's vocabulary, injected into HubSpot's own iframe.

   HubSpot serves a styled form inside an iframe, so no stylesheet on the page
   can reach it. The one opening it leaves is the css option on
   hbspt.forms.create, which is injected into the frame's document. Two modals
   embed a HubSpot form, the Get in touch modal on the homepage and the hub's
   download gate, and both read this one string, so the two forms cannot drift
   apart the way the two plates around them had.

   The form's own words, fields and order stay HubSpot's. What is asked for
   here is only the face, the colours, the field rule and the button.

   Known limit, 4 September. HubSpot has moved this portal onto its newer
   embed, ui-forms-embed-components-app, and that renderer ignores the css
   option: the string arrives on the frame as data-css and is dropped. It is
   still passed, because it is honoured by the older renderer and by any form
   that has no styling of its own in HubSpot, and because it costs one request
   that is cached across both modals. Until then the inside of the two forms
   is set in HubSpot itself, at portal 144906745, on forms
   8ce7ddd3-fe9e-4433-8741-077aae8f72c3 (Get in touch) and
   300acd1e-5c44-4728-b375-f51164c018b5 (case study download). The plate around
   them, which is what a page can reach, matches the site.

   window.GRYD_HS_CSS */
window.GRYD_HS_CSS = [
  "html,body{background:transparent !important;margin:0}",
  "body,input,select,textarea,button,label,p,h1,h2,h3,h4,legend{",
  "font-family:'DM Sans',ui-sans-serif,system-ui,'Helvetica Neue',Arial,sans-serif !important}",
  "body{color:#4E251B;font-size:15px;line-height:1.55}",

  /* the form's own heading and standfirst, on the page's type ramp */
  ".hs-richtext h1,.hs-richtext h2,.hs-richtext h3,h1,h2,h3{",
  "color:#4E251B !important;font-weight:500 !important;letter-spacing:-.025em;",
  "line-height:1.12;margin:0 0 8px}",
  ".hs-richtext h1,h1{font-size:26px !important}",
  ".hs-richtext h2,h2{font-size:22px !important}",
  ".hs-richtext p,p{color:#6B4A3E !important;font-size:15px;margin:0 0 18px}",

  /* one hairline per field, the assessment popup's own rule */
  ".hs-form-field{margin:0 0 16px}",
  ".hs-form-field>label,.hs-field-desc,legend{display:block;font-size:10px !important;",
  "letter-spacing:.1em;text-transform:uppercase;color:#8A776E !important;",
  "font-weight:400 !important;margin:0 0 2px}",
  ".hs-form-required{color:#FF5532 !important}",
  "input[type=text],input[type=email],input[type=tel],input[type=number],",
  "input[type=url],select,textarea{",
  "width:100% !important;max-width:100% !important;box-sizing:border-box;",
  "background:transparent !important;color:#4E251B !important;",
  "border:0 !important;border-bottom:1px solid #D8CFC5 !important;",
  "border-radius:0 !important;padding:6px 0 7px !important;",
  "font-size:16px !important;box-shadow:none !important;",
  "transition:border-color .2s ease}",
  "input:focus,select:focus,textarea:focus{",
  "outline:0 !important;border-bottom-color:#FF5532 !important}",
  "::placeholder{color:#8A776E;opacity:.8}",
  ".hs-fieldtype-checkbox li,.hs-fieldtype-booleancheckbox li{list-style:none}",
  "ul.inputs-list{margin:0;padding:0}",

  /* the site's primary button, the same 15px pill as everywhere else */
  ".hs-button,.actions input[type=submit],input[type=submit]{",
  "display:inline-block;font-size:15px !important;font-weight:500 !important;",
  "line-height:1.55 !important;border:0 !important;border-radius:999px !important;",
  "background:#FF5532 !important;color:#ffffff !important;",
  "padding:14px 26px !important;cursor:pointer;",
  "-webkit-appearance:none;appearance:none;text-transform:none !important;",
  "box-shadow:none !important;width:auto !important}",
  ".hs-button:hover,input[type=submit]:hover{background:#E8431F !important}",
  ".actions{margin:18px 0 0;padding:0;text-align:left}",

  /* the multi step bar, on the palette rather than on HubSpot's */
  ".hs-progress-bar,.hs-progress-bar-wrapper,progress{",
  "background:#D8CFC5 !important;height:2px !important;border-radius:0 !important}",
  ".hs-progress-bar-inner,progress::-webkit-progress-value{",
  "background:#FF5532 !important;border-radius:0 !important}",

  /* the validation line, in the palette's own alarm rather than in browser red */
  ".hs-error-msg,.hs-error-msgs label{color:#FF5532 !important;font-size:12px !important;",
  "text-transform:none !important;letter-spacing:0 !important}",
  ".submitted-message,.hs-richtext{color:#4E251B}"
].join("");

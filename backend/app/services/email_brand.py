"""
BIBI Cars — shared email brand-shell utility.
================================================

Single source of truth for the branded, email-client-safe HTML shell used by
*every* outgoing email (transactional templates AND event notifications).

Design goals
------------
* No Jinja / no external deps — plain f-strings so it stays fast & portable.
* Table-based layout, inline styles, web-safe fonts → renders in Gmail,
  Outlook, Apple Mail, mobile clients.
* Dark + gold (#FEAE00) brand palette matching the cabinet UI.
* Fully responsive: a single max-width:560px column that collapses on phones,
  plus a <style> media-query block for clients that honour it.

Public helpers
--------------
    is_full_html_document(html)         -> bool
    wrap_brand_email(inner, ...)        -> full HTML document (str)
    brand_inner(eyebrow, heading, ...)  -> branded inner card HTML (str)
    brand_button(label, url)            -> styled CTA button HTML (str)
    brand_amount_box(label, value)      -> highlighted amount panel HTML (str)
"""

from __future__ import annotations

import os
import re
from typing import Iterable, Optional

# ── brand palette ───────────────────────────────────────────────────────
BRAND_GOLD = "#FEAE00"
BRAND_GOLD_DARK = "#1A1208"   # readable text on top of the gold button
BG_OUTER = "#0A0A09"
BG_CARD = "#1A1A18"
BG_INNER = "#0F0F0D"
BORDER = "#2C2C29"
TEXT = "#FFFFFF"
TEXT_MUTED = "#A7A7A1"
TEXT_FAINT = "#6A6A64"
GREEN = "#34D399"

YEAR_FALLBACK = "2026"

FONT_DISPLAY = "'Trebuchet MS',Helvetica,Arial,sans-serif"
FONT_BODY = "Helvetica,Arial,sans-serif"
FONT_MONO = "'Courier New',monospace"

DEFAULT_FOOTER_NOTE = (
    "You are receiving this email from BIBI Cars regarding your account or order."
)

_FULL_DOC_RE = re.compile(r"<(?:!doctype\s+html|html[\s>])", re.IGNORECASE)

# Public path of the real BIBI Cars logo asset served by the frontend.
_LOGO_PATH = "/bibi-logo.png"
_LOGO_FALLBACK = "https://bibicars.org/bibi-logo.png"


def _logo_url(site_url: Optional[str] = None) -> str:
    """Resolve an absolute, email-safe URL for the brand logo.

    Priority: explicit EMAIL_LOGO_URL env → {site_url|PUBLIC_SITE_URL}/bibi-logo.png
    → hard fallback. Always returns an https URL so remote-image rendering works.
    """
    explicit = (os.environ.get("EMAIL_LOGO_URL") or "").strip()
    if explicit:
        return explicit
    base = (site_url or os.environ.get("PUBLIC_SITE_URL") or "").strip().rstrip("/")
    if base:
        return f"{base}{_LOGO_PATH}"
    return _LOGO_FALLBACK


def is_full_html_document(html: str) -> bool:
    """True if `html` already contains a full <html> document.

    Used by the email pipeline to avoid double-wrapping templates that already
    render their own brand shell (e.g. the customer-cabinet OTP/welcome mails).
    """
    if not html:
        return False
    return bool(_FULL_DOC_RE.search(html))


def wrap_brand_email(
    inner_html: str,
    *,
    preheader: str = "",
    footer_note: Optional[str] = None,
    unsubscribe_url: Optional[str] = None,
    site_url: Optional[str] = None,
) -> str:
    """Wrap arbitrary inner content in the shared responsive dark brand shell.

    Parameters
    ----------
    inner_html      content placed inside the card (already HTML).
    preheader       hidden inbox-preview text (improves open rates / anti-spam).
    footer_note     small grey line above the copyright; defaults to a generic
                    transactional note.
    unsubscribe_url optional link rendered in the footer (also exposed as a
                    List-Unsubscribe header by the sender).
    site_url        optional link for the logo / "Visit BIBI Cars".
    """
    note = footer_note if footer_note is not None else DEFAULT_FOOTER_NOTE
    logo_src = _logo_url(site_url)
    # Real BIBI Cars logo (PNG — renders in Gmail/Outlook; SVG does not).
    # `alt` keeps the brand visible when a client blocks remote images.
    logo_img = (
        f'<img src="{logo_src}" width="132" height="46" alt="BIBI Cars" '
        f'style="display:block;border:0;outline:none;text-decoration:none;'
        f'height:46px;width:auto;max-width:170px;" />'
    )
    logo = (
        f'<a href="{site_url}" target="_blank" style="text-decoration:none;border:0;">{logo_img}</a>'
        if site_url else logo_img
    )

    unsub = ""
    if unsubscribe_url:
        unsub = (
            f'<p style="margin:0 0 6px 0;font-family:{FONT_BODY};font-size:12px;line-height:18px;color:{TEXT_FAINT};">'
            f'<a href="{unsubscribe_url}" target="_blank" style="color:{TEXT_FAINT};text-decoration:underline;">Unsubscribe</a>'
            f'</p>'
        )

    return f"""<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>BIBI Cars</title>
  <style>
    @media only screen and (max-width:600px) {{
      .bibi-card {{ padding:28px 22px !important; }}
      .bibi-wrap {{ padding:20px 8px !important; }}
      .bibi-h1 {{ font-size:23px !important; line-height:29px !important; }}
    }}
    a {{ color:{BRAND_GOLD}; }}
  </style>
</head>
<body style="margin:0;padding:0;background:{BG_OUTER};-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;mso-hide:all;">
    {preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bibi-wrap" style="background:{BG_OUTER};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding:8px 0 24px 0;">
              {logo}
            </td>
          </tr>
          <tr>
            <td class="bibi-card" style="background:{BG_CARD};border:1px solid {BORDER};border-radius:18px;padding:40px 36px;box-shadow:0 20px 60px rgba(0,0,0,0.55);">
              {inner_html}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:26px 16px 8px 16px;">
              {unsub}
              <p style="margin:0 0 6px 0;font-family:{FONT_BODY};font-size:12px;line-height:18px;color:{TEXT_MUTED};">
                {note}
              </p>
              <p style="margin:0;font-family:{FONT_BODY};font-size:12px;line-height:18px;color:{TEXT_FAINT};">
                &copy; {YEAR_FALLBACK} BIBI Cars &middot; Premium car import &amp; delivery
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def brand_button(label: str, url: str) -> str:
    """A bullet-proof gold CTA button."""
    return f"""
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding:8px 0 4px 0;">
            <a href="{url}" target="_blank"
               style="display:inline-block;background:{BRAND_GOLD};color:{BRAND_GOLD_DARK};text-decoration:none;
                      font-family:{FONT_DISPLAY};font-size:15px;font-weight:800;letter-spacing:0.4px;
                      padding:15px 38px;border-radius:12px;">{label}</a>
          </td>
        </tr>
      </table>"""


def brand_amount_box(label: str, value: str, *, accent: str = BRAND_GOLD) -> str:
    """A highlighted panel for an amount / key value (e.g. invoice total)."""
    return f"""
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px 0;">
        <tr>
          <td style="background:{BG_INNER};border:1px solid {BORDER};border-left:3px solid {accent};border-radius:12px;padding:16px 20px;">
            <p style="margin:0 0 4px 0;font-family:{FONT_BODY};font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:{TEXT_FAINT};">{label}</p>
            <p style="margin:0;font-family:{FONT_DISPLAY};font-size:24px;font-weight:800;color:{accent};">{value}</p>
          </td>
        </tr>
      </table>"""


def brand_inner(
    *,
    eyebrow: str = "",
    heading: str = "",
    paragraphs: Optional[Iterable[str]] = None,
    accent: str = BRAND_GOLD,
    amount_label: str = "",
    amount_value: str = "",
    cta_label: str = "",
    cta_url: str = "",
    note: str = "",
) -> str:
    """Compose a consistent branded inner card body.

    All text args may contain `{{ placeholders }}` — they are emitted verbatim
    so the downstream template `render()` can substitute them.
    """
    parts: list[str] = []
    if eyebrow:
        parts.append(
            f'<p style="margin:0 0 6px 0;font-family:{FONT_DISPLAY};font-size:11px;letter-spacing:2px;'
            f'text-transform:uppercase;color:{accent};font-weight:700;">{eyebrow}</p>'
        )
    if heading:
        parts.append(
            f'<h1 class="bibi-h1" style="margin:0 0 16px 0;font-family:{FONT_DISPLAY};font-size:27px;'
            f'line-height:33px;color:{TEXT};font-weight:800;">{heading}</h1>'
        )
    for p in (paragraphs or []):
        parts.append(
            f'<p style="margin:0 0 16px 0;font-family:{FONT_BODY};font-size:15px;line-height:24px;color:{TEXT_MUTED};">{p}</p>'
        )
    if amount_value:
        parts.append(brand_amount_box(amount_label, amount_value, accent=accent))
    if cta_label and cta_url:
        parts.append(brand_button(cta_label, cta_url))
    if note:
        parts.append(
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;">'
            f'<tr><td style="background:{BG_INNER};border:1px solid {BORDER};border-radius:12px;padding:14px 18px;">'
            f'<p style="margin:0;font-family:{FONT_BODY};font-size:12.5px;line-height:19px;color:{TEXT_MUTED};">{note}</p>'
            f'</td></tr></table>'
        )
    return "\n".join(parts)

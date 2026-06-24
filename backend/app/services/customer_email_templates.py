"""
Premium transactional email templates for the BIBI Cars customer cabinet.

Everything here is plain string rendering — no Jinja, no external deps — so it
stays fast and dependency-free. Templates are written with email-client-safe
HTML: table-based layout, inline styles, web-safe fonts with graceful fallback,
and a dark + gold (#FEAE00) brand palette that matches the cabinet UI.

Public helpers:
    render_verification_email(code, name, ttl_minutes) -> (subject, html, text)
    render_welcome_email(name) -> (subject, html, text)
"""

from __future__ import annotations

from typing import Tuple

# Single source of truth for the brand palette + responsive shell lives in
# app.services.email_brand. We re-export the palette constants here so the
# existing template bodies below keep working unchanged.
from app.services.email_brand import (  # noqa: F401
    BRAND_GOLD,
    BG_OUTER,
    BG_CARD,
    BG_INNER,
    BORDER,
    TEXT,
    TEXT_MUTED,
    YEAR_FALLBACK,
    wrap_brand_email,
)


def _shell(*, preheader: str, inner_html: str) -> str:
    """Wrap content in the shared responsive dark email shell.

    Thin delegate to the canonical ``email_brand.wrap_brand_email`` so all
    emails (cabinet transactional + CRM event notifications) share one shell.
    """
    import os as _os
    _site = (_os.environ.get("PUBLIC_SITE_URL") or "").strip().rstrip("/") or None
    return wrap_brand_email(
        inner_html,
        preheader=preheader,
        site_url=_site,
        footer_note=(
            "You are receiving this email because an account was created "
            "with this address on BIBI Cars."
        ),
    )


def render_verification_email(code: str, name: str = "", ttl_minutes: int = 10) -> Tuple[str, str, str]:
    """Build the email-verification message.

    Returns (subject, html, text).
    """
    safe_name = (name or "").strip()
    greeting = f"Welcome, {safe_name}!" if safe_name else "Welcome to BIBI Cars!"
    digits = "".join(
        f"""<td align="center" style="padding:0 5px;">
              <div style="width:46px;height:60px;line-height:60px;background:{BG_OUTER};border:1px solid {BORDER};border-radius:10px;
                          font-family:'Courier New',monospace;font-size:30px;font-weight:700;color:{BRAND_GOLD};">{d}</div>
            </td>"""
        for d in str(code)
    )

    inner = f"""
      <p style="margin:0 0 6px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{BRAND_GOLD};font-weight:700;">
        Verify your email
      </p>
      <h1 style="margin:0 0 14px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;color:{TEXT};font-weight:800;">
        {greeting}
      </h1>
      <p style="margin:0 0 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:{TEXT_MUTED};">
        Thanks for joining BIBI Cars. To activate your personal cabinet and keep your account secure,
        enter the verification code below on the confirmation screen.
      </p>

      <!-- Code -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 26px auto;">
        <tr>{digits}</tr>
      </table>

      <p style="margin:0 0 28px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:{TEXT_MUTED};text-align:center;">
        This code expires in <strong style="color:{TEXT};">{ttl_minutes} minutes</strong>.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:{BG_INNER};border:1px solid {BORDER};border-radius:12px;padding:16px 18px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12.5px;line-height:19px;color:{TEXT_MUTED};">
              <strong style="color:{TEXT};">Didn't request this?</strong> You can safely ignore this email —
              no account will be activated without this code. Never share this code with anyone;
              BIBI Cars staff will never ask you for it.
            </p>
          </td>
        </tr>
      </table>
    """

    html = _shell(
        preheader=f"Your BIBI Cars verification code is {code}",
        inner_html=inner,
    )

    text = (
        f"{greeting}\n\n"
        f"Your BIBI Cars verification code is: {code}\n"
        f"This code expires in {ttl_minutes} minutes.\n\n"
        f"Enter it on the confirmation screen to activate your cabinet.\n\n"
        f"If you didn't create a BIBI Cars account, you can ignore this email.\n"
        f"Never share this code with anyone.\n\n"
        f"— BIBI Cars"
    )

    subject = f"{code} is your BIBI Cars verification code"
    return subject, html, text


def render_welcome_email(name: str = "") -> Tuple[str, str, str]:
    """Post-verification welcome email. Returns (subject, html, text)."""
    safe_name = (name or "").strip()
    greeting = f"You're all set, {safe_name}!" if safe_name else "You're all set!"

    inner = f"""
      <p style="margin:0 0 6px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{BRAND_GOLD};font-weight:700;">
        Account activated
      </p>
      <h1 style="margin:0 0 14px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;color:{TEXT};font-weight:800;">
        {greeting}
      </h1>
      <p style="margin:0 0 24px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:{TEXT_MUTED};">
        Your email has been verified and your BIBI Cars cabinet is ready. You can now track orders,
        manage documents, view invoices and follow every step of your car's journey — all in one place.
      </p>
    """

    html = _shell(
        preheader="Your BIBI Cars cabinet is ready.",
        inner_html=inner,
    )

    text = (
        f"{greeting}\n\n"
        f"Your email has been verified and your BIBI Cars cabinet is ready.\n"
        f"Sign in any time with your email and password.\n\n"
        f"— BIBI Cars"
    )

    subject = "Welcome to BIBI Cars — your cabinet is ready"
    return subject, html, text

def render_invite_email(
    invite_link: str,
    *,
    name: str = "",
    ttl_days: int = 30,
    inviter_name: str = "",
) -> Tuple[str, str, str]:
    """Customer onboarding INVITE email.

    Sent when a manager / team-lead / admin creates a client in the CRM and
    wants them to finish onboarding (set a password) and access their cabinet.
    Returns (subject, html, text). Brand-styled, email-client-safe.
    """
    safe_name = (name or "").strip()
    greeting = f"Hello, {safe_name}!" if safe_name else "Hello!"
    inviter = (inviter_name or "").strip()
    by_line = (
        f"{inviter} from the BIBI Cars team has created a personal cabinet for you."
        if inviter
        else "The BIBI Cars team has created a personal cabinet for you."
    )

    inner = f"""
      <p style="margin:0 0 6px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{BRAND_GOLD};font-weight:700;">
        You're invited
      </p>
      <h1 style="margin:0 0 14px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:28px;line-height:34px;color:{TEXT};font-weight:800;">
        {greeting}
      </h1>
      <p style="margin:0 0 22px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:{TEXT_MUTED};">
        {by_line} Set your password to activate your account — then you can track your order,
        sign contracts, view invoices and follow every step of your car's journey from auction to keys.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding:6px 0 8px 0;">
            <a href="{invite_link}" target="_blank"
               style="display:inline-block;background:{BRAND_GOLD};color:#1A1208;text-decoration:none;
                      font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;
                      letter-spacing:0.4px;padding:15px 38px;border-radius:12px;">
              Activate my account
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:{TEXT_MUTED};">
        Or copy this link into your browser:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="background:{BG_INNER};border:1px solid {BORDER};border-radius:12px;padding:14px 16px;">
            <a href="{invite_link}" target="_blank"
               style="font-family:'Courier New',monospace;font-size:13px;line-height:18px;color:{BRAND_GOLD};text-decoration:none;word-break:break-all;">
              {invite_link}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:20px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#6A6A64;">
        This invitation link is valid for {ttl_days} days. If you weren't expecting this email, you can safely ignore it.
      </p>
    """

    html = _shell(
        preheader="Set your password to activate your BIBI Cars cabinet.",
        inner_html=inner,
    )

    text = (
        f"{greeting}\n\n"
        f"{by_line}\n\n"
        f"Activate your account and set your password:\n{invite_link}\n\n"
        f"This invitation link is valid for {ttl_days} days.\n\n"
        f"— BIBI Cars"
    )

    subject = "You're invited to BIBI Cars — activate your cabinet"
    return subject, html, text





def render_staff_login_otp_email(
    code: str,
    *,
    staff_email: str = "",
    staff_name: str = "",
    role: str = "team_lead",
    ttl_minutes: int = 10,
) -> Tuple[str, str, str]:
    """Login-approval OTP email for a team-lead sign-in.

    Sent to the configured administration inbox so the master-admin can approve
    the team-lead's first login of the session. Returns (subject, html, text).
    """
    who = (staff_name or "").strip() or (staff_email or "").strip() or "a team lead"
    role_label = (role or "team_lead").replace("_", " ").title()
    digits = "".join(
        f"""<td align="center" style="padding:0 5px;">
              <div style="width:46px;height:60px;line-height:60px;background:{BG_OUTER};border:1px solid {BORDER};border-radius:10px;
                          font-family:'Courier New',monospace;font-size:30px;font-weight:700;color:{BRAND_GOLD};">{d}</div>
            </td>"""
        for d in str(code)
    )

    inner = f"""
      <p style="margin:0 0 6px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{BRAND_GOLD};font-weight:700;">
        Login approval required
      </p>
      <h1 style="margin:0 0 14px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:26px;line-height:32px;color:{TEXT};font-weight:800;">
        Team-lead sign-in
      </h1>
      <p style="margin:0 0 22px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:{TEXT_MUTED};">
        <strong style="color:{TEXT};">{who}</strong> ({role_label}) is signing in to the BIBI Cars panel and needs
        a one-time approval code. Share the code below with them to complete the login.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
        <tr>
          <td style="background:{BG_INNER};border:1px solid {BORDER};border-radius:12px;padding:14px 18px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12.5px;line-height:20px;color:{TEXT_MUTED};">
              <span style="color:#6A6A64;">Account:</span> <strong style="color:{TEXT};">{staff_email or '—'}</strong><br/>
              <span style="color:#6A6A64;">Role:</span> <strong style="color:{TEXT};">{role_label}</strong>
            </p>
          </td>
        </tr>
      </table>

      <!-- Code -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 22px auto;">
        <tr>{digits}</tr>
      </table>

      <p style="margin:0 0 24px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:{TEXT_MUTED};text-align:center;">
        This code expires in <strong style="color:{TEXT};">{ttl_minutes} minutes</strong>.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:{BG_INNER};border:1px solid {BORDER};border-radius:12px;padding:16px 18px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12.5px;line-height:19px;color:{TEXT_MUTED};">
              <strong style="color:{TEXT};">Not expecting this?</strong> If you did not authorise this sign-in,
              do <strong style="color:{TEXT};">not</strong> share the code — the login cannot proceed without it.
              The same code is also visible in the admin panel under Security &middot; Pending logins.
            </p>
          </td>
        </tr>
      </table>
    """

    html = _shell(
        preheader=f"Team-lead login approval code: {code}",
        inner_html=inner,
    )

    text = (
        f"BIBI Cars — team-lead login approval\n\n"
        f"{who} ({role_label}) is signing in.\n"
        f"Account: {staff_email or '—'}\n\n"
        f"Approval code: {code}\n"
        f"Expires in {ttl_minutes} minutes.\n\n"
        f"Share this code with the team lead to complete the login.\n"
        f"If you did not authorise this sign-in, do not share the code.\n\n"
        f"— BIBI Cars"
    )

    subject = f"{code} — BIBI Cars team-lead login approval"
    return subject, html, text



def render_login_otp_email(code: str, name: str = "", ttl_minutes: int = 10) -> Tuple[str, str, str]:
    """Customer login one-time code (email-based 2FA on sign-in).

    Returns (subject, html, text).
    """
    safe_name = (name or "").strip()
    hello = f"Hi {safe_name}," if safe_name else "Hi,"
    digits = "".join(
        f"""<td align="center" style="padding:0 5px;">
              <div style="width:46px;height:60px;line-height:60px;background:{BG_OUTER};border:1px solid {BORDER};border-radius:10px;
                          font-family:'Courier New',monospace;font-size:30px;font-weight:700;color:{BRAND_GOLD};">{d}</div>
            </td>"""
        for d in str(code)
    )

    inner = f"""
      <p style="margin:0 0 6px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{BRAND_GOLD};font-weight:700;">
        Sign-in verification
      </p>
      <h1 style="margin:0 0 14px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:26px;line-height:32px;color:{TEXT};font-weight:800;">
        Your login code
      </h1>
      <p style="margin:0 0 26px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:{TEXT_MUTED};">
        {hello} a sign-in to your BIBI Cars cabinet needs a one-time code. Enter the code below
        on the verification screen to finish logging in.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 26px auto;">
        <tr>{digits}</tr>
      </table>

      <p style="margin:0 0 26px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:{TEXT_MUTED};text-align:center;">
        This code expires in <strong style="color:{TEXT};">{ttl_minutes} minutes</strong>.
      </p>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:{BG_INNER};border:1px solid {BORDER};border-radius:12px;padding:16px 18px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12.5px;line-height:19px;color:{TEXT_MUTED};">
              <strong style="color:{TEXT};">Didn't try to sign in?</strong> Someone may have your password.
              Do not share this code, and change your password from your cabinet as soon as possible.
            </p>
          </td>
        </tr>
      </table>
    """

    html = _shell(
        preheader=f"Your BIBI Cars login code is {code}",
        inner_html=inner,
    )
    text = (
        f"BIBI Cars — login verification\n\n"
        f"Your one-time login code: {code}\n"
        f"Expires in {ttl_minutes} minutes.\n\n"
        f"If you didn't try to sign in, do not share this code and change your password.\n\n"
        f"— BIBI Cars"
    )
    subject = f"{code} — BIBI Cars login code"
    return subject, html, text



def render_password_reset_email(
    reset_link: str,
    *,
    name: str = "",
    ttl_minutes: int = 60,
) -> Tuple[str, str, str]:
    """Customer password-reset email with a branded CTA. Returns (subject, html, text)."""
    safe_name = (name or "").strip()
    hello = f"Hi {safe_name}," if safe_name else "Hi,"

    inner = f"""
      <p style="margin:0 0 6px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:{BRAND_GOLD};font-weight:700;">
        Password reset
      </p>
      <h1 style="margin:0 0 14px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:27px;line-height:33px;color:{TEXT};font-weight:800;">
        Reset your password
      </h1>
      <p style="margin:0 0 24px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:{TEXT_MUTED};">
        {hello} we received a request to reset the password for your BIBI Cars account.
        Click the button below to choose a new password.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td align="center" style="padding:6px 0 8px 0;">
            <a href="{reset_link}" target="_blank"
               style="display:inline-block;background:{BRAND_GOLD};color:#1A1208;text-decoration:none;
                      font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:15px;font-weight:800;
                      letter-spacing:0.4px;padding:15px 38px;border-radius:12px;">
              Reset my password
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:{TEXT_MUTED};">
        Or copy this link into your browser:
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="background:{BG_INNER};border:1px solid {BORDER};border-radius:12px;padding:14px 16px;">
            <a href="{reset_link}" target="_blank"
               style="font-family:'Courier New',monospace;font-size:13px;line-height:18px;color:{BRAND_GOLD};text-decoration:none;word-break:break-all;">
              {reset_link}
            </a>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
        <tr>
          <td style="background:{BG_INNER};border:1px solid {BORDER};border-radius:12px;padding:16px 18px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12.5px;line-height:19px;color:{TEXT_MUTED};">
              This link expires in <strong style="color:{TEXT};">{ttl_minutes} minutes</strong>.
              <strong style="color:{TEXT};">Didn't request this?</strong> You can safely ignore this email —
              your password will not change.
            </p>
          </td>
        </tr>
      </table>
    """

    html = _shell(preheader="Reset your BIBI Cars password.", inner_html=inner)
    text = (
        f"{hello}\n\n"
        f"We received a request to reset your BIBI Cars password.\n"
        f"Reset it here (valid {ttl_minutes} minutes):\n{reset_link}\n\n"
        f"If you didn't request this, you can safely ignore this email.\n\n"
        f"— BIBI Cars"
    )
    subject = "Reset your BIBI Cars password"
    return subject, html, text


def render_password_changed_email(name: str = "") -> Tuple[str, str, str]:
    """Security confirmation email after a successful password change."""
    safe_name = (name or "").strip()
    hello = f"Hi {safe_name}," if safe_name else "Hi,"

    inner = f"""
      <p style="margin:0 0 6px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#34D399;font-weight:700;">
        Security update
      </p>
      <h1 style="margin:0 0 14px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:27px;line-height:33px;color:{TEXT};font-weight:800;">
        Your password was changed ✓
      </h1>
      <p style="margin:0 0 22px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:{TEXT_MUTED};">
        {hello} the password for your BIBI Cars account was just updated. You can now sign in
        with your new password. For your security, all other sessions were signed out.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="background:{BG_INNER};border:1px solid {BORDER};border-radius:12px;padding:16px 18px;">
            <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12.5px;line-height:19px;color:{TEXT_MUTED};">
              <strong style="color:{TEXT};">Didn't do this?</strong> Contact your manager immediately —
              someone may have access to your email.
            </p>
          </td>
        </tr>
      </table>
    """
    html = _shell(preheader="Your BIBI Cars password was changed.", inner_html=inner)
    text = (
        f"{hello}\n\n"
        f"The password for your BIBI Cars account was just changed.\n"
        f"All other sessions were signed out for your security.\n\n"
        f"If you didn't do this, contact your manager immediately.\n\n"
        f"— BIBI Cars"
    )
    subject = "Your BIBI Cars password was changed"
    return subject, html, text

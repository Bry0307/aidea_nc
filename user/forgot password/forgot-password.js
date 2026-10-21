// forgot-password.js
// Matches the 4-panel forgot-password.html (Request → Code → New Password → Success).
// Same theme persistence + API base pattern as dashboard.js.
//
// Assumed backend routes (adjust the paths below if yours differ):
//   POST /forgot-password        { email }
//   POST /verify-reset-code      { email, code }
//   POST /reset-password         { email, code, password, password_confirmation }

document.addEventListener('DOMContentLoaded', () => {

    const API_BASE = 'https://aideanc-production-84b5.up.railway.app/api';
    const LOGIN_URL = '../login/login.html';
    const THEME_KEY = 'aidea_user_theme';
    const RESEND_SECONDS = 60;

    /* ── STATE ── */
    let submittedEmail = '';
    let resetCodeValue = '';
    let resendIntervalId = null;

    /* ── PANELS ── */
    const panelRequest     = document.getElementById('panelRequest');
    const panelCode        = document.getElementById('panelCode');
    const panelNewPassword = document.getElementById('panelNewPassword');
    const panelSuccess     = document.getElementById('panelSuccess');

    function showPanel(panel) {
        [panelRequest, panelCode, panelNewPassword, panelSuccess].forEach(p => {
            if (p) p.style.display = (p === panel) ? '' : 'none';
        });
    }

    /* ── STEP 1 ELEMENTS ── */
    const forgotForm      = document.getElementById('forgotForm');
    const resetEmailEl    = document.getElementById('resetEmail');
    const errResetEmail   = document.getElementById('errResetEmail');
    const resetBtn        = document.getElementById('resetBtn');
    const resetBtnText    = document.getElementById('resetBtnText');
    const resetBtnSpinner = document.getElementById('resetBtnSpinner');

    /* ── STEP 2 ELEMENTS ── */
    const sentEmailDisplay = document.getElementById('sentEmailDisplay');
    const codeForm          = document.getElementById('codeForm');
    const resetCodeEl       = document.getElementById('resetCode');
    const errResetCode      = document.getElementById('errResetCode');
    const verifyBtn         = document.getElementById('verifyBtn');
    const verifyBtnText     = document.getElementById('verifyBtnText');
    const verifyBtnSpinner  = document.getElementById('verifyBtnSpinner');
    const resendBtn         = document.getElementById('resendBtn');
    const resendBtnText     = document.getElementById('resendBtnText');
    const resendBtnSpinner  = document.getElementById('resendBtnSpinner');
    const resendTimer       = document.getElementById('resendTimer');
    const timerCount        = document.getElementById('timerCount');
    const backToEmail       = document.getElementById('backToEmail');

    /* ── STEP 3 ELEMENTS ── */
    const newPasswordForm        = document.getElementById('newPasswordForm');
    const newPasswordEl          = document.getElementById('newPassword');
    const errNewPassword         = document.getElementById('errNewPassword');
    const confirmPasswordEl      = document.getElementById('confirmPassword');
    const errConfirmPassword     = document.getElementById('errConfirmPassword');
    const savePasswordBtn        = document.getElementById('savePasswordBtn');
    const savePasswordBtnText    = document.getElementById('savePasswordBtnText');
    const savePasswordBtnSpinner = document.getElementById('savePasswordBtnSpinner');

    /* ══════════════════════════════════════════════════
       THEME (light / dark) — same pattern as dashboard.js
    ══════════════════════════════════════════════════ */
    const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light';

    function applyTheme(theme, persist) {
        document.documentElement.setAttribute('data-theme', theme);
        if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch { } }
        document.getElementById('themeBtn')
            ?.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
        document.querySelector('meta[name="theme-color"]')
            ?.setAttribute('content', theme === 'dark' ? '#050a17' : '#0a1a3f');
    }

    function initTheme() {
        applyTheme(currentTheme(), false);
        document.getElementById('themeBtn')?.addEventListener('click', () => {
            applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
        });

        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        mq.addEventListener?.('change', e => {
            let saved = null;
            try { saved = localStorage.getItem(THEME_KEY); } catch { }
            if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
        });
    }

    /* ══════════════════════════════════════════════════
       TOAST — uses the .toast / .toast.error classes
       already defined in forgot-password.css (#toastWrap)
    ══════════════════════════════════════════════════ */
    function showToast(msg, type = 'success') {
        const wrap = document.getElementById('toastWrap');
        if (!wrap) return;
        const t = document.createElement('div');
        t.className = 'toast' + (type === 'error' ? ' error' : '');
        t.textContent = msg;
        wrap.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 3200);
    }

    /* ══════════════════════════════════════════════════
       VALIDATION HELPERS
    ══════════════════════════════════════════════════ */
    const isValidEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const isValidCode  = v => /^\d{6}$/.test(v);

    function setError(inputEl, errEl, msg) {
        if (!inputEl || !errEl) return;
        if (msg) {
            inputEl.classList.add('has-error');
            errEl.textContent = msg;
        } else {
            inputEl.classList.remove('has-error');
            errEl.textContent = '';
        }
    }

    function setButtonLoading(btn, textEl, spinnerEl, loading, loadingLabel, idleLabel) {
        if (!btn) return;
        btn.disabled = loading;
        if (spinnerEl) spinnerEl.style.display = loading ? '' : 'none';
        if (textEl) textEl.textContent = loading ? loadingLabel : idleLabel;
    }

    /* ══════════════════════════════════════════════════
       API CALLS
    ══════════════════════════════════════════════════ */
    async function postJSON(path, body) {
        const res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body),
        });
        const contentType = res.headers.get('content-type') ?? '';
        const data = contentType.includes('application/json') ? await res.json() : {};
        if (!res.ok) {
            throw new Error(data.message || 'Something went wrong. Please try again.');
        }
        return data;
    }

    /* ══════════════════════════════════════════════════
       RESEND COOLDOWN TIMER
    ══════════════════════════════════════════════════ */
    function startResendCooldown() {
        let remaining = RESEND_SECONDS;
        resendBtn.disabled = true;
        resendTimer.style.display = '';
        timerCount.textContent = remaining;

        clearInterval(resendIntervalId);
        resendIntervalId = setInterval(() => {
            remaining -= 1;
            timerCount.textContent = remaining;
            if (remaining <= 0) {
                clearInterval(resendIntervalId);
                resendBtn.disabled = false;
                resendTimer.style.display = 'none';
            }
        }, 1000);
    }

    /* ══════════════════════════════════════════════════
       STEP 1 — Request reset code
    ══════════════════════════════════════════════════ */
    function initStep1() {
        forgotForm?.addEventListener('submit', async e => {
            e.preventDefault();
            const email = resetEmailEl.value.trim();

            if (!email) { setError(resetEmailEl, errResetEmail, 'Please enter your email address.'); return; }
            if (!isValidEmail(email)) { setError(resetEmailEl, errResetEmail, 'Enter a valid email address.'); return; }
            setError(resetEmailEl, errResetEmail, null);

            setButtonLoading(resetBtn, resetBtnText, resetBtnSpinner, true, 'Sending…', 'Send reset code');
            try {
                await postJSON('/forgot-password', { email });
                submittedEmail = email;
                sentEmailDisplay.textContent = email;
                showPanel(panelCode);
                startResendCooldown();
                showToast('Reset code sent. Check your inbox.');
            } catch (err) {
                showToast(err.message || 'Could not send reset code.', 'error');
            } finally {
                setButtonLoading(resetBtn, resetBtnText, resetBtnSpinner, false, 'Sending…', 'Send reset code');
            }
        });

        resetEmailEl?.addEventListener('input', () => setError(resetEmailEl, errResetEmail, null));
    }

    /* ══════════════════════════════════════════════════
       STEP 2 — Verify code
    ══════════════════════════════════════════════════ */
    function initStep2() {
        codeForm?.addEventListener('submit', async e => {
            e.preventDefault();
            const code = resetCodeEl.value.trim();

            if (!code) { setError(resetCodeEl, errResetCode, 'Please enter the 6-digit code.'); return; }
            if (!isValidCode(code)) { setError(resetCodeEl, errResetCode, 'Enter the 6-digit code exactly as sent.'); return; }
            setError(resetCodeEl, errResetCode, null);

            setButtonLoading(verifyBtn, verifyBtnText, verifyBtnSpinner, true, 'Verifying…', 'Verify code');
            try {
                await postJSON('/verify-reset-code', { email: submittedEmail, code });
                resetCodeValue = code;
                showPanel(panelNewPassword);
            } catch (err) {
                setError(resetCodeEl, errResetCode, err.message || 'Invalid or expired code.');
            } finally {
                setButtonLoading(verifyBtn, verifyBtnText, verifyBtnSpinner, false, 'Verifying…', 'Verify code');
            }
        });

        resetCodeEl?.addEventListener('input', () => setError(resetCodeEl, errResetCode, null));

        resendBtn?.addEventListener('click', async () => {
            setButtonLoading(resendBtn, resendBtnText, resendBtnSpinner, true, 'Resending…', 'Resend code');
            try {
                await postJSON('/forgot-password', { email: submittedEmail });
                showToast('Code resent.');
                startResendCooldown();
            } catch (err) {
                showToast(err.message || 'Could not resend code.', 'error');
            } finally {
                setButtonLoading(resendBtn, resendBtnText, resendBtnSpinner, false, 'Resending…', 'Resend code');
            }
        });

        backToEmail?.addEventListener('click', e => {
            e.preventDefault();
            clearInterval(resendIntervalId);
            resetCodeEl.value = '';
            setError(resetCodeEl, errResetCode, null);
            showPanel(panelRequest);
        });
    }

    /* ══════════════════════════════════════════════════
       STEP 3 — Set new password
    ══════════════════════════════════════════════════ */
    function initStep3() {
        newPasswordForm?.addEventListener('submit', async e => {
            e.preventDefault();
            const pw = newPasswordEl.value;
            const confirm = confirmPasswordEl.value;
            let hasError = false;

            if (!pw || pw.length < 8) {
                setError(newPasswordEl, errNewPassword, 'Password must be at least 8 characters.');
                hasError = true;
            } else {
                setError(newPasswordEl, errNewPassword, null);
            }

            if (!confirm || confirm !== pw) {
                setError(confirmPasswordEl, errConfirmPassword, 'Passwords do not match.');
                hasError = true;
            } else {
                setError(confirmPasswordEl, errConfirmPassword, null);
            }

            if (hasError) return;

            setButtonLoading(savePasswordBtn, savePasswordBtnText, savePasswordBtnSpinner, true, 'Saving…', 'Save new password');
            try {
                await postJSON('/reset-password', {
                    email: submittedEmail,
                    code: resetCodeValue,
                    password: pw,
                    password_confirmation: confirm,
                });
                showPanel(panelSuccess);
            } catch (err) {
                showToast(err.message || 'Could not update password.', 'error');
            } finally {
                setButtonLoading(savePasswordBtn, savePasswordBtnText, savePasswordBtnSpinner, false, 'Saving…', 'Save new password');
            }
        });

        newPasswordEl?.addEventListener('input', () => setError(newPasswordEl, errNewPassword, null));
        confirmPasswordEl?.addEventListener('input', () => setError(confirmPasswordEl, errConfirmPassword, null));
    }

    /* ══════════════════════════════════════════════════
       BOOT
    ══════════════════════════════════════════════════ */
    initTheme();
    initStep1();
    initStep2();
    initStep3();
    showPanel(panelRequest);
});
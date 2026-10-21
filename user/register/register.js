// my-profile.js — My Profile (student side)
// Talks to the Laravel API:
//   GET    /profile            -> { user }
//   PUT    /profile            -> { user }   body: fname, lname, email
//   PUT    /profile/password   -> { message } body: current_password, password, password_confirmation
//   POST   /profile/avatar     -> { user }   multipart: avatar
//   DELETE /profile/avatar     -> { user }
//   GET    /dashboard/stats    -> { submissions, approved, ... }

const API_BASE = 'https://aideanc-production-84b5.up.railway.app/api';
const LOGIN_URL = '../login/login.html';
const THEME_KEY = 'aidea_user_theme'; // shared with the other student pages

const $ = id => document.getElementById(id);

// ── Session + API ──────────────────────────────────────────────────────────

const getToken = () => localStorage.getItem('auth_token') || null;

function getUser() {
    try { return JSON.parse(localStorage.getItem('aidea_user')); }
    catch { return null; }
}

function saveUser(user) {
    try { localStorage.setItem('aidea_user', JSON.stringify(user)); } catch { }
}

function clearSession() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('aidea_user');
}

class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

// json → JSON body, form → FormData (multipart). Throws ApiError with a readable message.
async function api(path, { method = 'GET', json, form } = {}) {
    const headers = { 'Authorization': `Bearer ${getToken()}`, 'Accept': 'application/json' };
    let body;
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    else if (form) { body = form; } // browser sets the multipart boundary

    let res;
    try { res = await fetch(`${API_BASE}${path}`, { method, headers, body }); }
    catch { throw new ApiError(0, 'Can’t reach the server. Check your connection.'); }

    if (res.status === 401) {
        clearSession();
        window.location.href = LOGIN_URL;
        throw new ApiError(401, 'Session expired');
    }

    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }

    if (!res.ok) {
        const firstError = data?.errors ? Object.values(data.errors)[0]?.[0] : null;
        throw new ApiError(res.status, firstError || data?.message || `Request failed (${res.status})`);
    }
    return data;
}

// Merge the server's user into the local session copy
function mergeUser(user, payload) {
    const fresh = payload?.user ?? payload?.data ?? null;
    if (!fresh || typeof fresh !== 'object') return;
    Object.assign(user, fresh);
    if ('avatar_url' in fresh) delete user.avatar; // server is the source of truth for the photo
    saveUser(user);
}

async function performSignOut() {
    const token = getToken();
    if (token) {
        try {
            await fetch(`${API_BASE}/logout`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            });
        } catch { /* clear the session locally regardless */ }
    }
    clearSession();
    window.location.href = LOGIN_URL;
}

// ── Theme ──────────────────────────────────────────────────────────────────

const currentTheme = () => document.documentElement.getAttribute('data-theme') || 'light';

function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) { try { localStorage.setItem(THEME_KEY, theme); } catch { } }
    $('themeBtn')?.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    document.querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'dark' ? '#050a17' : '#0a1a3f');
}

function initTheme() {
    applyTheme(currentTheme(), false);
    $('themeBtn')?.addEventListener('click', () => applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true));

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', e => {
        let saved = null;
        try { saved = localStorage.getItem(THEME_KEY); } catch { }
        if (!saved) applyTheme(e.matches ? 'dark' : 'light', false);
    });
}

// ── Drawer, profile menu, sign-out modal ───────────────────────────────────

function initDrawer() {
    const sidebar = $('sidebar'), scrim = $('scrim'), btn = $('menuBtn');
    if (!sidebar || !scrim || !btn) return;

    const set = open => {
        sidebar.classList.toggle('open', open);
        scrim.hidden = !open;
        document.body.classList.toggle('no-scroll', open);
        btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => set(!sidebar.classList.contains('open')));
    scrim.addEventListener('click', () => set(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') set(false); });
    sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', () => set(false)));
    window.matchMedia('(min-width: 1025px)').addEventListener?.('change', e => { if (e.matches) set(false); });
}

function initProfileMenu() {
    const btn = $('profileBtn'), menu = $('profileMenu');
    if (!btn || !menu) return;

    const setOpen = open => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', e => { e.stopPropagation(); setOpen(menu.hidden); });
    document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); }
    });
}

function initSignOutModal() {
    const modal = $('signOutModal'), cancel = $('signOutCancel'), confirmBtn = $('signOutConfirm');
    if (!modal || !cancel || !confirmBtn) return;

    const open = () => {
        $('profileMenu').hidden = true;
        $('profileBtn').setAttribute('aria-expanded', 'false');
        modal.hidden = false;
        document.body.classList.add('no-scroll');
        cancel.focus();
    };
    const close = () => {
        modal.hidden = true;
        if (!$('sidebar')?.classList.contains('open')) document.body.classList.remove('no-scroll');
        $('profileBtn')?.focus();
    };

    $('signOutBtn')?.addEventListener('click', open);
    cancel.addEventListener('click', close);
    confirmBtn.addEventListener('click', performSignOut);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => {
        if (modal.hidden) return;
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === cancel) { e.preventDefault(); confirmBtn.focus(); }
            else if (!e.shiftKey && document.activeElement === confirmBtn) { e.preventDefault(); cancel.focus(); }
        }
    });
}

// ── Identity helpers ───────────────────────────────────────────────────────

function splitName(user) {
    // Your API returns fname / lname — prefer them so multi-word first names stay intact
    if (user.fname || user.lname) {
        return { first: String(user.fname || '').trim(), last: String(user.lname || '').trim() };
    }
    const full = (user.full_name || user.name
        || [user.fname, user.lname].filter(Boolean).join(' ')).trim();
    const parts = full.split(/\s+/).filter(Boolean);
    return { first: parts[0] || '', last: parts.slice(1).join(' ') };
}

function makeInitials(first, last) {
    return ((first[0] || '') + (last[0] || first[1] || '')).toUpperCase() || 'ST';
}

// Only allow normal image URLs (server URL, or a legacy local data URL)
function avatarSrc(user) {
    const u = user.avatar_url || user.avatar;
    return typeof u === 'string' && /^(https?:\/\/|data:image\/)/i.test(u) ? u : null;
}

// Shows the photo if one exists, otherwise the initials
function setAvatar(el, user, initials) {
    if (!el) return;
    el.textContent = '';
    const src = avatarSrc(user);
    if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.addEventListener('error', () => { el.textContent = initials; }); // broken URL → initials
        el.appendChild(img);
    } else {
        el.textContent = initials;
    }
}

// Updates the sidebar footer and the identity card from a user object
function renderIdentity(user) {
    const { first, last } = splitName(user);
    const fullName = [first, last].filter(Boolean).join(' ') || 'Student';
    const initials = makeInitials(first, last);
    const hasPhoto = !!avatarSrc(user);

    const q = s => document.querySelector(s);
    setAvatar(q('.footer-avatar'), user, initials);
    if (q('.footer-name')) q('.footer-name').textContent = fullName;
    if (q('.footer-role')) q('.footer-role').textContent = user.course || 'Student';

    setAvatar($('avatarCircle'), user, initials);
    if ($('removePhoto')) $('removePhoto').hidden = !hasPhoto;
    if ($('changePhoto')) $('changePhoto').textContent = hasPhoto ? 'Change photo' : 'Upload photo';
    $('displayName').textContent = fullName;
    $('displayRole').textContent = user.course || 'Student';
    $('displayEmail').textContent = user.email || '';
}

function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.textContent = msg;
    $('toastWrap').appendChild(el);
    setTimeout(() => el.remove(), 3200);
}

// Disable a button + change its label while an async action runs
async function withBusy(btn, busyLabel, fn) {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = busyLabel;
    try { return await fn(); }
    finally { btn.disabled = false; btn.textContent = label; }
}

// ── Personal information form ──────────────────────────────────────────────

function initProfileForm(user) {
    const form = $('profileForm');
    const toggleBtn = $('toggleEdit');
    const actions = $('formActions');
    const submitBtn = form.querySelector('[type="submit"]');
    const fields = [...form.querySelectorAll('input, select')];
    let editing = false;

    const fill = () => {
        const { first, last } = splitName(user);
        $('firstName').value = first;
        $('lastName').value = last;
        $('email').value = user.email || '';
    };

    const setEditing = on => {
        editing = on;
        fields.forEach(f => { f.disabled = !on; });
        actions.hidden = !on;
        toggleBtn.textContent = on ? 'Cancel' : 'Edit';
        if (on) $('firstName').focus();
    };

    toggleBtn.addEventListener('click', () => {
        if (editing) fill(); // cancel: restore saved values
        setEditing(!editing);
    });
    $('cancelEdit').addEventListener('click', () => { fill(); setEditing(false); });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const first = $('firstName').value.trim();
        const last = $('lastName').value.trim();
        const email = $('email').value.trim();

        if (!first) return toast('First name is required.', 'error');
        if (!last) return toast('Last name is required.', 'error');
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email address.', 'error');

        try {
            const data = await withBusy(submitBtn, 'Saving…', () => api('/profile', {
                method: 'PUT',
                json: { fname: first, lname: last, email },
            }));
            mergeUser(user, data);
            renderIdentity(user);
            fill();
            setEditing(false);
            toast('Profile updated successfully!');
        } catch (err) {
            toast(err.message, 'error'); // stay in edit mode so nothing is lost
        }
    });

    fill();
    return { fill, isEditing: () => editing };
}

// ── Password form ──────────────────────────────────────────────────────────

function initPasswordForm() {
    const toggleBtn = $('togglePassword');
    const box = $('passwordFields');
    const saveBtn = $('savePassword');
    const ids = ['currentPass', 'newPass', 'confirmPass'];

    const setOpen = open => {
        box.hidden = !open;
        toggleBtn.textContent = open ? 'Cancel' : 'Change';
        toggleBtn.setAttribute('aria-expanded', String(open));
        if (!open) ids.forEach(id => { $(id).value = ''; });
        else $('currentPass').focus();
    };

    toggleBtn.addEventListener('click', () => setOpen(box.hidden));
    $('cancelPassword').addEventListener('click', () => setOpen(false));

    saveBtn.addEventListener('click', async () => {
        const [cur, nw, conf] = ids.map(id => $(id).value);
        if (!cur || !nw || !conf) return toast('Please fill all password fields.', 'error');
        if (nw !== conf) return toast('New passwords do not match.', 'error');
        if (nw.length < 8) return toast('Password must be at least 8 characters.', 'error');

        try {
            await withBusy(saveBtn, 'Updating…', () => api('/profile/password', {
                method: 'PUT',
                json: { current_password: cur, password: nw, password_confirmation: conf },
            }));
            setOpen(false);
            toast('Password updated successfully!');
        } catch (err) {
            toast(err.message, 'error');
        }
    });
}

// ── Stats (same endpoint the dashboard uses) ───────────────────────────────

async function loadStats() {
    try {
        const d = await api('/dashboard/stats');
        $('pstat-submissions').textContent = d.submissions ?? '—';
        $('pstat-approved').textContent = d.approved ?? '—';
    } catch (err) {
        console.warn('Stats error:', err);
    }
}

// ── Profile photo ──────────────────────────────────────────────────────────

const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // reject huge originals before resizing
const PHOTO_SIZE = 256;                  // uploaded as a 256×256 JPEG square

function resizeToSquare(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const side = Math.min(img.width, img.height);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = PHOTO_SIZE;
            canvas.getContext('2d').drawImage(
                img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
            URL.revokeObjectURL(url);
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('Encode failed')), 'image/jpeg', 0.85);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bad image')); };
        img.src = url;
    });
}

function initPhoto(user) {
    const input = $('photoInput');
    const changeBtn = $('changePhoto');
    const removeBtn = $('removePhoto');
    if (!input) return;

    changeBtn.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        input.value = ''; // allow picking the same file again
        if (!file) return;
        if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return toast('Please choose a PNG, JPG or WebP image.', 'error');
        if (file.size > PHOTO_MAX_BYTES) return toast('Image is too large (max 5 MB).', 'error');

        let blob;
        try { blob = await resizeToSquare(file); }
        catch { return toast('Couldn’t read that image. Try another one.', 'error'); }

        const form = new FormData();
        form.append('avatar', blob, 'avatar.jpg');

        try {
            const data = await withBusy(changeBtn, 'Uploading…', () => api('/profile/avatar', { method: 'POST', form }));
            mergeUser(user, data);
            renderIdentity(user);
            toast('Profile photo updated!');
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    removeBtn.addEventListener('click', async () => {
        try {
            const data = await withBusy(removeBtn, 'Removing…', () => api('/profile/avatar', { method: 'DELETE' }));
            mergeUser(user, data);
            renderIdentity(user);
            toast('Profile photo removed.');
        } catch (err) {
            toast(err.message, 'error');
        }
    });
}

// Pull the latest profile so changes made elsewhere show up
async function refreshProfile(user, profileForm) {
    try {
        mergeUser(user, await api('/profile'));
        renderIdentity(user);
        if (!profileForm.isEditing()) profileForm.fill(); // never overwrite what they're typing
    } catch (err) {
        console.warn('Profile refresh error:', err); // keep showing the cached session data
    }
}

// ── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!getToken() || !user) {
        window.location.href = LOGIN_URL;
        return;
    }

    initTheme();
    initDrawer();
    initProfileMenu();
    initSignOutModal();

    // Render instantly from the cached session, then sync with the server
    renderIdentity(user);
    const profileForm = initProfileForm(user);
    initPasswordForm();
    initPhoto(user);

    refreshProfile(user, profileForm);
    loadStats();
});
(function () {
    'use strict';

    const TAG = '[LBC-IA]';
    const ext = globalThis.browser ?? globalThis.chrome;

    const PREF_DEFS = {
        autoInject:      { key: 'lbc_ia_auto_inject',      def: true },
        autoSubmit:      { key: 'lbc_ia_auto_submit',      def: true },
        chatgptTemp:     { key: 'lbc_ia_chatgpt_temp',     def: false },
        showChatGPT:     { key: 'lbc_ia_show_chatgpt',     def: true },
        showGemini:      { key: 'lbc_ia_show_gemini',      def: true },
        showDeepSeek:    { key: 'lbc_ia_show_deepseek',    def: true },
        showClaude:      { key: 'lbc_ia_show_claude',      def: true },
        excludeShipping: { key: 'lbc_ia_exclude_shipping', def: true },
        userNote:        { key: 'lbc_ia_user_note',        def: '' }
    };

    function storageGet(keys) {
        return new Promise((resolve) => {
            if (!ext?.storage?.local) {
                resolve({});
                return;
            }
            try {
                const res = ext.storage.local.get(keys, (items) => {
                    if (ext.runtime?.lastError) {
                        console.warn(TAG, 'Lecture stockage impossible :', ext.runtime.lastError.message);
                        resolve({});
                        return;
                    }
                    resolve(items || {});
                });
                if (res && typeof res.then === 'function') {
                    res.then((items) => resolve(items || {})).catch(() => resolve({}));
                }
            } catch {
                resolve({});
            }
        });
    }

    function storageSet(payload) {
        return new Promise((resolve) => {
            if (!ext?.storage?.local) {
                resolve(false);
                return;
            }
            try {
                const res = ext.storage.local.set(payload, () => {
                    if (ext.runtime?.lastError) {
                        console.warn(TAG, 'Écriture stockage impossible :', ext.runtime.lastError.message);
                        resolve(false);
                        return;
                    }
                    resolve(true);
                });
                if (res && typeof res.then === 'function') {
                    res.then(() => resolve(true)).catch(() => resolve(false));
                }
            } catch {
                resolve(false);
            }
        });
    }

    async function loadPrefs() {
        const defaults = {};
        const keyToName = {};
        for (const [name, { key, def }] of Object.entries(PREF_DEFS)) {
            defaults[key] = def;
            keyToName[key] = name;
        }

        const stored = await storageGet(defaults);
        const prefs = {};
        for (const [name, { key, def }] of Object.entries(PREF_DEFS)) {
            const raw = stored[key];
            if (raw === undefined || raw === null) {
                prefs[name] = def;
            } else {
                prefs[name] = typeof def === 'boolean' ? Boolean(raw) : String(raw);
            }
        }
        return prefs;
    }

    async function savePrefs(prefs) {
        const payload = {};
        for (const [name, { key, def }] of Object.entries(PREF_DEFS)) {
            const v = prefs[name];
            payload[key] = typeof def === 'boolean' ? Boolean(v ?? def) : String(v ?? '');
        }
        const ok = await storageSet(payload);
        if (!ok) {
            console.warn(TAG, 'Écriture des préférences impossible.');
        }
        return ok;
    }

    function h(tag, styles, text) {
        const node = document.createElement(tag);
        if (styles) Object.assign(node.style, styles);
        if (text) node.textContent = text;
        return node;
    }

    function currentUrl() {
        return location.href.split('#')[0];
    }

    function ensureSpinnerStyle() {
        if (document.getElementById('lbc-ia-spinner-style')) return;
        const style = document.createElement('style');
        style.id = 'lbc-ia-spinner-style';
        style.textContent = `
            @keyframes lbc-ia-spin { to { transform: rotate(360deg); } }
            .lbc-ia-spinner {
                display: inline-block;
                width: 12px; height: 12px;
                border: 2px solid #cbd5e1;
                border-top-color: #1e40af;
                border-radius: 50%;
                animation: lbc-ia-spin 0.8s linear infinite;
                vertical-align: middle;
            }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            /* repli */
        }
        const ta = h('textarea', { position: 'fixed', opacity: '0', top: '0', left: '0' });
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch {
            /* ignoré */
        }
        ta.remove();
        return ok;
    }

    function appendParam(url, key, value) {
        return url + (url.includes('?') ? '&' : '?') + key + '=' + encodeURIComponent(value);
    }

    function openInNewTab(url) {
        const a = h('a', { display: 'none' });
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function showToast(text, duration, options = {}) {
        let toast = document.getElementById('lbc-ia-toast');
        if (!toast) {
            toast = h('div', {
                position: 'fixed',
                bottom: '90px',
                left: '16px',
                backgroundColor: '#0f172a',
                color: '#f8fafc',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'system-ui, sans-serif',
                lineHeight: '1.5',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: '999999',
                transition: 'opacity 0.3s ease',
                opacity: '1',
                maxWidth: '460px',
                maxHeight: '70vh',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
            });
            toast.id = 'lbc-ia-toast';
            document.body.appendChild(toast);
        }

        toast.style.pointerEvents = options.selectable ? 'auto' : 'none';
        toast.style.userSelect = options.selectable ? 'text' : 'none';
        toast.style.cursor = options.selectable ? 'text' : 'default';

        if (toast._dismissHandler) {
            document.removeEventListener('pointerdown', toast._dismissHandler, true);
            toast._dismissHandler = null;
        }

        toast.textContent = text;
        toast.style.opacity = '1';
        clearTimeout(toast._timer);

        const dur = typeof duration === 'number' ? duration : (text.startsWith('⚠️') ? 8000 : 4000);
        if (dur > 0) {
            toast._timer = setTimeout(() => {
                toast.style.opacity = '0';
            }, dur);
        }

        if (options.dismissOnOutsideClick) {
            const handler = (e) => {
                if (toast.contains(e.target)) return;
                toast.style.opacity = '0';
                clearTimeout(toast._timer);
                document.removeEventListener('pointerdown', handler, true);
                if (toast._dismissHandler === handler) toast._dismissHandler = null;
            };
            toast._dismissHandler = handler;
            setTimeout(() => {
                if (toast._dismissHandler === handler) {
                    document.addEventListener('pointerdown', handler, true);
                }
            }, 0);
        }
    }

    globalThis.LBC_IA_COMMON = {
        TAG,
        ext,
        PREF_DEFS,
        loadPrefs,
        savePrefs,
        h,
        currentUrl,
        ensureSpinnerStyle,
        copyToClipboard,
        appendParam,
        openInNewTab,
        showToast
    };
})();

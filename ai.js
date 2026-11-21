(function () {
    'use strict';

    const { TAG, currentUrl } = globalThis.LBC_IA_COMMON;
    const host = location.hostname;

    const log = (...args) => console.log(TAG, ...args);
    const warn = (...args) => console.warn(TAG, ...args);

    const AI_SELECTORS = {
        'chatgpt.com': {
            editor: [
                'div[data-testid="prompt-textarea"][contenteditable="true"]',
                'div.ProseMirror[contenteditable="true"]',
                '#prompt-textarea',
                'textarea#prompt-textarea'
            ],
            send: [
                'button[data-testid="send-button"]',
                'button[aria-label="Send message"]',
                'button[aria-label*="Send" i]',
                'button[aria-label*="Envoyer" i]'
            ]
        },
        'chat.deepseek.com': {
            editor: [
                'textarea#chat-input',
                'textarea[placeholder]',
                'div[contenteditable="true"][role="textbox"]',
                'textarea'
            ],
            send: [
                'button[aria-label="Send"]',
                'button[aria-label="Send message"]',
                'button[aria-label="发送消息"]',
                'button[aria-label="发送"]',
                'button[aria-label*="Send" i]',
                'button[aria-label*="Envoyer" i]',
                'div[role="button"][aria-label*="Send" i]',
                'div[role="button"][aria-label*="发送"]'
            ]
        },
        'gemini.google.com': {
            editor: [
                '.ql-editor[contenteditable="true"]',
                'rich-textarea [contenteditable="true"]',
                'div[contenteditable="true"][role="textbox"]',
                'div[contenteditable="true"]'
            ],
            send: [
                'button[aria-label="Send message"]',
                'button[aria-label*="Send" i]',
                'button[aria-label*="Envoyer" i]'
            ]
        },
        'claude.ai': {
            editor: [
                'div.ProseMirror[contenteditable="true"]',
                'div[contenteditable="true"][role="textbox"]',
                'div[contenteditable="true"]'
            ],
            send: [
                'button[aria-label="Send message"]',
                'button[aria-label*="Send" i]',
                'button[aria-label*="Envoyer" i]'
            ]
        }
    };

    function initAI() {
        const cfg = AI_SELECTORS[host];
        const params = new URLSearchParams(location.search);
        const prompt = params.get('lbc_prompt') || params.get('q');
        const noInject = params.get('lbc_no_inject') === '1';
        const noSubmit = params.get('lbc_no_submit') === '1';

        if (!cfg || !prompt) {
            log('Rien à faire sur', host);
            return;
        }

        log('Page IA :', host, '| prompt :', prompt.length, 'caractères');

        const INJECT_MAX_TRIES = 40;
        const SEND_MAX_TRIES = 30;
        const SEND_ENTER_AT = 10;
        const RETRY_MS = 500;

        const findFirst = (selectors) => {
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return { el, sel };
            }
            return null;
        };

        const readEditor = (el) =>
            el.tagName === 'TEXTAREA' ? el.value : (el.innerText || el.textContent || '');

        const isEnabled = (el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true';

        function cleanUrl() {
            try {
                const url = new URL(currentUrl());
                ['lbc_prompt', 'lbc_no_inject', 'lbc_no_submit'].forEach((k) => url.searchParams.delete(k));
                history.replaceState(history.state, '', url);
            } catch {
                /* sans importance */
            }
        }

        function fillEditor(el, text) {
            el.focus();
            if (el.tagName === 'TEXTAREA') {
                const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
                if (setter) setter.call(el, text);
                else el.value = text;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return;
            }
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            selection.removeAllRanges();
            selection.addRange(range);
            let ok = false;
            try {
                ok = document.execCommand('insertText', false, text);
            } catch {
                /* repli */
            }
            if (!ok) el.textContent = text;
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }

        function pressEnter() {
            const found = findFirst(cfg.editor);
            if (!found || !readEditor(found.el).trim()) return;
            const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
            found.el.dispatchEvent(new KeyboardEvent('keydown', opts));
            found.el.dispatchEvent(new KeyboardEvent('keyup', opts));
        }

        function trySend(tries = 0) {
            const btn = findFirst(cfg.send);
            if (btn && isEnabled(btn.el)) {
                btn.el.click();
                cleanUrl();
                return;
            }
            if (tries === SEND_ENTER_AT) pressEnter();
            if (tries >= SEND_MAX_TRIES) {
                cleanUrl();
                return;
            }
            setTimeout(() => trySend(tries + 1), RETRY_MS);
        }

        function inject(tries = 0) {
            if (noInject) {
                cleanUrl();
                return;
            }
            const found = findFirst(cfg.editor);
            if (!found) {
                if (tries >= INJECT_MAX_TRIES) {
                    warn('Éditeur introuvable.');
                    return;
                }
                setTimeout(() => inject(tries + 1), RETRY_MS);
                return;
            }
            if (readEditor(found.el).trim().length > 20) {
                log('Champ déjà rempli, injection ignorée.');
            } else {
                fillEditor(found.el, prompt);
            }
            if (noSubmit) {
                cleanUrl();
            } else {
                setTimeout(() => trySend(0), 800);
            }
        }

        inject();
    }

    if (AI_SELECTORS[host]) {
        initAI();
    }
})();

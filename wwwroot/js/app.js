(() => {
    'use strict';

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const motion = ms => (reduceMotion ? 0 : ms);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const fmt = n => Math.round(n).toLocaleString('en-US');
    const scrollBehavior = reduceMotion ? 'auto' : 'smooth';
    const token = $('input[name="__RequestVerificationToken"]')?.value ?? '';
    const HEX = /^[0-9a-fA-F]*$/;
    const STAGE_MAX_HEIGHT = 400;

    const svg = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
    const ICONS = {
        check: svg('<path d="m5 12 5 5 9-10"/>'),
        cross: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
        unlock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
    };

    // ------------------------------------------------------------------ hero ticker

    const ticker = $('#hexTicker');
    if (ticker) {
        const hex = '0123456789ABCDEF';
        const group = () => Array.from({ length: 8 }, () => hex[(Math.random() * 16) | 0]).join('');
        const line = Array.from({ length: 110 }, group).join('  ');
        ticker.textContent = `${line}  ${line}  `; // doubled so the -50% scroll loops seamlessly
    }

    // ------------------------------------------------------------------ tabs & navigation

    const tabs = $$('.tab');
    const indicator = $('.tab-indicator');
    const workspace = $('#workspace');

    function moveIndicator() {
        const active = $('.tab.active');
        if (!active || !indicator) return;
        indicator.style.width = `${active.offsetWidth}px`;
        indicator.style.transform = `translateX(${active.offsetLeft}px)`;
    }

    function selectTab(name) {
        tabs.forEach(tab => {
            const on = tab.dataset.tab === name;
            tab.classList.toggle('active', on);
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
        });
        $$('.panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === name));
        moveIndicator();
        requestAnimationFrame(refitCanvases);
    }

    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => selectTab(tab.dataset.tab));
        tab.addEventListener('keydown', e => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            selectTab(next.dataset.tab);
            next.focus();
        });
    });

    $$('[data-goto]').forEach(btn => btn.addEventListener('click', () => {
        selectTab(btn.dataset.goto);
        workspace?.scrollIntoView({ behavior: scrollBehavior, block: 'start' });
    }));
    $$('[data-scroll]').forEach(btn => btn.addEventListener('click', () =>
        $(btn.dataset.scroll)?.scrollIntoView({ behavior: scrollBehavior, block: 'start' })));

    window.addEventListener('resize', () => { moveIndicator(); refitCanvases(); });
    document.fonts?.ready.then(moveIndicator);
    moveIndicator();

    // Dropping a file anywhere outside a stage would make the browser navigate away to it.
    ['dragover', 'drop'].forEach(type => window.addEventListener(type, e => {
        if (!e.target.closest?.('.stage')) e.preventDefault();
    }));

    // ------------------------------------------------------------------ small UI helpers

    function toast(message, tone = 'info') {
        const el = document.createElement('div');
        el.className = `toast ${tone}`;
        el.setAttribute('role', tone === 'error' ? 'alert' : 'status');
        el.textContent = message;
        $('#toasts').appendChild(el);
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 400);
        }, tone === 'error' ? 5200 : 2800);
    }

    function replay(el, className) {
        el.classList.remove(className);
        void el.offsetWidth; // restart the CSS animation
        el.classList.add(className);
    }

    const shake = el => replay(el, 'shake');

    function setBusy(btn, busy, label) {
        const text = $('.btn-text', btn);
        if (busy) {
            btn.dataset.idleText = text.textContent;
            text.textContent = label;
        } else if (btn.dataset.idleText) {
            text.textContent = btn.dataset.idleText;
        }
        btn.classList.toggle('loading', busy);
        btn.disabled = busy;
        btn.setAttribute('aria-busy', String(busy));
    }

    function setSteps(list, active) {
        $$('li', list).forEach((li, i) => {
            li.classList.toggle('done', active >= 0 && i < active);
            li.classList.toggle('active', i === active);
        });
    }

    function countUp(el, to, { decimals = 0, suffix = '', duration = 900 } = {}) {
        const render = v => {
            el.textContent = v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        };
        if (reduceMotion) return render(to);
        const start = performance.now();
        const frame = now => {
            const t = Math.min(1, (now - start) / duration);
            render(to * (1 - Math.pow(1 - t, 3)));
            if (t < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    // "Decodes" hex text into place, character by character.
    function scramble(el, finalText, duration = 900) {
        el.dataset.value = finalText;
        if (reduceMotion) { el.textContent = finalText; return; }
        const hex = '0123456789ABCDEF';
        const start = performance.now();
        const frame = now => {
            const t = Math.min(1, (now - start) / duration);
            const revealed = Math.floor(finalText.length * t);
            let text = finalText.slice(0, revealed);
            for (let i = revealed; i < finalText.length; i++) text += hex[(Math.random() * 16) | 0];
            el.textContent = text;
            if (t < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    function setLeak(root, percent, { neutral = false } = {}) {
        const leaking = !neutral && percent >= 0.5;
        root.classList.toggle('leaking', leaking);
        const fill = $('.meter-fill', root);
        fill.style.width = '0%';
        requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${Math.max(percent, 1.2)}%`; }));
        countUp($('.meter-value', root), percent, { decimals: 1, suffix: '%' });
        const verdict = $('.meter-verdict', root);
        if (verdict) {
            verdict.textContent = leaking
                ? 'Pattern leaked: identical plaintext blocks turned into identical ciphertext blocks.'
                : 'Looks random: no repeated blocks give the picture away.';
        }
    }

    function resetLeak(root) {
        root.classList.remove('leaking');
        $('.meter-fill', root).style.width = '0%';
        $('.meter-value', root).textContent = '–';
    }

    function burst(anchor) {
        if (reduceMotion) return;
        const rect = anchor.getBoundingClientRect();
        const colors = ['#1cdcab', '#7cf5d4', '#ffffff', '#16b88e'];
        for (let i = 0; i < 36; i++) {
            const p = document.createElement('span');
            const angle = Math.random() * Math.PI * 2;
            const distance = 50 + Math.random() * 120;
            p.className = 'particle';
            p.style.left = `${rect.left + rect.width / 2}px`;
            p.style.top = `${rect.top + rect.height / 2}px`;
            p.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
            p.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
            p.style.background = colors[i % colors.length];
            document.body.appendChild(p);
            setTimeout(() => p.remove(), 1000);
        }
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            const area = document.createElement('textarea');
            area.value = text;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            const ok = document.execCommand('copy');
            area.remove();
            return ok;
        }
    }

    $$('[data-copy]').forEach(btn => btn.addEventListener('click', async () => {
        const value = $(btn.dataset.copy)?.dataset.value;
        if (!value) return;
        if (await copyText(value)) {
            btn.classList.add('copied');
            setTimeout(() => btn.classList.remove('copied'), 1200);
            toast('Copied to clipboard', 'success');
        } else {
            toast("Couldn't copy. Select the text and press Ctrl+C.", 'error');
        }
    }));

    const radioValue = name => $(`input[name="${name}"]:checked`)?.value;
    function setRadio(name, value) {
        const radio = $(`input[name="${name}"][value="${value}"]`);
        if (!radio) return;
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // ------------------------------------------------------------------ data helpers

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = src;
        });
    }

    function base64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function downloadBytes(bytes, fileName) {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function fileFromUrl(url, name) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        return new File([blob], name, { type: blob.type || 'image/png' });
    }

    async function postForm(handler, fields) {
        const body = new FormData();
        body.append('__RequestVerificationToken', token);
        for (const [name, value] of Object.entries(fields)) {
            if (value !== null && value !== undefined) body.append(name, value);
        }

        let response;
        try {
            response = await fetch(`?handler=${handler}`, { method: 'POST', body });
        } catch {
            return { ok: false, error: "Couldn't reach the server. Is the app still running?" };
        }
        try {
            return await response.json();
        } catch {
            return { ok: false, error: `The server answered with HTTP ${response.status}.` };
        }
    }

    function wireDropTarget(stage, zone, input, onFile) {
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
        });
        input.addEventListener('change', () => {
            const file = input.files[0];
            input.value = ''; // lets the same file be picked again
            if (file) onFile(file);
        });
        stage.addEventListener('dragover', e => { e.preventDefault(); stage.classList.add('drag'); });
        stage.addEventListener('dragleave', e => { if (!stage.contains(e.relatedTarget)) stage.classList.remove('drag'); });
        stage.addEventListener('drop', e => {
            e.preventDefault();
            stage.classList.remove('drag');
            const file = e.dataTransfer?.files?.[0];
            if (file) onFile(file);
        });
    }

    // ------------------------------------------------------------------ canvas & animations

    const ctxOf = canvas => canvas.getContext('2d', { willReadFrequently: true });

    // The animation works on a coarse grid of "visual blocks"; the HUD counter shows real AES blocks.
    function blockGrid(width, height) {
        const size = Math.max(4, Math.round(Math.max(width, height) / 52));
        return { size, cols: Math.ceil(width / size), rows: Math.ceil(height / size) };
    }

    function fitCanvas(canvas) {
        const stage = canvas.closest('.stage');
        const style = getComputedStyle(stage);
        const available = (stage.clientWidth || 600) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const scale = Math.min(available / canvas.width, STAGE_MAX_HEIGHT / canvas.height, 2);
        canvas.style.width = `${Math.round(canvas.width * scale)}px`;
        canvas.style.height = `${Math.round(canvas.height * scale)}px`;
    }

    function refitCanvases() {
        $$('.stage.has-image canvas').forEach(fitCanvas);
    }

    function drawImageTo(canvas, img) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = ctxOf(canvas);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        fitCanvas(canvas);
    }

    function mulberry32(seed) {
        return () => {
            seed |= 0;
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Paints "ciphertext noise" over a block. For ECB the noise is seeded from the
    // block's own content, so identical plaintext blocks get identical noise — the
    // same leak real ECB has. CBC/CTR get fresh randomness for every block.
    function makeNoisePainter(ctx, width, height, mode) {
        const src = ctx.getImageData(0, 0, width, height).data;
        return (x0, y0, size) => {
            const bw = Math.min(size, width - x0);
            const bh = Math.min(size, height - y0);
            if (bw <= 0 || bh <= 0) return;

            let rand = Math.random;
            if (mode === 'ECB') {
                let r = 0, g = 0, b = 0, a = 0, n = 0;
                for (let y = y0; y < y0 + bh; y += 2) {
                    for (let x = x0; x < x0 + bw; x += 2) {
                        const i = (y * width + x) * 4;
                        r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++;
                    }
                }
                const q = (((r / n) >> 4) << 12) | (((g / n) >> 4) << 8) | (((b / n) >> 4) << 4) | ((a / n) >> 4);
                rand = mulberry32(Math.imul(q + 1, 2654435761));
            }

            const block = ctx.createImageData(bw, bh);
            const d = block.data;
            for (let i = 0; i < d.length; i += 4) {
                d[i] = rand() * 256;
                d[i + 1] = rand() * 256;
                d[i + 2] = rand() * 256;
                d[i + 3] = 255;
            }
            ctx.putImageData(block, x0, y0);
        };
    }

    const revealPainter = (ctx, img) => (x, y, size) => {
        ctx.clearRect(x, y, size, size);
        ctx.drawImage(img, x, y, size, size, x, y, size, size);
    };

    // Sweeps through the canvas row by row (the order block modes process data),
    // with a glowing scanline and a live block counter.
    function animateBlocks(canvas, stage, counter, label, realBlocks, paintBlock, duration) {
        const width = canvas.width, height = canvas.height;
        const { size, cols, rows } = blockGrid(width, height);
        const total = cols * rows;
        const wrap = canvas.parentElement;
        const scan = $('.scanline', wrap);
        wrap.style.setProperty('--bx', `${(size / width) * 100}%`);
        wrap.style.setProperty('--by', `${(size / height) * 100}%`);
        stage.classList.add('processing');

        return new Promise(resolve => {
            const start = performance.now();
            let done = 0;
            const frame = now => {
                const t = duration ? Math.min(1, (now - start) / duration) : 1;
                const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                const target = Math.floor(total * eased);
                for (; done < target; done++) paintBlock((done % cols) * size, Math.floor(done / cols) * size, size);
                scan.style.top = `${Math.min(100, ((Math.ceil(done / cols) * size) / height) * 100)}%`;
                counter.textContent = `${label} · block ${fmt(realBlocks * eased)} / ${fmt(realBlocks)}`;
                if (t < 1) {
                    requestAnimationFrame(frame);
                } else {
                    stage.classList.remove('processing');
                    resolve();
                }
            };
            requestAnimationFrame(frame);
        });
    }

    function crossfade(canvas, img, duration) {
        const ctx = ctxOf(canvas);
        const before = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return new Promise(resolve => {
            const start = performance.now();
            const frame = now => {
                const t = duration ? Math.min(1, (now - start) / duration) : 1;
                ctx.putImageData(before, 0, 0);
                ctx.globalAlpha = t;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                ctx.globalAlpha = 1;
                if (t < 1) requestAnimationFrame(frame); else resolve();
            };
            requestAnimationFrame(frame);
        });
    }

    // Draws a .bin's raw ciphertext bytes as pixels, entirely in the browser.
    // The bytes are stored B,G,R,A (Windows 32bpp ARGB); alpha is forced opaque
    // because random alpha would just make the picture see-through.
    function renderBinPreview(bytes, canvas) {
        if (bytes.length < 8) throw new Error('That file is too small to be a ciphertext from this app.');
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const width = view.getInt32(0, true);
        const height = view.getInt32(4, true);
        if (width <= 0 || height <= 0 || width > 20000 || height > 20000) {
            throw new Error("That file doesn't look like a .bin from this app's Encrypt step.");
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = ctxOf(canvas);
        const image = ctx.createImageData(width, height);
        const out = image.data;
        const pixels = Math.min(width * height, Math.floor((bytes.length - 8) / 4));
        for (let i = 0; i < pixels; i++) {
            const s = 8 + i * 4, d = i * 4;
            out[d] = bytes[s + 2];
            out[d + 1] = bytes[s + 1];
            out[d + 2] = bytes[s];
            out[d + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
        fitCanvas(canvas);
        return { width, height, cipherBytes: bytes.length - 8 };
    }

    // ------------------------------------------------------------------ comparison slider

    function initSlider(slider) {
        let dragging = false;
        const setPos = p => {
            const v = Math.max(0, Math.min(100, p));
            slider.style.setProperty('--pos', `${v}%`);
            slider.setAttribute('aria-valuenow', String(Math.round(v)));
        };
        const fromEvent = e => {
            const rect = slider.getBoundingClientRect();
            setPos(((e.clientX - rect.left) / rect.width) * 100);
        };
        slider.addEventListener('pointerdown', e => {
            dragging = true;
            slider.dataset.touched = '1';
            slider.setPointerCapture(e.pointerId);
            fromEvent(e);
        });
        slider.addEventListener('pointermove', e => { if (dragging) fromEvent(e); });
        ['pointerup', 'pointercancel'].forEach(type => slider.addEventListener(type, () => { dragging = false; }));
        slider.addEventListener('keydown', e => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            slider.dataset.touched = '1';
            const current = parseFloat(slider.style.getPropertyValue('--pos')) || 50;
            setPos(current + (e.key === 'ArrowRight' ? 5 : -5));
        });
    }

    // Wipes the ciphertext in from the right, then settles in the middle.
    function sweepSlider(slider) {
        slider.dataset.touched = '';
        slider.style.setProperty('--pos', '100%');
        if (reduceMotion) { slider.style.setProperty('--pos', '50%'); return; }
        const start = performance.now() + 250;
        const frame = now => {
            if (slider.dataset.touched) return;
            const t = Math.max(0, Math.min(1, (now - start) / 1100));
            slider.style.setProperty('--pos', `${100 - 50 * (1 - Math.pow(1 - t, 3))}%`);
            if (t < 1) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }

    // ------------------------------------------------------------------ Encrypt tab

    const enc = { file: null, url: null, img: null, result: null };
    const encStage = $('#encStage');
    const encCanvas = $('#encCanvas');
    const encBtn = $('#encBtn');
    const encSteps = $('#encSteps');
    const encResult = $('#encResult');
    const encSlider = $('#encSlider');
    initSlider(encSlider);

    async function setEncFile(file) {
        if (file.type && !file.type.startsWith('image/')) {
            toast(`"${file.name}" isn't an image.`, 'error');
            shake(encStage);
            return;
        }
        const url = URL.createObjectURL(file);
        let img;
        try {
            img = await loadImage(url);
        } catch {
            URL.revokeObjectURL(url);
            toast(`Couldn't open "${file.name}" as an image.`, 'error');
            shake(encStage);
            return;
        }

        if (enc.url) URL.revokeObjectURL(enc.url);
        Object.assign(enc, { file, url, img, result: null });
        encStage.classList.add('has-image');
        drawImageTo(encCanvas, img);
        $('#encTag').textContent = 'Plaintext';
        $('#encFileName').textContent = `${file.name} · ${img.naturalWidth}×${img.naturalHeight}`;
        $('#encChange').hidden = false;
        encBtn.disabled = false;
        encResult.hidden = true;
        setSteps(encSteps, -1);
        setCmpFile(file, false);
    }

    wireDropTarget(encStage, $('#encDrop'), $('#encFile'), setEncFile);
    $('#encChange').addEventListener('click', () => $('#encFile').click());

    encBtn.addEventListener('click', async () => {
        if (!enc.file || encBtn.classList.contains('loading')) return;
        const mode = radioValue('encMode');
        const keySizeBits = radioValue('encKey');

        setBusy(encBtn, true, `Encrypting with AES-${keySizeBits}…`);
        encResult.hidden = true;
        drawImageTo(encCanvas, enc.img);
        $('#encTag').textContent = `Encrypting · ${mode}`;

        // The server does the real AES work while the canvas plays the animation.
        const request = postForm('Encrypt', { plaintextImage: enc.file, mode, keySizeBits });

        setSteps(encSteps, 0);
        await sleep(motion(380));
        setSteps(encSteps, 1);
        await sleep(motion(380));
        setSteps(encSteps, 2);

        const w = encCanvas.width, h = encCanvas.height;
        await animateBlocks(encCanvas, encStage, $('#encCounter'), mode, Math.ceil((w * h * 4) / 16),
            makeNoisePainter(ctxOf(encCanvas), w, h, mode), motion(1600));

        const data = await request;
        if (!data.ok) {
            setBusy(encBtn, false);
            drawImageTo(encCanvas, enc.img);
            $('#encTag').textContent = 'Plaintext';
            setSteps(encSteps, -1);
            toast(data.error, 'error');
            shake(encStage);
            return;
        }

        setSteps(encSteps, 3);
        const cipherImg = await loadImage(data.result.cipherPreview);
        await crossfade(encCanvas, cipherImg, motion(500));
        $('#encTag').textContent = `Ciphertext · ${mode}`;
        setSteps(encSteps, 4);
        enc.result = data.result;
        setBusy(encBtn, false);
        showEncResult(data.result);
    });

    function showEncResult(r) {
        encResult.hidden = false;
        replay(encResult, 'reveal');

        $('#encPlainImg').src = enc.url;
        $('#encCipherImg').src = r.cipherPreview;
        $('#encCipherLabel').textContent = `Ciphertext · ${r.mode}`;
        encSlider.style.aspectRatio = `${r.width} / ${r.height}`;
        encSlider.style.width = `min(100%, ${Math.round((420 * r.width) / r.height)}px)`;
        sweepSlider(encSlider);

        $('#encStatMode').textContent = r.mode;
        $('#encStatKey').innerHTML = `${r.keySizeBits}<small>bit · ${r.rounds} rounds</small>`;
        countUp($('#encStatBlocks'), r.blocks);
        countUp($('#encStatTime'), r.elapsedMs, { decimals: 1, suffix: ' ms' });

        setLeak($('#encLeak'), r.repeatedBlockPercent);
        $('#encPlainLeak').textContent = `For reference, the plaintext pixels had ${r.plaintextRepeatedBlockPercent.toFixed(1)}% repeated blocks.`;

        scramble($('#encKey'), r.keyHex);
        $('#encIvRow').hidden = !r.ivOrNonceHex;
        if (r.ivOrNonceHex) {
            $('#encIvLabel').textContent = r.ivLabel;
            scramble($('#encIv'), r.ivOrNonceHex);
        }

        setTimeout(() => encResult.scrollIntoView({ behavior: scrollBehavior, block: 'nearest' }), 150);
    }

    $('#encDownload').addEventListener('click', () => {
        if (!enc.result) return;
        downloadBytes(base64ToBytes(enc.result.ciphertextBase64), enc.result.fileName);
        toast(`Saved ${enc.result.fileName}`, 'success');
    });

    $('#encToDecrypt').addEventListener('click', async () => {
        const r = enc.result;
        if (!r) return;
        selectTab('decrypt');
        workspace.scrollIntoView({ behavior: scrollBehavior, block: 'start' });

        await setDecFile(new File([base64ToBytes(r.ciphertextBase64)], r.fileName, { type: 'application/octet-stream' }));
        setRadio('decMode', r.mode);
        $('#decKey').value = r.keyHex;
        $('#decIv').value = r.ivOrNonceHex ?? '';
        setOriginal(enc.file);
        flash($('#decKey'));
        if (r.ivOrNonceHex) flash($('#decIv'));
        toast(`Loaded the .bin, the key${r.ivLabel ? ` and the ${r.ivLabel}` : ''}. Press Decrypt.`, 'success');
    });

    function flash(input) {
        input.classList.remove('invalid');
        replay(input, 'flash');
    }

    // ------------------------------------------------------------------ Decrypt tab

    const dec = { file: null, bytes: null, original: null };
    const decStage = $('#decStage');
    const decCanvas = $('#decCanvas');
    const decBtn = $('#decBtn');
    const decSteps = $('#decSteps');
    const decResult = $('#decResult');
    const keyInput = $('#decKey');
    const ivInput = $('#decIv');

    async function setDecFile(file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const hadFile = Boolean(dec.file);
        let info;
        try {
            decStage.classList.add('has-image'); // the stage must be visible for the canvas to size itself
            info = renderBinPreview(bytes, decCanvas);
        } catch (err) {
            if (hadFile) renderBinPreview(dec.bytes, decCanvas);
            else decStage.classList.remove('has-image');
            toast(err.message, 'error');
            shake(decStage);
            return;
        }

        Object.assign(dec, { file, bytes });
        $('#decTag').textContent = 'Ciphertext · raw bytes as pixels';
        $('#decFileName').textContent = `${file.name} · ${info.width}×${info.height} · ${fmt(info.cipherBytes)} bytes`;
        $('#decChange').hidden = false;
        decBtn.disabled = false;
        decResult.hidden = true;
        setSteps(decSteps, -1);
    }

    wireDropTarget(decStage, $('#decDrop'), $('#decFile'), setDecFile);
    $('#decChange').addEventListener('click', () => $('#decFile').click());

    function syncIvField() {
        const mode = radioValue('decMode');
        $('#decIvField').classList.toggle('collapsed', mode === 'ECB');
        ivInput.tabIndex = mode === 'ECB' ? -1 : 0;
        if (mode !== 'ECB') $('#decIvLabel').textContent = mode === 'CBC' ? 'IV (hex)' : 'Nonce (hex)';
    }
    $$('input[name="decMode"]').forEach(radio => radio.addEventListener('change', syncIvField));
    syncIvField();

    [keyInput, ivInput].forEach(input => input.addEventListener('input', () => input.classList.remove('invalid')));

    $('#decPaste').addEventListener('click', async () => {
        try {
            keyInput.value = (await navigator.clipboard.readText()).replace(/\s+/g, '');
            flash(keyInput);
        } catch {
            toast('Clipboard access was blocked. Paste with Ctrl+V instead.', 'error');
        }
    });

    function setOriginal(file) {
        dec.original = file;
        $('#decOrigName').textContent = file ? file.name : 'None attached';
        $('#decOrigClear').hidden = !file;
    }
    $('#decAttach').addEventListener('click', () => $('#decOrigFile').click());
    $('#decOrigFile').addEventListener('change', e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (file) setOriginal(file);
    });
    $('#decOrigClear').addEventListener('click', () => setOriginal(null));

    function rejectInput(input, message) {
        input.classList.add('invalid');
        shake(input.closest('.field'));
        toast(message, 'error');
        input.focus();
    }

    decBtn.addEventListener('click', async () => {
        if (!dec.file || decBtn.classList.contains('loading')) return;
        const mode = radioValue('decMode');
        const key = keyInput.value.replace(/\s+/g, '');
        const iv = ivInput.value.replace(/\s+/g, '');

        if (!HEX.test(key) || ![32, 48, 64].includes(key.length)) {
            rejectInput(keyInput, 'The key must be 32, 48 or 64 hex characters (128, 192 or 256 bits).');
            return;
        }
        if (mode !== 'ECB' && (!HEX.test(iv) || iv.length !== 32)) {
            rejectInput(ivInput, `The ${mode === 'CBC' ? 'IV' : 'nonce'} must be exactly 32 hex characters.`);
            return;
        }

        setBusy(decBtn, true, 'Decrypting…');
        decResult.hidden = true;
        renderBinPreview(dec.bytes, decCanvas);
        $('#decTag').textContent = `Decrypting · ${mode}`;

        const request = postForm('Decrypt', {
            ciphertextFile: dec.file,
            mode,
            keyHex: key,
            ivOrNonceHex: mode === 'ECB' ? null : iv,
            originalForVerification: dec.original,
        });

        setSteps(decSteps, 0);
        await sleep(motion(350));
        setSteps(decSteps, 1);
        await sleep(motion(350));

        const data = await request;
        if (!data.ok) {
            setBusy(decBtn, false);
            setSteps(decSteps, -1);
            $('#decTag').textContent = 'Ciphertext · raw bytes as pixels';
            toast(data.error, 'error');
            shake(decStage);
            return;
        }

        setSteps(decSteps, 2);
        const r = data.result;
        const img = await loadImage(r.decryptedPreview);
        const w = decCanvas.width, h = decCanvas.height;
        await animateBlocks(decCanvas, decStage, $('#decCounter'), mode, Math.ceil((w * h * 4) / 16),
            revealPainter(ctxOf(decCanvas), img), motion(1500));
        $('#decTag').textContent = 'Decrypted plaintext';

        setSteps(decSteps, 3);
        await sleep(motion(300));
        setSteps(decSteps, 4);
        setBusy(decBtn, false);
        showDecResult(r);
    });

    function showDecResult(r) {
        decResult.hidden = false;
        replay(decResult, 'reveal');

        const verdict = $('#decVerdict');
        const icon = $('.verdict-icon', verdict);
        let tone, title, sub;
        if (r.match === true) {
            tone = 'success';
            icon.innerHTML = ICONS.check;
            title = 'Perfect match';
            sub = `All ${fmt(r.width * r.height)} pixels came back byte-for-byte identical to the original.`;
        } else if (r.match === false) {
            tone = 'fail';
            icon.innerHTML = ICONS.cross;
            title = "Doesn't match the original";
            sub = r.mode === 'CTR'
                ? 'CTR never errors on a wrong key or nonce. It XORs with the wrong keystream, so you get noise instead of the picture.'
                : 'The decrypted pixels differ from the original image you attached.';
        } else {
            tone = 'neutral';
            icon.innerHTML = ICONS.unlock;
            title = 'Decrypted';
            sub = 'Attach the original image to check the result byte-for-byte.';
        }
        verdict.className = 'verdict';
        void verdict.offsetWidth;
        verdict.classList.add(tone, 'pop');
        $('#decVerdictTitle').textContent = title;
        $('#decVerdictSub').textContent = sub;

        $('#decStatMode').textContent = r.mode;
        $('#decStatSize').textContent = `${r.width}×${r.height}`;
        countUp($('#decStatTime'), r.elapsedMs, { decimals: 1, suffix: ' ms' });

        if (tone === 'success') setTimeout(() => burst(icon), motion(250));
        setTimeout(() => decResult.scrollIntoView({ behavior: scrollBehavior, block: 'nearest' }), 150);
    }

    // ------------------------------------------------------------------ Compare tab

    const cmp = { file: null, url: null, own: false };
    const cmpBtn = $('#cmpBtn');
    const plainCard = $('.tri-card[data-mode="PLAIN"]');

    function setTriImage(card, src, alt) {
        const box = $('.tri-img', card);
        box.classList.remove('loading');
        const img = new Image();
        img.alt = alt;
        img.src = src;
        box.replaceChildren(img);
    }

    // own = picked on this tab; an image picked here isn't overridden by the Encrypt tab.
    function setCmpFile(file, own) {
        if (cmp.own && !own) return;
        if (cmp.url) URL.revokeObjectURL(cmp.url);
        Object.assign(cmp, { file, url: URL.createObjectURL(file), own });

        const thumb = $('#cmpThumb');
        thumb.src = cmp.url;
        thumb.hidden = false;
        $('#cmpThumbEmpty').hidden = true;
        $('#cmpSourceName').textContent = file.name;
        $('#cmpSourceHint').textContent = own ? 'Picked for this comparison' : 'Shared with the Encrypt tab';
        cmpBtn.disabled = false;
        setTriImage(plainCard, cmp.url, 'Original image');
        resetLeak($('.leak', plainCard));
        $('.tri-foot', plainCard).innerHTML = '&nbsp;';
    }

    $('#cmpChoose').addEventListener('click', () => $('#cmpFile').click());
    $('#cmpFile').addEventListener('change', e => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        if (file.type && !file.type.startsWith('image/')) { toast(`"${file.name}" isn't an image.`, 'error'); return; }
        setCmpFile(file, true);
    });

    $$('[data-sample]').forEach(chip => chip.addEventListener('click', async () => {
        try {
            const file = await fileFromUrl(chip.dataset.sample, chip.dataset.name);
            if (chip.dataset.target === 'cmp') setCmpFile(file, true);
            else await setEncFile(file);
        } catch {
            toast("Couldn't load the sample image.", 'error');
        }
    }));

    cmpBtn.addEventListener('click', async () => {
        if (!cmp.file || cmpBtn.classList.contains('loading')) return;
        setBusy(cmpBtn, true, 'Encrypting ×3…');

        const modeCards = $$('.tri-card:not([data-mode="PLAIN"])');
        modeCards.forEach(card => {
            card.classList.remove('revealed');
            const box = $('.tri-img', card);
            box.replaceChildren();
            box.classList.add('loading');
            resetLeak($('.leak', card));
            $('.tri-foot', card).innerHTML = '&nbsp;';
        });

        const [data] = await Promise.all([
            postForm('Compare', { plaintextImage: cmp.file, keySizeBits: radioValue('cmpKey') }),
            sleep(motion(700)),
        ]);
        setBusy(cmpBtn, false);

        if (!data.ok) {
            modeCards.forEach(card => $('.tri-img', card).classList.remove('loading'));
            toast(data.error, 'error');
            return;
        }

        setLeak($('.leak', plainCard), data.plaintextRepeatedBlockPercent, { neutral: true });
        $('.tri-foot', plainCard).textContent = `${data.width}×${data.height} px`;

        data.results.forEach((r, i) => setTimeout(() => {
            const card = $(`.tri-card[data-mode="${r.mode}"]`);
            setTriImage(card, r.cipherPreview, `${r.mode} ciphertext`);
            replay(card, 'revealed');
            setLeak($('.leak', card), r.repeatedBlockPercent);
            $('.tri-foot', card).textContent = `${r.elapsedMs.toFixed(1)} ms · ${fmt(r.blocks)} blocks`;
        }, motion(i * 220)));

        $('#cmpKeyNote').textContent = `One AES-${data.results[0].keySizeBits} key for all three: ${data.keyHex.slice(0, 16)}…`;
    });

    selectTab('encrypt');
})();

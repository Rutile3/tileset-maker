// 月城アリアのタイル鍋へようこそ。材料（PNG）を放り込んで、きれいに並べて仕上げます。

const els = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    countBadge: document.getElementById('countBadge'),
    thumbGrid: document.getElementById('thumbGrid'),
    columns: document.getElementById('columns'),
    sortMode: document.getElementById('sortMode'),
    tileW: document.getElementById('tileW'),
    tileH: document.getElementById('tileH'),
    gap: document.getElementById('gap'),
    margin: document.getElementById('margin'),
    forceSize: document.getElementById('forceSize'),
    bgToggle: document.getElementById('bgToggle'),
    bgColor: document.getElementById('bgColor'),
    clearBtn: document.getElementById('clearBtn'),
    buildBtn: document.getElementById('buildBtn'),
    preview: document.getElementById('preview'),
    outSize: document.getElementById('outSize'),
    tileInfo: document.getElementById('tileInfo'),
    downloadBtn: document.getElementById('downloadBtn'),
    downloadLink: document.getElementById('downloadLink')
};

let items = []; // {file, name, mtime, imgBitmap, width, height, url}

// ------------ ユーティリティ ------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function naturalCompare(a, b) {
    // 数値を考慮した自然順
    return a.localeCompare(b, 'ja', { numeric: true, sensitivity: 'base' });
}

function sortItems(mode) {
    switch (mode) {
        case 'name-asc': items.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'name-desc': items.sort((a, b) => b.name.localeCompare(a.name)); break;
        case 'mtime-asc': items.sort((a, b) => (b.mtime || 0) - (a.mtime || 0)); break; // 新→古
        case 'mtime-desc': items.sort((a, b) => (a.mtime || 0) - (b.mtime || 0)); break; // 古→新
        case 'natural':
        default:
            items.sort((a, b) => naturalCompare(a.name, b.name));
    }
}

async function fileToBitmap(file) {
    const blob = file.slice(0, file.size, file.type);
    // createImageBitmapは高速＆EXIF不要(PNG)なので素直に使う
    const bmp = await createImageBitmap(blob);
    return bmp;
}

// ------------ 入力 ------------
function handleFiles(fileList) {
    const pngs = Array.from(fileList).filter(f => /image\/png/i.test(f.type));
    if (pngs.length === 0) return;

    const added = pngs.map(f => ({
        file: f,
        name: f.name,
        mtime: (f.lastModified || 0),
        imgBitmap: null,
        width: 0,
        height: 0,
        url: URL.createObjectURL(f)
    }));
    items.push(...added);
    refreshList();
    // サムネ生成は遅延ロード
    loadBitmapsLazy(added);
}

async function loadBitmapsLazy(list) {
    for (const it of list) {
        try {
            if (!it.imgBitmap) {
                it.imgBitmap = await fileToBitmap(it.file);
                it.width = it.imgBitmap.width;
                it.height = it.imgBitmap.height;
            }
        } catch (e) {
            console.error('画像読み込み失敗: ', it.name, e);
        }
        // ちょっとだけ譲る（UIブロック回避）
        await sleep(0);
        updateThumb(it);
        updateCounts();
    }
}

// ------------ UI反映 ------------
function refreshList() {
    sortItems(els.sortMode.value);
    els.thumbGrid.innerHTML = '';
    for (const it of items) {
        const card = document.createElement('div');
        card.className = 'thumb';

        const img = document.createElement('img');
        img.alt = it.name;
        img.src = it.url; // ブラウザに任せる（軽量）
        card.appendChild(img);

        const cap = document.createElement('div');
        cap.className = 'caption';
        cap.textContent = it.name;
        card.appendChild(cap);

        els.thumbGrid.appendChild(card);
        it._thumb = { img, cap, card };
    }
    updateCounts();
}

function updateThumb(it) {
    if (!it._thumb) return;
    it._thumb.cap.textContent = `${it.name} ${it.width && it.height ? `(${it.width}×${it.height})` : ''}`;
}

function updateCounts() {
    els.countBadge.textContent = String(items.length);
}

// ------------ 生成 ------------
async function buildTileset() {
    if (items.length === 0) {
        alert('PNG画像を追加してください。');
        return;
    }
    sortItems(els.sortMode.value);

    // すべてのビットマップをロード
    await Promise.all(items.map(async it => {
        if (!it.imgBitmap) {
            it.imgBitmap = await fileToBitmap(it.file);
            it.width = it.imgBitmap.width;
            it.height = it.imgBitmap.height;
        }
    }));

    // タイル基準サイズ
    let tW = parseInt(els.tileW.value || '0', 10);
    let tH = parseInt(els.tileH.value || '0', 10);
    if (tW <= 0 || tH <= 0) {
        // 0の場合は最初の画像サイズ
        tW = items[0].width;
        tH = items[0].height;
    }

    // 列数
    const n = items.length;
    let cols = parseInt(els.columns.value || '0', 10);
    if (cols <= 0) cols = Math.ceil(Math.sqrt(n)); // 自動：正方形に近づける
    const rows = Math.ceil(n / cols);

    const gap = Math.max(0, parseInt(els.gap.value || '0', 10));
    const margin = Math.max(0, parseInt(els.margin.value || '0', 10));

    const outW = margin * 2 + cols * tW + (cols - 1) * gap;
    const outH = margin * 2 + rows * tH + (rows - 1) * gap;

    const cv = els.preview;
    const ctx = cv.getContext('2d');
    cv.width = outW || 1;
    cv.height = outH || 1;

    // 背景
    const transparent = els.bgToggle.checked;
    if (!transparent) {
        ctx.fillStyle = els.bgColor.value || '#000000';
        ctx.fillRect(0, 0, cv.width, cv.height);
    } else {
        // 透明クリア
        ctx.clearRect(0, 0, cv.width, cv.height);
    }

    // 描画設定：最近傍（ドット絵想定）
    ctx.imageSmoothingEnabled = !els.forceSize.checked ? false : false; // 強制時もデフォは最近傍
    ctx.imageSmoothingQuality = 'low';

    // タイル描画
    const force = els.forceSize.checked;
    items.forEach((it, idx) => {
        const r = Math.floor(idx / cols);
        const c = idx % cols;
        const x = margin + c * (tW + gap);
        const y = margin + r * (tH + gap);
        if (force) {
            ctx.drawImage(it.imgBitmap, 0, 0, it.width, it.height, x, y, tW, tH);
        } else {
            // 元サイズそのまま。中央に寄せる（大きい場合ははみ出し）
            const ox = x + Math.floor((tW - it.width) / 2);
            const oy = y + Math.floor((tH - it.height) / 2);
            ctx.drawImage(it.imgBitmap, ox, oy);
        }
    });

    els.outSize.textContent = `${cv.width} × ${cv.height}px`;
    els.tileInfo.textContent = `${tW}×${tH}px / ${cols}列×${rows}行（計 ${n}枚）`;

    // ダウンロード準備
    els.downloadBtn.disabled = false;
}

function downloadPng() {
    const cv = els.preview;
    cv.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        els.downloadLink.href = url;
        els.downloadLink.download = 'tileset.png';
        els.downloadLink.classList.remove('d-none');
        // クリックを誘発
        els.downloadLink.click();
    }, 'image/png');
}

// ------------ イベント ------------
els.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

['dragenter', 'dragover'].forEach(ev => {
    els.dropzone.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        els.dropzone.classList.add('dragover');
    });
});
['dragleave', 'drop'].forEach(ev => {
    els.dropzone.addEventListener(ev, (e) => {
        e.preventDefault(); e.stopPropagation();
        els.dropzone.classList.remove('dragover');
    });
});
els.dropzone.addEventListener('drop', (e) => {
    handleFiles(e.dataTransfer.files);
});

els.clearBtn.addEventListener('click', () => {
    // revoke
    items.forEach(it => it.url && URL.revokeObjectURL(it.url));
    items = [];
    refreshList();
    els.preview.width = 1;
    els.preview.height = 1;
    els.outSize.textContent = '-';
    els.tileInfo.textContent = '-';
    els.downloadBtn.disabled = true;
    els.downloadLink.classList.add('d-none');
});

els.sortMode.addEventListener('change', () => refreshList());
['columns', 'tileW', 'tileH', 'gap', 'margin', 'forceSize', 'bgToggle', 'bgColor']
    .forEach(id => els[id].addEventListener('change', () => {/* オプション変更時は必要に応じて再生成 */ }));

els.buildBtn.addEventListener('click', buildTileset);
els.downloadBtn.addEventListener('click', downloadPng);

// ちょっとした親切：ファイルが1枚もなければ生成ボタンでファイル選択を促す
els.buildBtn.addEventListener('click', () => {
    if (items.length === 0) {
        els.fileInput.focus();
    }
});

// 初期ツールチップ（不要なら削除可）
document.addEventListener('DOMContentLoaded', () => {
    // デフォ：透明背景ON
    els.bgToggle.checked = true;
});

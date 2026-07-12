// js/modules/signature-utils.js
// Xử lý ảnh chữ ký chụp/upload: tách nét mực khỏi nền giấy (nhị phân hóa theo ngưỡng Otsu tự động),
// crop về đúng vùng có nét mực. Dùng chung cho app.html (chữ ký khách) và index.html (chữ ký chủ nhà).

function otsuThreshold(hist, total) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, maxVar = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const varBetween = wB * wF * (mB - mF) * (mB - mF);
        if (varBetween > maxVar) { maxVar = varBetween; threshold = t; }
    }
    return threshold;
}

// vùng tối hơn ngưỡng = nét mực, giữ lại; vùng còn lại = nền giấy, xóa thành trong suốt
export function extractInkFromPhoto(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const n = w * h;
    const gray = new Uint8ClampedArray(n);
    const hist = new Array(256).fill(0);
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        const v = Math.round(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
        gray[i] = v;
        hist[v]++;
    }
    const threshold = otsuThreshold(hist, n);
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        if (gray[i] < threshold) {
            data[o] = 26; data[o + 1] = 35; data[o + 2] = 126; // #1a237e, đồng bộ màu mực với chữ ký vẽ tay
            data[o + 3] = 255;
        } else {
            data[o + 3] = 0;
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

export function cropSignatureToContent(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] > 10) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    if (x1 < x0) return canvas.toDataURL('image/png');
    const pad = 12;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
}

export function loadImageFromSrc(src) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
    });
}

/**
 * Nhận vào 1 dataURL ảnh chụp/upload chữ ký, trả về dataURL đã tách nét mực + crop.
 */
export async function processSignaturePhoto(dataUrl, maxDim = 1200) {
    const img = await loadImageFromSrc(dataUrl);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    extractInkFromPhoto(canvas);
    return cropSignatureToContent(canvas);
}

/**
 * Đọc 1 File (từ <input type="file">) và trả về dataURL chữ ký đã xử lý.
 */
export function processSignatureFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                resolve(await processSignaturePhoto(reader.result));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

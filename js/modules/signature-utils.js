// js/modules/signature-utils.js
// Xử lý ảnh chữ ký chụp/upload: ảnh đầu vào đã được tách nền trắng sạch từ trước (bằng công cụ AI ngoài),
// nên ở đây chỉ cần xóa nền trắng thành trong suốt, GIỮ NGUYÊN màu mực và độ đậm nhạt gốc của chữ ký
// (không ép về 1 màu cố định, không nhị phân hóa cứng - tránh làm mất các nét mực nhạt/mảnh).
// Dùng chung cho app.html (chữ ký khách) và index.html (chữ ký chủ nhà).

// pixel càng gần trắng thì càng trong suốt (nền); càng đậm thì càng đục (mực) - giữ nguyên màu gốc
export function extractInkFromPhoto(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const n = w * h;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        const luminance = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
        let alpha = Math.round((255 - luminance) * 1.15); // hệ số nhẹ để nét mực nhạt vẫn hiện rõ hơn
        if (alpha < 8) alpha = 0; // khử nhiễu nền trắng còn sót (ví dụ nén JPEG)
        data[o + 3] = Math.max(0, Math.min(255, alpha));
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

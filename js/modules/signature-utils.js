// js/modules/signature-utils.js
// Xử lý ảnh chữ ký chụp/upload: ảnh đầu vào đã được tách nền trắng sạch từ trước (bằng công cụ AI ngoài),
// nên ở đây chỉ cần xóa nền trắng thành trong suốt, GIỮ NGUYÊN màu mực và độ đậm nhạt gốc của chữ ký
// (không ép về 1 màu cố định, không nhị phân hóa cứng - tránh làm mất các nét mực nhạt/mảnh).
// Dùng chung cho app.html (chữ ký khách) và index.html (chữ ký chủ nhà).

// pixel càng gần trắng thì càng trong suốt (nền); càng đậm thì càng đục (mực) - giữ nguyên màu gốc.
// Nền giấy (kể cả nhiễu nhẹ do ánh sáng/nén ảnh) phải xóa TRONG SUỐT HOÀN TOÀN (alpha=0) chứ không để
// mờ mờ nhẹ - nếu không ảnh PNG nén rất kém (mất hết mảng trong suốt đồng nhất), dung lượng phình to
// dễ vượt giới hạn dung lượng field khi lưu Firestore.
const WHITE_CUTOFF = 240; // độ sáng >= ngưỡng này coi là nền giấy, xóa hẳn
export function extractInkFromPhoto(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const n = w * h;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        const luminance = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
        if (luminance >= WHITE_CUTOFF) {
            data[o + 3] = 0;
        } else {
            const alpha = Math.round((WHITE_CUTOFF - luminance) * (255 / WHITE_CUTOFF) * 1.3);
            data[o + 3] = Math.max(0, Math.min(255, alpha));
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

// Xuất PNG (không đổi được chất lượng nén) làm ảnh nền giấy còn nhiễu -> nén cực kém, dễ nặng cả MB.
// Đổi qua WebP (hỗ trợ trong suốt + nén mất mát nhẹ) giúp ảnh nhẹ hơn PNG rất nhiều mà mắt thường
// không thấy khác biệt; trình duyệt không hỗ trợ WebP sẽ tự động rơi về PNG (hành vi mặc định của toDataURL).
export function cropSignatureToContent(canvas, quality = 0.9) {
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
    if (x1 < x0) return canvas.toDataURL('image/webp', quality);
    const pad = 12;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/webp', quality);
}

export function loadImageFromSrc(src) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
    });
}

// Ngân sách dung lượng an toàn cho 1 ảnh chữ ký (Firestore giới hạn 1MB/document, còn phải chừa chỗ
// cho các field khác của hợp đồng) - vượt mức này thì tự nén/thu nhỏ thêm cho tới khi đạt.
const MAX_SIGNATURE_BYTES = 300 * 1024;

/**
 * Nhận vào 1 dataURL ảnh chụp/upload chữ ký, trả về dataURL đã tách nét mực + crop,
 * đảm bảo dung lượng không vượt quá MAX_SIGNATURE_BYTES (tự giảm chất lượng/kích thước nếu cần).
 */
export async function processSignaturePhoto(dataUrl, maxDim = 900) {
    const img = await loadImageFromSrc(dataUrl);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    extractInkFromPhoto(canvas);

    let quality = 0.9;
    let result = cropSignatureToContent(canvas, quality);
    while (result.length > MAX_SIGNATURE_BYTES && quality > 0.4) {
        quality -= 0.15;
        result = cropSignatureToContent(canvas, quality);
    }

    // Vẫn còn quá nặng (ảnh gốc quá chi tiết/nhiều nét) -> thu nhỏ kích thước rồi nén lại
    let shrinkCanvas = canvas;
    while (result.length > MAX_SIGNATURE_BYTES && shrinkCanvas.width > 200) {
        const next = document.createElement('canvas');
        next.width = Math.round(shrinkCanvas.width * 0.75);
        next.height = Math.round(shrinkCanvas.height * 0.75);
        next.getContext('2d').drawImage(shrinkCanvas, 0, 0, next.width, next.height);
        shrinkCanvas = next;
        result = cropSignatureToContent(shrinkCanvas, 0.75);
    }

    return result;
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

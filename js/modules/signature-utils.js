// js/modules/signature-utils.js
// Xử lý ảnh chữ ký chụp/upload thành PNG/WEBP nền trong suốt, chỉ giữ lại nét mực, quy về 1 định dạng
// hiển thị nhất quán (căn khung chuẩn) bất kể ảnh gốc chụp thế nào - tương tự cách 1 app scan tài liệu
// (CamScanner/Office Lens...) xử lý ảnh, chạy hoàn toàn trên máy khách (không gửi ảnh chữ ký/giấy tờ ra
// dịch vụ AI ngoài nào, tránh rủi ro riêng tư + không tốn phí/độ trễ mạng). Gồm 3 bước:
//
// 1. Làm phẳng ánh sáng (flat-field correction) TRÊN 1 BẢN SAO riêng: ước lượng nền cục bộ bằng ảnh
//    blur bán kính lớn rồi chia từng pixel cho nền tại đúng vị trí đó, giúp giấy ố vàng/bóng đổ nhẹ kéo
//    về trắng đều - CHỈ dùng bản đã làm phẳng này để TÌM ngưỡng/mặt nạ mực ở bước 2, không dùng để xuất
//    màu (chữ ký dày/nhiều nét chồng làm nền cục bộ lẫn màu mực vào, đổi màu sai nếu xuất trực tiếp).
// 2. Tách mực khỏi nền bằng ngưỡng Otsu tự tính riêng cho từng ảnh (không dùng số cố định) + lọc theo
//    hình dạng (connected-component: cụm pixel tối nào đặc kín cả khung bao - tức mảng bóng đổ/nền sót
//    lại sau bước 1 chứ không phải nét chữ mảnh/thưa - bị loại thẳng, không chỉ làm mờ). Xem chi tiết ở
//    computeOtsuThreshold/labelComponents bên dưới.
// 3. Dùng mặt nạ/ngưỡng ở bước 2 để set alpha lên ẢNH GỐC CHƯA LÀM PHẲNG (giữ nguyên 100% màu mực thật
//    đã chụp được, không tô/đậm/đổi màu gì thêm), sau đó crop sát khung mực và co giãn về 1 kích thước
//    chuẩn để hiển thị đúng tỉ lệ như chữ ký mẫu.
// Dùng chung cho app.html (chữ ký khách) và index.html (chữ ký chủ nhà).

// Ước lượng bản đồ "nền cục bộ" của ảnh bằng cách thu nhỏ ảnh rất mạnh rồi phóng to lại - tận dụng nội
// suy sẵn có của canvas để có hiệu ứng tương đương 1 phép blur bán kính lớn nhưng rẻ hơn nhiều so với
// tự viết Gaussian blur. Bán kính blur phải đủ lớn hơn bề rộng nét mực (vài px) để nét mực không kéo
// tụt giá trị nền ước lượng ngay tại vị trí của nó.
function estimateBackground(canvas) {
    const w = canvas.width, h = canvas.height;
    const sw = Math.max(6, Math.round(w / 24));
    const sh = Math.max(6, Math.round(h / 24));
    const small = document.createElement('canvas');
    small.width = sw; small.height = sh;
    small.getContext('2d').drawImage(canvas, 0, 0, sw, sh);

    const bg = document.createElement('canvas');
    bg.width = w; bg.height = h;
    const bgCtx = bg.getContext('2d');
    bgCtx.imageSmoothingEnabled = true;
    bgCtx.imageSmoothingQuality = 'high';
    bgCtx.drawImage(small, 0, 0, w, h);
    return bgCtx.getImageData(0, 0, w, h).data;
}

// Chia từng kênh màu của pixel gốc cho nền cục bộ ước lượng tại đúng vị trí đó (nhân lại về thang
// 0-255) - vùng đồng nhất cục bộ (giấy ố vàng, bóng đổ, mặt bàn...) sẽ tự kéo về trắng đều bất kể độ
// sáng/màu gốc, trong khi nét mực (đậm hơn hẳn nền quanh nó) vẫn giữ được độ tương phản để nhận diện.
function flattenIllumination(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const bgData = estimateBackground(canvas);
    const n = w * h * 4;
    for (let o = 0; o < n; o += 4) {
        for (let c = 0; c < 3; c++) {
            const bg = Math.max(60, bgData[o + c]); // sàn để tránh chia cho số quá nhỏ ở vùng quá tối
            data[o + c] = Math.max(0, Math.min(255, Math.round(data[o + c] * 255 / bg)));
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

// Ngưỡng cố định (kiểu WHITE_CUTOFF=238) chỉ đúng khi ảnh đã được làm phẳng HOÀN HẢO. Thực tế bóng đổ
// mạnh/gắt 1 phía tờ giấy (bóng tay, bóng điện thoại lúc chụp...) làm phẳng xong vẫn còn sót 1 VÙNG
// RỘNG hơi xám chứ không về hẳn trắng - nếu vẫn dùng ngưỡng tuyệt đối cố định, cả mảng xám sót đó bị
// tính lầm thành "mực" (ra 1 vệt xám/đen lớn, nuốt luôn chữ ký thật bên trong -> tưởng chữ ký bị mờ +
// nhỏ vì nét thật lọt thỏm giữa vệt xám to đó). Thay vì đoán 1 số cố định, tự tính ngưỡng phù hợp cho
// TỪNG ảnh bằng thuật toán Otsu (thuật toán nhị phân hoá tài liệu kinh điển - tìm mức sáng phân tách 2
// nhóm pixel "nền" và "mực" sao cho tách biệt nhau nhất dựa trên biểu đồ phân bố độ sáng thực tế của
// chính ảnh đó), rồi LỌC TIẾP bằng hình dạng: gộp các pixel tối liền kề thành từng cụm (connected
// component), cụm nào ĐẶC KÍN gần hết khung bao của nó (density cao) là mảng bóng đổ/nền sót lại (nét
// chữ viết tay luôn mảnh + thưa, không bao giờ đặc kín cả khung bao) -> loại thẳng, không phải chỉnh
// độ mờ. Chỉ cụm nào vừa đủ tối vừa đủ "mảnh/thưa" (đúng hình dạng nét chữ) mới được giữ lại làm mực.
function computeOtsuThreshold(lum, n) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[Math.max(0, Math.min(255, Math.round(lum[i])))]++;
    let sumAll = 0;
    for (let t = 0; t < 256; t++) sumAll += t * hist[t];
    let sumB = 0, wB = 0, best = 190, maxVar = -1;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = n - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB, mF = (sumAll - sumB) / wF;
        const varBetween = wB * wF * (mB - mF) * (mB - mF);
        if (varBetween > maxVar) { maxVar = varBetween; best = t; }
    }
    // Chặn trong khoảng hợp lý, phòng ảnh gần như trắng tinh (không có mực) khiến Otsu chọn ngưỡng
    // lệch quá đà, biến nhiễu ảnh/nén JPEG thành "mực" tràn lan.
    return Math.max(140, Math.min(235, best));
}

// Gán nhãn từng cụm pixel "nghi là mực" liền kề nhau (4-connectivity, flood fill lặp bằng stack tự
// quản lý thay vì đệ quy - tránh tràn stack với ảnh cả triệu pixel), kèm số lượng pixel + khung bao
// từng cụm để bước sau lọc theo mật độ (density = số pixel / diện tích khung bao).
function labelComponents(mask, w, h) {
    const n = w * h;
    const labels = new Int32Array(n);
    const stack = new Int32Array(n);
    const components = [];
    let nextLabel = 1;
    for (let start = 0; start < n; start++) {
        if (!mask[start] || labels[start]) continue;
        let sp = 0;
        stack[sp++] = start;
        labels[start] = nextLabel;
        let count = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
        while (sp > 0) {
            const idx = stack[--sp];
            const x = idx % w, y = (idx / w) | 0;
            count++;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            if (x > 0) { const nb = idx - 1; if (mask[nb] && !labels[nb]) { labels[nb] = nextLabel; stack[sp++] = nb; } }
            if (x < w - 1) { const nb = idx + 1; if (mask[nb] && !labels[nb]) { labels[nb] = nextLabel; stack[sp++] = nb; } }
            if (y > 0) { const nb = idx - w; if (mask[nb] && !labels[nb]) { labels[nb] = nextLabel; stack[sp++] = nb; } }
            if (y < h - 1) { const nb = idx + w; if (mask[nb] && !labels[nb]) { labels[nb] = nextLabel; stack[sp++] = nb; } }
        }
        components.push({ label: nextLabel, count, x0, y0, x1, y1 });
        nextLabel++;
    }
    return { labels, components };
}

const MARGIN = 30;                // độ rộng dải nội suy mờ dần quanh ngưỡng Otsu, để khử răng cưa viền nét
                                   // (nới rộng hơn mức tối thiểu để giữ lại các đoạn nét mảnh/nhạt - đầu/cuối
                                   // nét bút - thay vì cắt cụt ngay khi vừa nhạt hơn ngưỡng 1 chút)
const MIN_COMPONENT_PIXELS = 5;   // cụm nhỏ hơn mức này là hạt nhiễu lẻ loi (bụi/hạt nén ảnh), loại bỏ
const MAX_DENSITY = 0.85;         // cụm đặc gần kín hoàn toàn khung bao mới coi là mảng nền/bóng đổ sót;
                                   // để ngưỡng cao vì các đoạn nét chữ ký lượn/đan chéo nhiều (móc, gạch chân)
                                   // cũng có thể tạo cụm khá đặc mà vẫn là nét chữ thật, không phải nền

export function extractInkFromPhoto(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const original = ctx.getImageData(0, 0, w, h); // ảnh gốc, giữ nguyên để xuất màu - không đụng vào

    // Làm phẳng ánh sáng trên 1 canvas nháp riêng, chỉ để tính ngưỡng/mặt nạ mực, không dùng màu của nó.
    const flatCanvas = document.createElement('canvas');
    flatCanvas.width = w; flatCanvas.height = h;
    flatCanvas.getContext('2d').drawImage(canvas, 0, 0);
    flattenIllumination(flatCanvas);
    const flatData = flatCanvas.getContext('2d').getImageData(0, 0, w, h).data;

    const n = w * h;
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        lum[i] = 0.299 * flatData[o] + 0.587 * flatData[o + 1] + 0.114 * flatData[o + 2];
    }

    const otsu = computeOtsuThreshold(lum, n);
    const whiteCutoff = otsu + MARGIN; // từ đây trở lên coi chắc chắn là nền
    const inkFloor = otsu - MARGIN;    // từ đây trở xuống coi chắc chắn là mực

    const candidate = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (lum[i] < whiteCutoff) candidate[i] = 1;

    const { labels, components } = labelComponents(candidate, w, h);
    const keep = new Uint8Array(components.length + 1); // index theo label, 0 = bỏ
    for (const c of components) {
        const bboxArea = (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1);
        const density = c.count / bboxArea;
        if (c.count >= MIN_COMPONENT_PIXELS && density <= MAX_DENSITY) keep[c.label] = 1;
    }

    const data = original.data;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        const lbl = labels[i];
        if (!lbl || !keep[lbl]) {
            data[o + 3] = 0; // nền, hoặc cụm bị loại (mảng bóng đổ/nhiễu sót lại) -> xoá hẳn, không giữ mờ mờ
            continue;
        }
        // t = 0 ở mép nhạt (giáp nền) -> 1 khi đã chắc chắn là mực; dùng căn bậc 2 để alpha tăng
        // nhanh về đục ngay khi vừa qua mép mờ, tránh cả nét mực bị "loãng" ra một dải xám dài.
        // Màu RGB giữ nguyên 100% từ ảnh gốc (data lấy từ `original`, không phải bản đã làm phẳng) -
        // chỉ đổi alpha, không tô/đậm màu, tránh biến mực xanh thành đen.
        const t = Math.max(0, Math.min(1, (whiteCutoff - lum[i]) / (whiteCutoff - inkFloor)));
        data[o + 3] = Math.round(255 * Math.sqrt(t));
    }
    ctx.putImageData(original, 0, 0);
}

// Cắt canvas về đúng khung chứa nét mực (bỏ hết khoảng trắng/giấy thừa quanh chữ ký), trả về 1 canvas
// mới - hoặc null nếu không tìm thấy tí mực nào. Tách riêng bước này (không xuất dataURL luôn) để có
// thể phóng to/thu nhỏ về kích thước chuẩn TRƯỚC khi nén, thay vì nén xong mới co giãn.
// Mặt nạ alpha lúc này đã được lọc sạch nhiễu/mảng nền sót ở extractInkFromPhoto (Otsu + connected-
// component) nên ở đây chỉ cần dò bounding box đơn giản trên alpha, không cần ăn mòn/lọc lại nữa.
export function cropCanvasToInk(canvas) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;

    let x0 = w, y0 = h, x1 = -1, y1 = -1;
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
    if (x1 < x0) return null;
    const pad = 12;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
}

// Phóng to/thu nhỏ ảnh đã crop về cùng 1 kích thước chuẩn (cạnh dài nhất = targetMaxDim) - đảm bảo
// dù khách chụp gần/xa/khung hình to nhỏ khác nhau thế nào, chữ ký cắt ra luôn hiển thị với cùng 1 tỉ
// lệ trong khung ký cố định của hợp đồng, giống hệt cách chữ ký mẫu luôn choán gần hết khung ảnh.
export function normalizeSignatureSize(canvas, targetMaxDim = 640) {
    const scale = targetMaxDim / Math.max(canvas.width, canvas.height);
    if (Math.abs(scale - 1) < 0.02) return canvas; // đã gần đúng chuẩn, khỏi vẽ lại tốn thời gian
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(canvas.width * scale));
    out.height = Math.max(1, Math.round(canvas.height * scale));
    const outCtx = out.getContext('2d');
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = 'high';
    outCtx.drawImage(canvas, 0, 0, out.width, out.height);
    return out;
}

// Xuất PNG (không đổi được chất lượng nén) làm ảnh nền giấy còn nhiễu -> nén cực kém, dễ nặng cả MB.
// Đổi qua WebP (hỗ trợ trong suốt + nén mất mát nhẹ) giúp ảnh nhẹ hơn PNG rất nhiều mà mắt thường
// không thấy khác biệt; trình duyệt không hỗ trợ WebP sẽ tự động rơi về PNG (hành vi mặc định của toDataURL).
export function cropSignatureToContent(canvas, quality = 0.9) {
    const out = cropCanvasToInk(canvas);
    return (out || canvas).toDataURL('image/webp', quality);
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
 * Nhận vào 1 dataURL ảnh chụp/upload chữ ký, trả về dataURL đã tách nét mực + crop + chuẩn hoá kích
 * thước, đảm bảo dung lượng không vượt quá MAX_SIGNATURE_BYTES (tự giảm chất lượng/kích thước nếu cần).
 *
 * maxDim: độ phân giải làm việc TRƯỚC khi crop (càng cao càng giữ được chi tiết nét mực khi ảnh gốc
 * chụp từ xa/chữ ký chỉ chiếm 1 góc nhỏ khung hình, đỡ bị vỡ nét khi phóng to lại ở bước chuẩn hoá).
 * targetMaxDim: kích thước chuẩn (cạnh dài nhất) mà MỌI ảnh chữ ký sau khi crop đều được co giãn về,
 * để hiển thị nhất quán như chữ ký mẫu bất kể ảnh gốc chụp gần/xa/khung to nhỏ ra sao.
 */
export async function processSignaturePhoto(dataUrl, maxDim = 1400, targetMaxDim = 640) {
    const img = await loadImageFromSrc(dataUrl);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    extractInkFromPhoto(canvas);

    const tight = cropCanvasToInk(canvas) || canvas;
    const normalized = normalizeSignatureSize(tight, targetMaxDim);

    let quality = 0.9;
    let result = normalized.toDataURL('image/webp', quality);
    while (result.length > MAX_SIGNATURE_BYTES && quality > 0.4) {
        quality -= 0.15;
        result = normalized.toDataURL('image/webp', quality);
    }

    // Vẫn còn quá nặng (nét mực quá chi tiết/nhiều nét) -> thu nhỏ kích thước rồi nén lại
    let shrinkCanvas = normalized;
    while (result.length > MAX_SIGNATURE_BYTES && shrinkCanvas.width > 200) {
        const next = document.createElement('canvas');
        next.width = Math.round(shrinkCanvas.width * 0.75);
        next.height = Math.round(shrinkCanvas.height * 0.75);
        next.getContext('2d').drawImage(shrinkCanvas, 0, 0, next.width, next.height);
        shrinkCanvas = next;
        result = shrinkCanvas.toDataURL('image/webp', 0.75);
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

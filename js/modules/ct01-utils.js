// js/modules/ct01-utils.js
// Hàm tiện ích dùng chung để build tờ khai CT01 (tạm trú) từ dữ liệu tòa nhà + khách hàng.
// Số đo (cỡ chữ, khoảng cách dòng, độ rộng cột, lề trang) lấy đúng từ file CT01.docx gốc
// (đối chiếu trực tiếp document.xml): font Times New Roman 12pt thân bài, 13pt cho dòng
// "Mẫu CT01..."/"11. Những thành viên...", 14pt bold cho quốc hiệu, spacing before=6pt/after=0
// đồng nhất mọi dòng, lề trang trên 2cm/phải 2cm/dưới 1cm/trái 3cm (w:pgMar 1134/1134/567/1701 twips).

// Chuẩn hoá tên thành phố viết tắt "TP." -> "Thành phố" (giữ nguyên nếu đã viết đầy đủ)
function normalizeCityPart(part) {
    return part.replace(/^TP\.?\s+/i, 'Thành phố ');
}

/**
 * Tách địa chỉ tòa nhà (dạng "<số nhà, đường>, [Khu phố...,] Phường X, Thành phố Hồ Chí Minh")
 * ra các phần cần cho CT01: tên phường, công an phường quản lý, thành phố, địa chỉ đã chuẩn hoá.
 */
export function parseBuildingAddress(address) {
    if (!address) return { fullAddress: '', ward: '', wardLabel: 'Phường', city: '', policeStation: '', kinhGuiLine: '' };

    const parts = address.split(',').map(p => p.trim()).filter(Boolean).map(normalizeCityPart);
    const fullAddress = parts.join(', ');
    const city = parts[parts.length - 1] || '';

    const wardPart = parts.find(p => /^(Phường|Xã|Thị trấn)\s+/i.test(p));
    const wardMatch = wardPart ? wardPart.match(/^(Phường|Xã|Thị trấn)\s+(.+)$/i) : null;
    const wardLabel = wardMatch ? wardMatch[1] : 'Phường';
    const ward = wardMatch ? wardMatch[2] : '';

    const policeStation = ward ? `Công an ${wardLabel.toLowerCase()} ${ward}` : '';
    const kinhGuiLine = (policeStation ? `${policeStation}, ${city}` : city).toUpperCase();

    return { fullAddress, ward, wardLabel, city, policeStation, kinhGuiLine };
}

/**
 * Chia 1 chuỗi số định danh cá nhân (12 số) thành 12 ô <td> để vẽ vào bảng CT01
 * giống layout ô vuông tách từng chữ số trong mẫu CT01.
 */
export function renderIdNumberBoxes(idNumber, size = 12, cellClass = 'ct01-id-box') {
    const digits = (idNumber || '').replace(/\D/g, '').padEnd(size, ' ').slice(0, size).split('');
    return digits.map(d => `<td class="${cellClass}">${d.trim()}</td>`).join('');
}

// --- Dựng khuôn HTML tờ CT01 (1 trang / 1 khách), theo đúng vector đo được từ CT01.docx ---

// Khoảng cách trước mỗi dòng trong file gốc: spacing before=6pt, after=0, đồng nhất cho toàn bộ thân bài
const SP = 'margin:6pt 0 0;';
const BODY_FS = 'font-size:12pt;';

/**
 * 1 dòng "label: ô số định danh" nằm CÙNG 1 hàng (đúng như file gốc), không xuống dòng.
 * boxWidthPt lấy tỉ lệ từ tblGrid docx: mục 4 ~22pt/ô, mục 9 ~20.5pt/ô (label dài hơn).
 */
function idNumberRow(label, idNumber, boxWidthPt) {
    const digits = (idNumber || '').replace(/\D/g, '').padEnd(12, ' ').slice(0, 12).split('');
    const cells = digits.map(d => `<td style="width:${boxWidthPt}pt;height:22pt;border:1.2px solid #000;text-align:center;vertical-align:middle;font-size:12pt;padding:0;">${d.trim()}</td>`).join('');
    return `<table style="border-collapse:collapse;width:100%;table-layout:fixed;${SP}"><tr>
  <td style="border:none;text-align:left;vertical-align:middle;padding:0 4pt 0 0;${BODY_FS}">${label}</td>
  ${cells}
</tr></table>`;
}

/**
 * @param {object} building - cần building.address
 * @param {object} customer - cần customer.name, birthDate, gender, idNumber
 * @param {string} [customerSignatureDataUrl] - chữ ký khách (chỉ khách ký, không cần chữ ký chủ nhà)
 * @param {string} [residenceUntilDate] - ngày tạm trú đến (dd/mm/yyyy), người dùng tự nhập trước khi xuất
 * @param {string} [signDate] - ngày tháng ký (dd/mm/yyyy), người dùng tự nhập trước khi xuất; để trống thì lấy ngày hiện tại
 */
export function buildCT01Html(building, customer, customerSignatureDataUrl, residenceUntilDate, signDate) {
    const addr = parseBuildingAddress(building?.address);
    const dots = (n) => '.'.repeat(n);

    const name = customer?.name || dots(30);
    const birthDate = customer?.birthDate || customer?.birthYear || dots(10);
    const gender = customer?.gender || dots(6);
    const idNumber = customer?.idNumber || '';
    const email = customer?.email || dots(10);

    const customerSigHtml = customerSignatureDataUrl
        ? `<img src="${customerSignatureDataUrl}" style="height:82pt;max-width:100%;object-fit:contain;display:block;margin:0 auto;">`
        : '';

    // Ngày tháng ký NGƯỜI KÊ KHAI: ưu tiên ngày người dùng tự nhập trước khi xuất, không có thì lấy ngày hiện tại
    const [signDay, signMonth, signYear] = signDate
        ? signDate.split('/')
        : [String(new Date().getDate()).padStart(2, '0'), String(new Date().getMonth() + 1).padStart(2, '0'), new Date().getFullYear()];

    // Độ rộng cột bảng mục 11, đúng tỉ lệ tblGrid docx: 455:2671:1552:758:2163:1550 (twips)
    // Tiêu đề xuống dòng cứng đúng điểm ngắt trong file gốc (2 dòng/ô), viền liền cả 4 cạnh mọi ô
    const memberRow = () =>
        `<tr>${['4%', '34%', '14%', '8%', '24%', '16%'].map(w => `<td style="border:1px solid #000;height:26pt;width:${w};font-size:12pt;"></td>`).join('')}</tr>`;
    const memberTable = `
<table style="width:100%;border-collapse:collapse;table-layout:fixed;${SP}">
  <tr>
    <td style="border:1px solid #000;text-align:center;font-weight:700;width:4%;font-size:9pt;">TT</td>
    <td style="border:1px solid #000;text-align:center;font-weight:700;width:34%;font-size:11pt;">Họ, chữ đệm<br>và tên</td>
    <td style="border:1px solid #000;text-align:center;font-weight:700;width:14%;font-size:11pt;">Ngày, tháng,<br>năm sinh</td>
    <td style="border:1px solid #000;text-align:center;font-weight:700;width:8%;font-size:11pt;">Giới tính</td>
    <td style="border:1px solid #000;text-align:center;font-weight:700;width:24%;font-size:11pt;">Số định danh<br>cá nhân</td>
    <td style="border:1px solid #000;text-align:center;font-weight:700;width:16%;font-size:11pt;">Mối quan hệ<br>với chủ hộ</td>
  </tr>
  ${Array.from({ length: 4 }, memberRow).join('')}
</table>`;

    // Độ rộng 4 cột chữ ký cuối trang. Cột NGƯỜI KÊ KHAI có số (12/07/2026) chiếm nhiều bề ngang hơn chữ
    // chấm chấm của 3 cột kia (chữ số trong Times New Roman rộng hơn dấu chấm nhiều), nên nới rộng hơn
    // + giảm nhẹ cỡ chữ dòng ngày cho chắc vừa 1 hàng, không ép quá tay làm vỡ 3 cột còn lại.
    const sigCol = (dateLine, title, bodyHtml, footHtml, widthPct, italicDate = true, noLeftPad = false) => `
<td style="width:${widthPct}%;text-align:center;vertical-align:top;padding:0 4pt 0 ${noLeftPad ? '0' : '4pt'};">
  <p style="text-align:left;margin:0;${italicDate ? 'font-style:italic;' : ''}">${dateLine}</p>
  <p style="text-align:center;font-weight:700;font-size:10pt;margin:2pt 0 0;">${title}</p>
  <div style="height:82pt;display:flex;align-items:center;justify-content:center;">${bodyHtml || ''}</div>
  <p style="text-align:center;margin:0;">&nbsp;</p>
  ${footHtml || ''}
</td>`;

    return `
<div style="${BODY_FS}line-height:1.25;">
<p style="text-align:center;font-size:13pt;margin:0;">Mẫu CT01 ban hành kèm theo Thông tư số 116/2026/TT-BCA</p>
<p style="text-align:center;font-size:13pt;margin:6pt 0 0;">ngày 29 tháng 6 năm 2026 của Bộ trưởng Bộ Công an</p>
<p style="text-align:center;font-weight:700;font-size:14pt;margin:24pt 0 0;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
<p style="text-align:center;font-weight:700;font-size:14pt;margin:6pt 0 0;text-decoration:underline;">Độc lập – Tự do – Hạnh phúc</p>
<p style="text-align:center;font-weight:700;font-size:13pt;margin:6pt 0 0;">TỜ KHAI THAY ĐỔI THÔNG TIN CƯ TRÚ</p>

<p style="text-align:left;${SP}">Kính gửi<sup>(1)</sup>: ${addr.kinhGuiLine}</p>
<p style="text-align:left;${SP}">1. Họ, chữ đệm và tên khai sinh: ${name}</p>
<p style="text-align:left;${SP}">2. Ngày, tháng, năm sinh: ${birthDate}&nbsp;&nbsp;&nbsp;&nbsp;3. Giới tính: ${gender}</p>
${idNumberRow('4. Số định danh cá nhân:', idNumber, 22)}
<p style="text-align:left;${SP}">5. Số điện thoại liên hệ: ${dots(10)}&nbsp;&nbsp;&nbsp;&nbsp;6. Email: ${email}</p>
<p style="text-align:left;${SP}">7. Họ, chữ đệm và tên chủ hộ<sup>(2)</sup>: ${name}&nbsp;&nbsp;&nbsp;&nbsp;8. Mối quan hệ với chủ hộ: Chủ hộ</p>
${idNumberRow('9. Số định danh cá nhân của chủ hộ:', idNumber, 20.5)}
<p style="text-align:left;${SP}">10. Nội dung đề nghị<sup>(3)</sup>: Đăng ký tạm trú tại địa chỉ ${addr.fullAddress}${residenceUntilDate ? ` đến ngày ${residenceUntilDate}` : ''}</p>
<p style="text-align:left;font-size:13pt;${SP}">11. Những thành viên trong hộ gia đình cùng thay đổi:</p>
${memberTable}
<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:8pt;">
<tr>
${sigCol('..,ngày...tháng...năm...', 'Ý KIẾN CỦA CHỦ HỘ<sup>(4)</sup>', '', '', 21, true, true)}
${sigCol('..,ngày...tháng...năm...', 'Ý KIẾN CỦA CHỦ SỞ HỮU CHỖ Ở HỢP PHÁP<sup>(5)</sup>', '',
    `<p style="text-align:left;font-size:8.5pt;margin:0;white-space:nowrap;">(8) Họ và tên: ..................</p><p style="text-align:left;font-size:8.5pt;margin:0;white-space:nowrap;">(8) Số định danh cá nhân:...........</p>`, 24)}
${sigCol('..,ngày...tháng...năm...', 'Ý KIẾN CỦA CHA HOẶC MẸ HOẶC NGƯỜI GIÁM HỘ<sup>(6)</sup>', '',
    `<p style="text-align:left;font-size:8.5pt;margin:0;white-space:nowrap;">(8) Họ và tên: ..................</p><p style="text-align:left;font-size:8.5pt;margin:0;white-space:nowrap;">(8) Số định danh cá nhân:...........</p>`, 23)}
${sigCol(`..,ngày ${signDay} tháng ${signMonth} năm ${signYear}`, 'NGƯỜI KÊ KHAI<sup>(7)</sup>', customerSigHtml,
    '', 32, false)}
</tr>
</table>
</div>`;
}

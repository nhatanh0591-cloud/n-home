// js/modules/onho3-utils.js
// Hàm tiện ích build "Hợp đồng ở nhờ - Mẫu 3" (cho thuê nhà và đăng ký tạm trú) từ dữ liệu tòa nhà +
// hợp đồng thuê + khách. 1 trang A4 / 1 hợp đồng thuê: Bên B đánh số theo từng khách đã chọn (không dùng bảng).

import { parseBuildingAddress } from './ct01-utils.js';

function toDateSafe(raw) {
    if (!raw) return null;
    const d = raw.toDate ? raw.toDate() : new Date(raw);
    return isNaN(d) ? null : d;
}

function parseDMY(str) {
    if (!str) return null;
    const [d, m, y] = str.split('/').map(Number);
    if (!d || !m || !y) return null;
    const date = new Date(y, m - 1, d);
    return isNaN(date) ? null : date;
}

function fmtDate(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function fmtDateParts(d) {
    return {
        day: String(d.getDate()).padStart(2, '0'),
        month: String(d.getMonth() + 1).padStart(2, '0'),
        year: d.getFullYear()
    };
}

/**
 * @param {object} building - cần address, landlordName, landlordIdNumber, landlordDob, landlordSignatureImage
 * @param {object} contract - hợp đồng thuê, dùng làm ngày ký mặc định (startDate) khi không tự chọn ngày ký
 * @param {Array<object>} tenants - danh sách khách đã chọn thuộc hợp đồng này (đưa vào mục Bên B)
 * @param {string} [tenantSignatureDataUrl] - chữ ký người đại diện hợp đồng (lấy lại từ hợp đồng thuê đã ký)
 * @param {string} [signDateOverride] - ngày ký hợp đồng (dd/mm/yyyy) người dùng tự chọn trước khi xuất;
 *                                       để trống thì lấy ngày bắt đầu hợp đồng thuê, không có thì lấy ngày hiện tại
 */
export function buildOnho3Html(building, contract, tenants, tenantSignatureDataUrl, signDateOverride) {
    const dots = (n) => '.'.repeat(n);

    // Ngày ký = mốc tính "Thời hạn ở" 12 tháng (Từ ngày ký -> đến đúng ngày đó, +1 năm)
    const signDateObj = parseDMY(signDateOverride) || toDateSafe(contract?.startDate) || new Date();
    const signDate = fmtDateParts(signDateObj);
    const endDateObj = new Date(signDateObj);
    endDateObj.setFullYear(endDateObj.getFullYear() + 1);
    const startDateStr = fmtDate(signDateObj);
    const endDateStr = fmtDate(endDateObj);

    const getBirthYear = (dob) => dob ? String(dob).split('/').pop() : dots(4);

    const landlordName = building?.landlordName || dots(30);
    const landlordBirthYear = getBirthYear(building?.landlordDob);
    const landlordId = building?.landlordIdNumber || dots(12);
    const houseAddress = parseBuildingAddress(building?.address).fullAddress || dots(30);

    const landlordSigHtml = building?.landlordSignatureImage
        ? `<img src="${building.landlordSignatureImage}" style="height:75pt;max-width:100%;object-fit:contain;display:block;margin:14pt auto 0;">`
        : '';
    const tenantSigHtml = tenantSignatureDataUrl
        ? `<img src="${tenantSignatureDataUrl}" style="height:75pt;max-width:100%;object-fit:contain;display:block;margin:14pt auto 0;">`
        : '';

    const mb3 = 'margin-bottom:1pt;';
    const ind = 'margin-left:18pt;margin-bottom:1pt;';
    const sp = '<div style="height:10pt;"></div>';

    const tenantBlocks = (tenants || []).map((customer, i) => `
<p style="${mb3}">${i + 1}. Họ và tên: ${customer?.name || dots(20)} &nbsp;&nbsp;&nbsp;&nbsp; SN: ${getBirthYear(customer?.birthDate)}</p>
<p style="${ind}">Số CCCD: ${customer?.idNumber || dots(12)}</p>
<p style="${ind}">Có hộ khẩu thường trú tại: ${customer?.permanentAddress || dots(30)}</p>`).join('');

    return `
<div style="font-size:13pt;line-height:1.25;">
<div style="margin-bottom:2pt;">
  <p style="text-align:center;font-weight:700;font-size:16pt;letter-spacing:0.5px;margin-bottom:2pt;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
  <p style="text-align:center;font-weight:700;margin-bottom:2pt;">Độc lập – Tự do – Hạnh phúc</p>
  <p style="text-align:center;margin-bottom:2pt;">───────────────────────────────</p>
  <p style="text-align:center;font-weight:700;font-size:17pt;margin-top:8pt;margin-bottom:3pt;">HỢP ĐỒNG CHO THUÊ NHÀ VÀ ĐĂNG KÝ TẠM TRÚ</p>
</div>
${sp}
<p style="${mb3}">Hôm nay, ngày ${signDate.day} tháng ${signDate.month} năm ${signDate.year}. Tại: ${houseAddress}.</p>
<p style="${mb3}">Chúng tôi gồm có:</p>
${sp}

<p style="font-weight:700;${mb3}">Bên cho thuê nhà: (Gọi tắt là bên A):</p>
<p style="${mb3}">Họ và tên: ${landlordName} &nbsp;&nbsp;&nbsp;&nbsp; SN: ${landlordBirthYear}</p>
<p style="${mb3}">Số CCCD: ${landlordId}</p>
<p style="${mb3}">Là chủ sở hữu nhà ${houseAddress}.</p>
${sp}

<p style="font-weight:700;${mb3}">Bên thuê nhà: (Gọi tắt là bên B):</p>
${tenantBlocks}
${sp}
<p style="${mb3}">Hiện nay đang ở tại: ${houseAddress}.</p>
${sp}

<p style="font-weight:700;${mb3}">Hai bên tự nguyện thỏa thuận và thống nhất như sau:</p>
${sp}
<p style="${mb3}">+ Bên A đồng ý cho bên B được ở tại địa chỉ ${houseAddress}, 01 (một) phòng có diện tích 25m²</p>
<p style="${mb3}">+ Thời hạn ở: 12 tháng (Từ ngày: ${startDateStr} đến ngày: ${endDateStr})</p>
<p style="${mb3}">+ Trong thời gian cho ở bên A đồng ý cho bên B đăng ký tạm trú, gia hạn tạm trú tại địa chỉ trên theo quy định của pháp luật.</p>
<p style="${mb3}">+ Chúng tôi xác nhận đã hiểu rõ nghĩa vụ, quyền lợi ích hợp pháp của mình và hậu quả pháp lý, đồng thời cam kết không thắc mắc, khiếu nại gì.</p>
${sp}
<p style="${mb3}">Biên bản này được lập thành 02 bản có giá trị như nhau và mỗi bên giữ 01 bản.</p>
${sp}${sp}

<table style="width:100%;margin-top:8pt;border-collapse:collapse;">
  <tr style="page-break-inside:avoid;break-inside:avoid;">
    <td style="width:44%;text-align:center;vertical-align:top;padding:0;">
      <p style="text-align:center;font-weight:700;${mb3}">BÊN Ở NHỜ NHÀ (BÊN B)</p>
      <p style="text-align:center;font-style:italic;${mb3}">(ký, ghi rõ họ tên)</p>
      ${tenantSigHtml}
    </td>
    <td style="width:12%;"></td>
    <td style="width:44%;text-align:center;vertical-align:top;padding:0;">
      <p style="text-align:center;font-weight:700;${mb3}">BÊN CHO Ở NHỜ NHÀ (BÊN A)</p>
      <p style="text-align:center;font-style:italic;${mb3}">(ký, ghi rõ họ tên)</p>
      ${landlordSigHtml}
    </td>
  </tr>
</table>
</div>`;
}

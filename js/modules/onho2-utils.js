// js/modules/onho2-utils.js
// Hàm tiện ích build "Hợp đồng ở nhờ - Mẫu 2" (đăng ký tạm trú) từ dữ liệu tòa nhà + hợp đồng thuê + khách.
// 1 trang A4 / 1 hợp đồng thuê: liệt kê từng khách đã chọn thuộc hợp đồng đó theo số thứ tự (không dùng bảng).

import { parseBuildingAddress } from './ct01-utils.js';

function toDateSafe(raw) {
    if (!raw) return null;
    const d = raw.toDate ? raw.toDate() : new Date(raw);
    return isNaN(d) ? null : d;
}

function fmtDateParts(raw) {
    const d = toDateSafe(raw);
    if (!d) return null;
    return {
        day: String(d.getDate()).padStart(2, '0'),
        month: String(d.getMonth() + 1).padStart(2, '0'),
        year: d.getFullYear()
    };
}

/**
 * @param {object} building - cần address, landlordName, landlordIdNumber, landlordAddress, landlordSignatureImage
 * @param {object} contract - hợp đồng thuê, dùng làm ngày ký mặc định (startDate) khi không tự chọn ngày ký
 * @param {Array<object>} tenants - danh sách khách đã chọn thuộc hợp đồng này (đưa vào mục Bên B)
 * @param {string} [tenantSignatureDataUrl] - chữ ký người đại diện hợp đồng (lấy lại từ hợp đồng thuê đã ký)
 * @param {string} [signDateOverride] - ngày ký hợp đồng (dd/mm/yyyy) người dùng tự chọn trước khi xuất;
 *                                       để trống thì lấy ngày bắt đầu hợp đồng thuê, không có thì lấy ngày hiện tại
 */
export function buildOnho2Html(building, contract, tenants, tenantSignatureDataUrl, signDateOverride) {
    const dots = (n) => '.'.repeat(n);
    const signDate = signDateOverride
        ? { day: signDateOverride.split('/')[0], month: signDateOverride.split('/')[1], year: signDateOverride.split('/')[2] }
        : fmtDateParts(contract?.startDate) || fmtDateParts(new Date());
    const signDateStr = `${signDate.day}/${signDate.month}/${signDate.year}`;

    // Thời hạn ở nhờ 24 tháng tính từ ngày ký, ngày kết thúc tự tính = ngày ký + 24 tháng
    const durationMonths = 24;
    const endDateObj = new Date(parseInt(signDate.year, 10), parseInt(signDate.month, 10) - 1, parseInt(signDate.day, 10));
    endDateObj.setMonth(endDateObj.getMonth() + durationMonths);
    const endDateStr = `${String(endDateObj.getDate()).padStart(2, '0')}/${String(endDateObj.getMonth() + 1).padStart(2, '0')}/${endDateObj.getFullYear()}`;

    const landlordName = building?.landlordName ? building.landlordName.toUpperCase() : dots(30);
    const landlordId = building?.landlordIdNumber || dots(12);
    const landlordAddress = building?.landlordAddress || dots(30);
    const houseAddress = parseBuildingAddress(building?.address).fullAddress || dots(30);

    const landlordSigHtml = building?.landlordSignatureImage
        ? `<img src="${building.landlordSignatureImage}" style="height:75pt;max-width:100%;object-fit:contain;display:block;margin:14pt auto 0;">`
        : '';
    const tenantSigHtml = tenantSignatureDataUrl
        ? `<img src="${tenantSignatureDataUrl}" style="height:75pt;max-width:100%;object-fit:contain;display:block;margin:14pt auto 0;">`
        : '';

    const mb3 = 'margin-bottom:1pt;';
    const sp = '<div style="height:10pt;"></div>';

    const tenantBlocks = (tenants || []).map((customer, i) => `
<p style="${mb3}">${i + 1}. Ông(bà): ${customer?.name ? customer.name.toUpperCase() : dots(20)}</p>
<p style="${mb3}">Số CMND/CCCD (Hộ chiếu): ${customer?.idNumber || dots(12)}</p>
<p style="${mb3}">Thường trú: ${customer?.permanentAddress || dots(30)}</p>`).join('');

    return `
<div style="font-size:13pt;line-height:1.25;">
<div style="margin-bottom:2pt;">
  <p style="text-align:center;font-weight:700;font-size:16pt;letter-spacing:0.5px;margin-bottom:2pt;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
  <p style="text-align:center;font-weight:700;margin-bottom:2pt;">Độc lập - Tự do - Hạnh phúc</p>
  <p style="text-align:center;margin-bottom:2pt;">_____*****____</p>
  <p style="text-align:center;font-weight:700;font-size:17pt;margin-top:8pt;margin-bottom:3pt;">HỢP ĐỒNG CHO THUÊ NHÀ</p>
</div>
${sp}
<p style="${mb3}">Hôm nay, ngày ${signDate.day} tháng ${signDate.month} năm ${signDate.year}</p>
<p style="${mb3}">Tại địa chỉ: ${houseAddress}</p>
<p style="${mb3}">Chúng tôi gồm:</p>
${sp}

<p style="font-weight:700;${mb3}">I. BÊN CHO THUÊ NHÀ (sau đây gọi tắt là Bên A):</p>
<p style="${mb3}">1. Ông(bà): ${landlordName}</p>
<p style="${mb3}">Số CMND/CCCD (Hộ chiếu): ${landlordId}</p>
<p style="${mb3}">Thường Trú: ${landlordAddress}</p>
<p style="${mb3}">Là chủ sở căn nhà: ${houseAddress}</p>
${sp}

<p style="font-weight:700;${mb3}">II. BÊN THUÊ NHÀ (sau đây gọi tắt là Bên B):</p>
${tenantBlocks}
${sp}

<p style="font-weight:700;${mb3}">Hai bên tự nguyện thỏa thuận và thống nhất như sau:</p>
<p style="${mb3}">Bên A đồng ý cho bên B được thuê tại nhà số: ${houseAddress} thời gian ${durationMonths} tháng từ ngày ${signDateStr} đến ${endDateStr}. Mục đích để ở và đăng ký tạm trú.</p>
<p style="${mb3}">Biên bản này được lập thành 02 bản có giá trị như nhau và mỗi bên giữ 01 bản.</p>
${sp}${sp}

<table style="width:100%;margin-top:8pt;border-collapse:collapse;">
  <tr style="page-break-inside:avoid;break-inside:avoid;">
    <td style="width:44%;text-align:center;vertical-align:top;padding:0;">
      <p style="text-align:center;font-weight:700;${mb3}">Bên cho thuê nhà (Bên A)</p>
      <p style="text-align:center;font-style:italic;${mb3}">(ký, ghi rõ họ tên)</p>
      ${landlordSigHtml}
    </td>
    <td style="width:12%;"></td>
    <td style="width:44%;text-align:center;vertical-align:top;padding:0;">
      <p style="text-align:center;font-weight:700;${mb3}">Bên thuê nhà (Bên B)</p>
      <p style="text-align:center;font-style:italic;${mb3}">(ký, ghi rõ họ tên)</p>
      ${tenantSigHtml}
    </td>
  </tr>
</table>
</div>`;
}

// js/modules/onho1-utils.js
// Hàm tiện ích build "Hợp đồng ở nhờ - Mẫu 1" (đăng ký tạm trú) từ dữ liệu tòa nhà + hợp đồng thuê + khách.
// 1 trang A4 / 1 hợp đồng thuê: bảng Bên B liệt kê tất cả khách đã chọn thuộc hợp đồng đó.

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
 * @param {object} building - cần address, landlordName, landlordIdNumber, landlordDob, landlordIdIssueDate,
 *                             landlordIdIssuePlace, landlordAddress, landlordCurrentAddress, landlordSignatureImage
 * @param {object} contract - hợp đồng thuê, dùng làm ngày ký mặc định (startDate) khi không tự chọn ngày ký
 * @param {Array<object>} tenants - danh sách khách đã chọn thuộc hợp đồng này (đưa vào bảng Bên B)
 * @param {string} [tenantSignatureDataUrl] - chữ ký người đại diện hợp đồng (lấy lại từ hợp đồng thuê đã ký)
 * @param {string} [signDateOverride] - ngày ký hợp đồng ở nhờ (dd/mm/yyyy) người dùng tự chọn trước khi xuất;
 *                                       để trống thì lấy ngày bắt đầu hợp đồng thuê, không có thì lấy ngày hiện tại
 */
export function buildOnho1Html(building, contract, tenants, tenantSignatureDataUrl, signDateOverride) {
    const dots = (n) => '.'.repeat(n);
    const signDate = signDateOverride
        ? { day: signDateOverride.split('/')[0], month: signDateOverride.split('/')[1], year: signDateOverride.split('/')[2] }
        : fmtDateParts(contract?.startDate) || fmtDateParts(new Date());
    const durationMonths = 12;

    const landlordName = building?.landlordName ? building.landlordName.toUpperCase() : dots(30);
    const landlordBirthYear = building?.landlordDob ? building.landlordDob.split('/').pop() : dots(4);
    const landlordId = building?.landlordIdNumber || dots(12);
    const landlordIdIssueDate = building?.landlordIdIssueDate || dots(10);
    const landlordIdIssuePlace = building?.landlordIdIssuePlace || dots(20);
    const landlordAddress = building?.landlordAddress || dots(30);
    const landlordCurrentAddress = building?.landlordCurrentAddress || landlordAddress;
    const houseAddress = parseBuildingAddress(building?.address).fullAddress || dots(30);

    const landlordSigHtml = building?.landlordSignatureImage
        ? `<img src="${building.landlordSignatureImage}" style="height:75pt;max-width:100%;object-fit:contain;display:block;margin:14pt auto 0;">`
        : '';
    const tenantSigHtml = tenantSignatureDataUrl
        ? `<img src="${tenantSignatureDataUrl}" style="height:75pt;max-width:100%;object-fit:contain;display:block;margin:14pt auto 0;">`
        : '';

    const mb3 = 'margin-bottom:1pt;';
    const sp = '<div style="height:10pt;"></div>';

    const cellStyle = 'border:1px solid #000;padding:8pt 4pt;vertical-align:middle;font-size:12pt;word-break:break-word;';
    const tenantRows = (tenants || []).map((customer, i) => `
    <tr>
      <td style="${cellStyle}text-align:center;">${i + 1}</td>
      <td style="${cellStyle}"><strong>${customer?.name ? customer.name.toUpperCase() : dots(20)}</strong></td>
      <td style="${cellStyle}text-align:center;">${customer?.birthDate || dots(10)}</td>
      <td style="${cellStyle}text-align:center;">${customer?.gender ? customer.gender.toUpperCase() : dots(4)}</td>
      <td style="${cellStyle}">${customer?.hometown ? customer.hometown.toUpperCase() : dots(15)}</td>
      <td style="${cellStyle}text-align:center;">${customer?.ethnicity ? customer.ethnicity.toUpperCase() : dots(8)}</td>
      <td style="${cellStyle}text-align:center;">${customer?.idNumber || dots(12)}</td>
    </tr>`).join('');

    return `
<div style="font-size:13pt;line-height:1.25;">
<div style="margin-bottom:2pt;">
  <p style="text-align:center;font-weight:700;font-size:16pt;letter-spacing:0.5px;margin-bottom:2pt;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
  <p style="text-align:center;font-weight:700;margin-bottom:2pt;text-decoration:underline;">Độc lập – Tự do – Hạnh phúc</p>
  <p style="text-align:center;font-weight:700;font-size:17pt;margin-top:8pt;margin-bottom:3pt;">HỢP ĐỒNG CHO Ở NHỜ NHÀ</p>
</div>
${sp}
<p style="${mb3}">Ngày ${signDate.day} tháng ${signDate.month} năm ${signDate.year}, Tại ${houseAddress}, Chúng tôi gồm có:</p>
${sp}

<p style="font-weight:700;${mb3}">Bên A: (chủ sở hữu chỗ ở hợp pháp)</p>
<p style="${mb3}">1. Họ và tên: <strong>${landlordName}</strong> &nbsp;&nbsp;&nbsp;&nbsp; Sinh năm: ${landlordBirthYear}</p>
<p style="${mb3}">Số Căn cước công dân: ${landlordId} &nbsp;&nbsp;&nbsp;&nbsp; Ngày cấp: ${landlordIdIssueDate}</p>
<p style="${mb3}">Nơi cấp: ${landlordIdIssuePlace}</p>
<p style="${mb3}">Có hộ khẩu thường trú tại: ${landlordAddress}</p>
<p style="${mb3}">Chỗ ở hiện nay: ${landlordCurrentAddress}</p>
<p style="${mb3}">Là chủ nhà số: ${houseAddress}</p>
${sp}

<p style="font-weight:700;${mb3}">Bên B: (bên ở nhờ) gồm những người có tên dưới đây:</p>
<table style="width:100%;border-collapse:collapse;margin-top:4pt;table-layout:fixed;font-size:12pt;">
  <tr>
    <td style="border:1px solid #000;text-align:center;vertical-align:middle;font-weight:700;padding:6pt 4pt;width:7%;">STT</td>
    <td style="border:1px solid #000;text-align:center;vertical-align:middle;font-weight:700;padding:6pt 4pt;width:19%;">Họ và tên</td>
    <td style="border:1px solid #000;text-align:center;vertical-align:middle;font-weight:700;padding:6pt 4pt;width:15%;">Ngày tháng năm sinh</td>
    <td style="border:1px solid #000;text-align:center;vertical-align:middle;font-weight:700;padding:6pt 4pt;width:9%;">Giới tính</td>
    <td style="border:1px solid #000;text-align:center;vertical-align:middle;font-weight:700;padding:6pt 4pt;width:16%;">Quê quán</td>
    <td style="border:1px solid #000;text-align:center;vertical-align:middle;font-weight:700;padding:6pt 4pt;width:9%;">Dân tộc</td>
    <td style="border:1px solid #000;text-align:center;vertical-align:middle;font-weight:700;padding:6pt 4pt;width:25%;">Số CCCD</td>
  </tr>
  ${tenantRows}
</table>
${sp}

<p style="font-weight:700;${mb3}">Hai bên tự nguyện thỏa thuận và thống nhất như sau:</p>
<p style="${mb3}">Bên A đồng ý cho bên B được ở nhờ và đăng ký tạm trú.</p>
<p style="${mb3}">Tại địa chỉ: ${houseAddress}.</p>
<p style="${mb3}">Thời hạn ở nhờ và đăng ký tạm trú là ${durationMonths} tháng kể từ ngày hợp đồng này được ký kết.</p>
<p style="${mb3}">Hợp đồng này được lập thành 02 bản có giá trị như nhau và mỗi bên giữ 01 bản.</p>
${sp}${sp}

<table style="width:100%;margin-top:8pt;border-collapse:collapse;">
  <tr style="page-break-inside:avoid;break-inside:avoid;">
    <td style="width:44%;text-align:center;vertical-align:top;padding:0;">
      <p style="text-align:center;font-weight:700;${mb3}">BÊN B (Bên ở nhờ nhà)</p>
      <p style="text-align:center;font-style:italic;${mb3}">(ký, ghi rõ họ tên)</p>
      ${tenantSigHtml}
    </td>
    <td style="width:12%;"></td>
    <td style="width:44%;text-align:center;vertical-align:top;padding:0;">
      <p style="text-align:center;font-weight:700;${mb3}">BÊN A (chủ sở hữu nhà)</p>
      <p style="text-align:center;font-style:italic;${mb3}">(ký, ghi rõ họ tên)</p>
      ${landlordSigHtml}
    </td>
  </tr>
</table>
</div>`;
}

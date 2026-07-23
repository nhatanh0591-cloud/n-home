// js/modules/onho4-utils.js
// Hàm tiện ích build "Hợp đồng ở nhờ - Mẫu 4" (Hợp đồng thuê nhà) từ dữ liệu tòa nhà + khách.
// Khác với mẫu 1/2/3 (liệt kê nhiều khách/1 trang), mẫu 4 mỗi trang chỉ 1 khách (giống CT01):
// chọn khách nào thì xuất riêng cho khách đó. Chủ nhà (Bên A) luôn chỉ 1 người.
// Bỏ ngày cấp/nơi cấp CCCD và số điện thoại của cả 2 bên theo yêu cầu (không có trong bản in).
// Giá thuê in cố định 4.000.000đ/tháng, thời hạn hợp đồng cố định 24 tháng kể từ ngày ký.

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
 * @param {object} building - cần address, landlordName, landlordIdNumber, landlordDob, landlordAddress, landlordSignatureImage
 * @param {object} contract - hợp đồng thuê, dùng làm ngày ký mặc định (startDate) khi không tự chọn ngày ký
 * @param {object} customer - khách thuê (Bên B) được chọn để xuất riêng trang này
 * @param {string} [tenantSignatureDataUrl] - chữ ký cá nhân của khách (lấy từ hồ sơ khách hàng)
 * @param {string} [signDateOverride] - ngày ký hợp đồng (dd/mm/yyyy) người dùng tự chọn trước khi xuất;
 *                                       để trống thì lấy ngày bắt đầu hợp đồng thuê, không có thì lấy ngày hiện tại
 */
export function buildOnho4Html(building, contract, customer, tenantSignatureDataUrl, signDateOverride) {
    const dots = (n) => '.'.repeat(n);
    const signDate = signDateOverride
        ? { day: signDateOverride.split('/')[0], month: signDateOverride.split('/')[1], year: signDateOverride.split('/')[2] }
        : fmtDateParts(contract?.startDate) || fmtDateParts(new Date());

    // Thời hạn hợp đồng cố định 24 tháng kể từ ngày ký, ngày kết thúc tự tính
    const durationMonths = 24;
    const endDateObj = new Date(parseInt(signDate.year, 10), parseInt(signDate.month, 10) - 1, parseInt(signDate.day, 10));
    endDateObj.setMonth(endDateObj.getMonth() + durationMonths);
    const endDate = {
        day: String(endDateObj.getDate()).padStart(2, '0'),
        month: String(endDateObj.getMonth() + 1).padStart(2, '0'),
        year: endDateObj.getFullYear()
    };

    const houseAddress = parseBuildingAddress(building?.address).fullAddress || dots(30);

    const landlordName = building?.landlordName ? building.landlordName.toUpperCase() : dots(30);
    const landlordDob = building?.landlordDob || dots(10);
    const landlordAddress = building?.landlordAddress || dots(30);
    const landlordId = building?.landlordIdNumber || dots(12);

    const tenantName = customer?.name ? customer.name.toUpperCase() : dots(30);
    const tenantDob = customer?.birthDate || dots(10);
    const tenantAddress = customer?.permanentAddress || dots(30);
    const tenantId = customer?.idNumber || dots(12);

    const landlordSigHtml = building?.landlordSignatureImage
        ? `<img src="${building.landlordSignatureImage}" style="height:75pt;max-width:100%;object-fit:contain;display:block;margin:14pt auto 0;">`
        : '';
    const tenantSigHtml = tenantSignatureDataUrl
        ? `<img src="${tenantSignatureDataUrl}" style="height:75pt;max-width:100%;object-fit:contain;display:block;margin:14pt auto 0;">`
        : '';

    const mb3 = 'margin-bottom:1pt;';
    const sp = '<div style="height:10pt;"></div>';

    return `
<div style="font-size:13pt;line-height:1.25;">
<div style="margin-bottom:2pt;">
  <p style="text-align:center;font-weight:700;font-size:16pt;letter-spacing:0.5px;margin-bottom:2pt;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
  <p style="text-align:center;font-weight:700;margin-bottom:2pt;">Độc lập – Tự do – Hạnh phúc</p>
  <p style="text-align:center;margin-bottom:2pt;">--------o0o-------</p>
  <p style="text-align:center;font-weight:700;font-size:17pt;margin-top:8pt;margin-bottom:3pt;">HỢP ĐỒNG THUÊ NHÀ</p>
</div>
${sp}
<p style="${mb3}">Hôm nay ngày ${signDate.day} tháng ${signDate.month} năm ${signDate.year}; tại địa chỉ: ${houseAddress}</p>
<p style="${mb3}">Chúng tôi gồm:</p>
${sp}

<p style="font-weight:700;${mb3}">1. Đại diện bên cho thuê phòng trọ (Bên A):</p>
<p style="${mb3}">Ông/bà: <strong>${landlordName}</strong> &nbsp;&nbsp;&nbsp;&nbsp; Sinh ngày: ${landlordDob}</p>
<p style="${mb3}">Nơi đăng ký HK thường trú: ${landlordAddress}</p>
<p style="${mb3}">Số CCCD: ${landlordId}</p>
${sp}

<p style="font-weight:700;${mb3}">2. Bên thuê phòng trọ (Bên B):</p>
<p style="${mb3}">Ông/bà: <strong>${tenantName}</strong> &nbsp;&nbsp;&nbsp;&nbsp; Sinh ngày: ${tenantDob}</p>
<p style="${mb3}">Nơi đăng ký HK thường trú: ${tenantAddress}</p>
<p style="${mb3}">Số CCCD: ${tenantId}</p>
${sp}

<p style="${mb3}">Sau khi bàn bạc trên tinh thần dân chủ, hai bên cùng có lợi, cùng thống nhất như sau:</p>
<p style="${mb3}">Bên A đồng ý cho bên B thuê 01 phòng ở tại địa chỉ: ${houseAddress}</p>
<p style="${mb3}">Giá thuê: 4.000.000 đ/tháng</p>
<p style="${mb3}">Hợp đồng có giá trị kể từ ngày ${signDate.day} tháng ${signDate.month} năm ${signDate.year} đến ngày ${endDate.day} tháng ${endDate.month} năm ${endDate.year}</p>
${sp}

<p style="text-align:center;font-weight:700;${mb3}">TRÁCH NHIỆM CỦA CÁC BÊN</p>
<p style="${mb3}"><em>* Trách nhiệm của bên A:</em></p>
<p style="${mb3}">- Tạo mọi điều kiện thuận lợi để bên B thực hiện theo hợp đồng.</p>
<p style="${mb3}">- Cung cấp nguồn điện, nước, wifi cho bên B sử dụng.</p>
<p style="${mb3}"><em>* Trách nhiệm của bên B:</em></p>
<p style="${mb3}">- Thanh toán đầy đủ các khoản tiền theo đúng thỏa thuận.</p>
<p style="${mb3}">- Bảo quản các trang thiết bị và cơ sở vật chất của bên A trang bị cho ban đầu (làm hỏng phải sửa, mất phải đền).</p>
<p style="${mb3}">- Không được tự ý sửa chữa, cải tạo cơ sở vật chất khi chưa được sự đồng ý của bên A.</p>
<p style="${mb3}">- Giữ gìn vệ sinh trong và ngoài khuôn viên của phòng trọ.</p>
<p style="${mb3}">- Bên B phải chấp hành mọi quy định của pháp luật Nhà nước và quy định của địa phương.</p>
<p style="${mb3}">- Nếu bên B cho khách ở qua đêm thì phải báo và được sự đồng ý của chủ nhà đồng thời phải chịu trách nhiệm về các hành vi vi phạm pháp luật của khách trong thời gian ở lại.</p>
${sp}

<p style="text-align:center;font-weight:700;${mb3}">TRÁCH NHIỆM CHUNG</p>
<p style="${mb3}">- Hai bên phải tạo điều kiện cho nhau thực hiện hợp đồng.</p>
<p style="${mb3}">- Trong thời gian hợp đồng còn hiệu lực nếu bên nào vi phạm các điều khoản đã thỏa thuận thì bên còn lại có quyền đơn phương chấm dứt hợp đồng; nếu sự vi phạm hợp đồng đó gây tổn thất cho bên bị vi phạm hợp đồng thì bên vi phạm hợp đồng phải bồi thường thiệt hại.</p>
<p style="${mb3}">- Một trong hai bên muốn chấm dứt hợp đồng trước thời hạn thì phải báo trước cho bên kia ít nhất 30 ngày và hai bên phải có sự thống nhất.</p>
<p style="${mb3}">- Bên A phải trả lại tiền đặt cọc cho bên B.</p>
<p style="${mb3}">- Bên nào vi phạm điều khoản chung thì phải chịu trách nhiệm trước pháp luật.</p>
<p style="${mb3}">- Hợp đồng được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ một bản.</p>
${sp}${sp}

<table style="width:100%;margin-top:8pt;border-collapse:collapse;">
  <tr style="page-break-inside:avoid;break-inside:avoid;">
    <td style="width:44%;text-align:center;vertical-align:top;padding:0;">
      <p style="text-align:center;font-weight:700;${mb3}">ĐẠI DIỆN BÊN A</p>
      <p style="text-align:center;font-style:italic;${mb3}">(Ký và ghi rõ họ tên)</p>
      ${landlordSigHtml}
    </td>
    <td style="width:12%;"></td>
    <td style="width:44%;text-align:center;vertical-align:top;padding:0;">
      <p style="text-align:center;font-weight:700;${mb3}">ĐẠI DIỆN BÊN B</p>
      <p style="text-align:center;font-style:italic;${mb3}">(Ký và ghi rõ họ tên)</p>
      ${tenantSigHtml}
    </td>
  </tr>
</table>
</div>`;
}

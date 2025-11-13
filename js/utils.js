// js/utils.js

// --- HÀM TIỆN ÍCH ---

/**
 * Tạo một ID ngẫu nhiên duy nhất
 */
export function generateId() {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/**
 * Định dạng số với dấu chấm (ví dụ: 10000 -> "10.000")
 */
export function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Định dạng tiền tệ (ví dụ: 10000 -> "10,000")
 */
export function formatCurrency(num) {
    if (num === null || num === undefined) return '0';
    return Math.round(num).toLocaleString('en-US');
}

/**
 * Chuyển số đã định dạng về số nguyên (ví dụ: "10.000" -> 10000)
 */
export function parseFormattedNumber(str) {
    if (typeof str !== 'string') return 0;
    return parseInt(str.replace(/\./g, '')) || 0;
}

/**
 * Định dạng ngày từ YYYY-MM-DD hoặc Date object sang DD-MM-YYYY
 */
export function formatDateDisplay(dateStr) {
    if (!dateStr) return '';
    let date;
    if (dateStr instanceof Date) {
        date = dateStr;
    } else if (typeof dateStr === 'string' && dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length === 3 && parts[0].length === 4) { // YYYY-MM-DD
            const [year, month, day] = parts;
            return `${day.padStart(2, '0')}-${month.padStart(2, '0')}-${year}`;
        }
    }
    // Nếu đã là DD-MM-YYYY thì trả về luôn
    if (typeof dateStr === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
        return dateStr;
    }
    
    // Nếu là Date object
    if (date) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }
    
    return dateStr.toString();
}

/**
 * Chuyển đổi nhiều định dạng ngày (DD-MM-YYYY, YYYY-MM-DD, số từ Excel) sang Date object
 */
export function parseDateInput(dateStr) {
    if (!dateStr) return null;
    
    // 1. Nếu là số (từ Excel)
    if (typeof dateStr === 'number') {
        // Excel serial date: ngày 1/1/1900 = 1, nhưng Excel coi 1900 là năm nhuận sai
        // Để chuyển đổi chính xác, ta cần điều chỉnh
        const excelEpoch = new Date(1899, 11, 30); // 30/12/1899
        const days = dateStr;
        const result = new Date(excelEpoch.getTime() + days * 24 * 60 * 60 * 1000);
        
        // Đảm bảo sử dụng UTC để tránh vấn đề timezone
        return new Date(result.getFullYear(), result.getMonth(), result.getDate());
    }
    
    // 2. Nếu là chuỗi
    if (typeof dateStr === 'string') {
        // Định dạng DD-MM-YYYY
        if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
            const [day, month, year] = dateStr.split('-');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        // Định dạng YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const [year, month, day] = dateStr.split('-');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        // Định dạng DD/MM/YYYY
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
            const [day, month, year] = dateStr.split('/');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
        // Định dạng DD/MM/YYYY (với dấu phẩy hoặc khoảng trắng)
        const cleanStr = dateStr.trim().replace(/[,\s]/g, '');
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanStr)) {
            const [day, month, year] = cleanStr.split('/');
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
    }
    
    // 3. Thử tạo Date trực tiếp (cho trường hợp ISO string)
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
        return date;
    }

    return null;
}

/**
 * Lấy ngày hiện tại dưới dạng YYYY-MM-DD (local timezone)
 */
export function getCurrentDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Chuyển đổi Date object thành string YYYY-MM-DD (local timezone) 
 */
export function formatDateForStorage(date) {
    if (!date) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Định dạng Timestamp của Firebase sang DD-MM-YYYY
 */
export function formatFirebaseDate(timestamp) {
    if (!timestamp) return '';
    let date;
    if (timestamp.toDate) {
        // Dạng Timestamp object
        date = timestamp.toDate();
    } else if (timestamp.seconds) {
        // Dạng object { seconds, nanoseconds }
        date = new Date(timestamp.seconds * 1000);
    } else {
        // Dạng chuỗi ISO hoặc Date object
        date = new Date(timestamp);
    }
    return formatDateDisplay(date);
}

/**
 * Chuyển đổi ngày từ DD-MM-YYYY sang YYYY-MM-DD cho input type="date"
 */
export function convertToDateInputFormat(dateStr) {
    if (!dateStr) return '';
    
    // Nếu đã là YYYY-MM-DD thì trả về luôn
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }
    
    // Nếu là DD-MM-YYYY thì chuyển đổi
    if (typeof dateStr === 'string' && /^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
        const [day, month, year] = dateStr.split('-');
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    const date = parseDateInput(dateStr);
    if (!date) return '';
    
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Định dạng tiền tệ (ví dụ: 10000 -> "10.000")
 */
export function formatMoney(number) {
    if (number === null || number === undefined) return '0';
    return Number(number).toLocaleString('vi-VN');
}

/**
 * Tự động định dạng khi nhập vào ô input tiền
 */
export function formatMoneyInput(input) {
    let value = input.value.replace(/\./g, '');
    if (value && !isNaN(value)) {
        input.value = formatNumber(value);
    }
}

/**
 * Hiển thị thông báo (toast)
 */
export function showToast(message, type = 'success') {
    const toastEl = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toastEl || !toastMsg) return;

    toastMsg.textContent = message;
    toastEl.classList.remove('hidden', 'bg-green-500', 'bg-red-500', 'bg-blue-500', 'translate-y-16');
    
    if (type === 'success') {
        toastEl.classList.add('bg-green-500');
    } else if (type === 'error') {
        toastEl.classList.add('bg-red-500');
    } else {
        toastEl.classList.add('bg-blue-500'); // Mặc định cho 'info'
    }

    // Hiệu ứng xuất hiện
    setTimeout(() => {
        toastEl.classList.remove('opacity-0', 'translate-y-full');
    }, 10);

    // Tự động ẩn
    setTimeout(() => {
        toastEl.classList.add('opacity-0', 'translate-y-full');
        setTimeout(() => toastEl.classList.add('hidden'), 300);
    }, 3000);
}

/**
 * Mở một modal (cửa sổ pop-up)
 */
export const openModal = (modalEl) => {
    if (!modalEl) return;
    modalEl.classList.remove('hidden');
    setTimeout(() => {
        modalEl.classList.remove('opacity-0');
        modalEl.querySelector('.modal-content').classList.remove('scale-95');
    }, 10); // 10ms để trình duyệt kịp render
};

/**
 * Đóng một modal
 */
export const closeModal = (modalEl) => {
    if (!modalEl) return;
    modalEl.classList.add('opacity-0');
    modalEl.querySelector('.modal-content').classList.add('scale-95');
    setTimeout(() => modalEl.classList.add('hidden'), 300); // 300ms khớp với transition
};

/**
 * Xuất dữ liệu ra file Excel
 */
export function exportToExcel(data, fileName, dropdownConfig = null) {
    try {
        if (!data || data.length === 0) {
            showToast('Không có dữ liệu để xuất!', 'error');
            return;
        }
        
        // Kiểm tra nếu data là array of arrays thì dùng aoa_to_sheet, nếu không thì dùng json_to_sheet
        const ws = Array.isArray(data[0]) ? XLSX.utils.aoa_to_sheet(data) : XLSX.utils.json_to_sheet(data);
        
        // Tự động điều chỉnh độ rộng cột
        const colWidths = [];
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        for (let C = range.s.c; C <= range.e.c; ++C) {
            let maxWidth = 10; // Chiều rộng tối thiểu
            for (let R = range.s.r; R <= range.e.r; ++R) {
                const cellAddr = XLSX.utils.encode_cell({r: R, c: C});
                const cell = ws[cellAddr];
                if (cell && cell.v) {
                    const cellLength = String(cell.v).length;
                    maxWidth = Math.max(maxWidth, cellLength);
                }
            }
            colWidths.push({ wch: Math.min(maxWidth + 2, 50) }); // Giới hạn 50 ký tự
        }
        ws['!cols'] = colWidths;
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        
        // Thêm sheet riêng chứa danh sách dropdown nếu có config
        if (dropdownConfig) {
            const listData = [
                ['DANH SACH CHON DROPDOWN'],
                [''],
                ['Cot A - Loai Thu Chi:', 'Thu', 'Chi'],
                [''],
                ['Cot I - Hang Muc:']
            ];
            
            // Thêm các hạng mục
            dropdownConfig['I']?.values.forEach((item, index) => {
                if (index === 0) {
                    listData[4].push(item);
                } else {
                    listData.push(['', item]);
                }
            });
            
            listData.push(['']);
            listData.push(['HUONG DAN:']);
            listData.push(['1. Cot "Loai": Chon Thu hoac Chi']);
            listData.push(['2. Cot "Hang muc": Copy ten hang muc tu danh sach tren']);
            listData.push(['3. Hoac go dung ten hang muc co san tren web']);
            
            const listWs = XLSX.utils.aoa_to_sheet(listData);
            XLSX.utils.book_append_sheet(wb, listWs, 'Danh Sach');
        }
        
        const timestamp = new Date().toISOString().slice(0, 10);
        const fullFileName = `${fileName}_${timestamp}.xlsx`;
        
        XLSX.writeFile(wb, fullFileName);
        
    } catch (error) {
        console.error('Lỗi xuất Excel:', error);
        showToast('Lỗi xuất Excel: ' + error.message, 'error');
    }
}

/**
 * Đọc dữ liệu từ file Excel
 */
export async function importFromExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                resolve(jsonData);
            } catch (error) {
                console.error('Lỗi đọc Excel:', error);
                reject(error);
            }
        };
        
        reader.onerror = (error) => {
            console.error('Lỗi đọc file:', error);
            reject(error);
        };
        
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Định dạng kích thước file
 */
export function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format time từ Date object thành HH:MM
 */
export function formatTime(date) {
    if (!date) return '';
    if (!(date instanceof Date)) date = new Date(date);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Format date từ Date object thành DD-MM-YYYY
 */
export function formatDate(date) {
    if (!date) return '';
    if (!(date instanceof Date)) date = new Date(date);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Gửi thông báo đẩy (Push Notification) cho khách hàng
 * @param {string} customerId - ID khách hàng 
 * @param {string} title - Tiêu đề thông báo
 * @param {string} body - Nội dung thông báo  
 * @param {object} data - Dữ liệu thêm (optional)
 */
export async function sendPushNotification(customerId, title, body, data = {}) {
    try {
        // Thử gửi qua API trước
        const response = await fetch('/api/send-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                customerId: customerId,
                title: title,
                body: body,
                data: data
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Thông báo đẩy gửi thành công');
            return result;
        } else {
            throw new Error('API failed');
        }
    } catch (apiError) {
        // Fallback: Browser notification (cho local test)
        if ('Notification' in window && Notification.permission === 'granted') {
            // Tạo unique tag để mỗi notification hiển thị riêng
            const uniqueTag = data.uniqueId || `n-home-${Date.now()}-${Math.random()}`;
            
            new Notification(title, {
                body: body,
                icon: '/icon-nen-xanh.jpg',
                tag: uniqueTag,
                requireInteraction: true,
                data: data,
                renotify: true // Luôn hiển thị notification mới
            });
            return { success: true, method: 'browser-fallback' };
        }
        console.error('❌ Gửi thông báo thất bại:', apiError);
    }
}

/**
 * Custom confirm modal đẹp hơn thay thế window.confirm()
 */
export function showConfirm(message, title = 'Xác nhận', okText = 'OK', cancelText = 'Hủy') {
    return new Promise((resolve) => {
        // Tạo modal HTML
        const modal = document.createElement('div');
        modal.id = 'custom-confirm-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]';
        modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 transform scale-95 opacity-0 transition-all duration-200">
                <div class="p-6">
                    <div class="flex items-center mb-4">
                        <div class="flex-shrink-0">
                            <svg class="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.268 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                            </svg>
                        </div>
                        <div class="ml-3 flex-1">
                            <h3 class="text-lg font-semibold text-gray-900">${title}</h3>
                        </div>
                    </div>
                    <div class="mb-6">
                        <p class="text-sm text-gray-600 whitespace-pre-line">${message}</p>
                    </div>
                    <div class="flex gap-3 justify-end">
                        <button id="confirm-cancel-btn" class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                            ${cancelText}
                        </button>
                        <button id="confirm-ok-btn" class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                            ${okText}
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Thêm modal vào DOM
        document.body.appendChild(modal);
        
        // Animation vào
        setTimeout(() => {
            const modalContent = modal.querySelector('.bg-white');
            modalContent.style.transform = 'scale(1)';
            modalContent.style.opacity = '1';
        }, 10);
        
        // Event listeners
        const okBtn = modal.querySelector('#confirm-ok-btn');
        const cancelBtn = modal.querySelector('#confirm-cancel-btn');
        
        function closeModal(result) {
            const modalContent = modal.querySelector('.bg-white');
            modalContent.style.transform = 'scale(0.95)';
            modalContent.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(modal);
                resolve(result);
            }, 200);
        }
        
        okBtn.addEventListener('click', () => closeModal(true));
        cancelBtn.addEventListener('click', () => closeModal(false));
        
        // Đóng khi click outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(false);
            }
        });
        
        // Focus vào nút OK
        setTimeout(() => {
            okBtn.focus();
        }, 250);
        
        // Handle ESC key
        function handleEsc(e) {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleEsc);
                closeModal(false);
            }
        }
        document.addEventListener('keydown', handleEsc);
    });
}
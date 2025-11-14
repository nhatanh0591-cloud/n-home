/**
 * Reports Module - Báo cáo tài chính
 */

import { 
    db, 
    collection, 
    getDocs, 
    query, 
    where,
    orderBy
} from '../firebase.js';

import { formatMoney } from '../utils.js';

// DOM Elements
const reportsSection = document.getElementById('reports-section');
const reportYearEl = document.getElementById('report-year');
const reportsTableBody = document.getElementById('reports-table-body');

// Category report elements
const categoryReportMonthEl = document.getElementById('category-report-month');
const categoryReportYearEl = document.getElementById('category-report-year');
const categoryReportTableBody = document.getElementById('category-report-table-body');
const categoryTotalIncomeEl = document.getElementById('category-total-income');
const categoryTotalExpenseEl = document.getElementById('category-total-expense');
const categoryTotalProfitEl = document.getElementById('category-total-profit');

// Cache
let transactionsCache = [];

/**
 * Khởi tạo module Reports
 */
export function initReports() {
    if (!reportsSection) return;
    
    // Lắng nghe thay đổi transactions từ store để auto-reload báo cáo
    document.addEventListener('store:transactions:updated', () => {
        console.log('🔄 Store transactions updated - reloading reports...');
        loadReportData();
        setTimeout(() => {
            console.log('🔄 Loading category report after transactions update...');
            loadCategoryReport();
        }, 100);
        // Reload thêm 1 lần nữa để đảm bảo bills cũng đã sync
        setTimeout(() => {
            console.log('🔄 Second reload for sync...');
            loadCategoryReport();
        }, 500);
    });
    
    // Lắng nghe thay đổi bills để báo cáo hạng mục cập nhật real-time
    document.addEventListener('store:bills:updated', () => {
        console.log('🔄 Store bills updated - reloading category report...');
        setTimeout(() => {
            console.log('🔄 Loading category report after bills update...');
            loadCategoryReport();
        }, 100);
    });
    
    setupEventListeners();
    // Set current year as default
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    if (reportYearEl && !reportYearEl.value) {
        reportYearEl.value = currentYear;
    }
    if (categoryReportYearEl && !categoryReportYearEl.value) {
        categoryReportYearEl.value = currentYear;
    }
    if (categoryReportMonthEl && !categoryReportMonthEl.value) {
        categoryReportMonthEl.value = currentMonth;
    }
    
    loadReportData();
    loadCategoryReport();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    reportYearEl?.addEventListener('change', loadReportData);
    categoryReportMonthEl?.addEventListener('change', loadCategoryReport);
    categoryReportYearEl?.addEventListener('change', loadCategoryReport);
}

/**
 * Load report data
 */
export async function loadReportData() {
    try {
        const selectedYear = parseInt(reportYearEl.value);
        
        // Load transactions for the selected year
        const transactionsRef = collection(db, 'transactions');
        const snapshot = await getDocs(transactionsRef);
        
        transactionsCache = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        console.log('=== LOADING REPORT DATA ===');
        console.log('Total transactions:', transactionsCache.length);
        console.log('Selected year:', selectedYear);
        
        // Filter transactions by year - sử dụng logic đơn giản và chính xác
        const yearTransactions = transactionsCache.filter(t => {
            if (!t.date) return false;
            
            let date;
            
            // Xử lý các format khác nhau một cách chính xác
            if (typeof t.date === 'string') {
                // YYYY-MM-DD format (chuẩn từ DB)
                if (/^\d{4}-\d{2}-\d{2}$/.test(t.date)) {
                    const year = parseInt(t.date.split('-')[0]);
                    return year === selectedYear;
                }
                // DD-MM-YYYY format  
                else if (/^\d{2}-\d{2}-\d{4}$/.test(t.date)) {
                    const year = parseInt(t.date.split('-')[2]);
                    return year === selectedYear;
                }
                // Fallback
                else {
                    date = new Date(t.date);
                }
            } else if (t.date.toDate) {
                // Firestore Timestamp
                date = t.date.toDate();
            } else {
                // Date object
                date = new Date(t.date);
            }
            
            // Nếu phải parse Date object thì kiểm tra năm
            if (date) {
                if (isNaN(date.getTime())) return false;
                return date.getFullYear() === selectedYear;
            }
            
            return false;
        });
        
        console.log('Transactions for year', selectedYear + ':', yearTransactions.length);
        
        // Calculate quarterly and monthly data
        const reportData = calculateReportData(yearTransactions);
        
        // Render report
        renderReport(reportData);
        
    } catch (error) {
        console.error('Error loading report data:', error);
    }
}

/**
 * Calculate report data by quarter and month
 */
function calculateReportData(transactions) {
    console.log('=== CALCULATING REPORT DATA ===');
    console.log('Processing', transactions.length, 'transactions');
    
    const quarters = {
        1: { months: [1, 2, 3], revenue: 0, expense: 0, profit: 0, monthlyData: {} },
        2: { months: [4, 5, 6], revenue: 0, expense: 0, profit: 0, monthlyData: {} },
        3: { months: [7, 8, 9], revenue: 0, expense: 0, profit: 0, monthlyData: {} },
        4: { months: [10, 11, 12], revenue: 0, expense: 0, profit: 0, monthlyData: {} }
    };
    
    // Initialize monthly data for each quarter
    for (let q = 1; q <= 4; q++) {
        quarters[q].months.forEach(m => {
            quarters[q].monthlyData[m] = { revenue: 0, expense: 0, profit: 0 };
        });
    }
    
    // Process transactions với logic chính xác
    transactions.forEach(transaction => {
        // Parse date để lấy tháng
        let month;
        
        if (typeof transaction.date === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
                // YYYY-MM-DD format
                month = parseInt(transaction.date.split('-')[1]);
            } else if (/^\d{2}-\d{2}-\d{4}$/.test(transaction.date)) {
                // DD-MM-YYYY format
                month = parseInt(transaction.date.split('-')[1]);
            } else {
                const date = new Date(transaction.date);
                month = date.getMonth() + 1;
            }
        } else if (transaction.date.toDate) {
            // Firestore Timestamp
            const date = transaction.date.toDate();
            month = date.getMonth() + 1;
        } else {
            // Date object
            const date = new Date(transaction.date);
            month = date.getMonth() + 1;
        }
        
        // Tính tổng tiền từ items (structure mới) - CHÍNH XÁC
        let amount = 0;
        if (transaction.items && Array.isArray(transaction.items) && transaction.items.length > 0) {
            amount = transaction.items.reduce((sum, item) => {
                const itemAmount = parseFloat(item.amount) || 0;
                return sum + itemAmount;
            }, 0);
        } else {
            // Fallback về amount cũ (nếu có)
            amount = parseFloat(transaction.amount) || 0;
        }
        
        // Debug log
        console.log(`Transaction "${transaction.title}": Type=${transaction.type}, Month=${month}, Amount=${amount}`);
        
        // Xác định quý
        const quarter = Math.ceil(month / 3);
        
        // Cộng vào tổng theo loại
        if (transaction.type === 'income') {
            quarters[quarter].revenue += amount;
            quarters[quarter].monthlyData[month].revenue += amount;
        } else if (transaction.type === 'expense') {
            quarters[quarter].expense += amount;
            quarters[quarter].monthlyData[month].expense += amount;
        }
    });
    
    // Calculate profits
    for (let q = 1; q <= 4; q++) {
        quarters[q].profit = quarters[q].revenue - quarters[q].expense;
        quarters[q].months.forEach(m => {
            const monthData = quarters[q].monthlyData[m];
            monthData.profit = monthData.revenue - monthData.expense;
        });
    }
    
    // Log tổng kết
    console.log('=== REPORT SUMMARY ===');
    const totalRevenue = quarters[1].revenue + quarters[2].revenue + quarters[3].revenue + quarters[4].revenue;
    const totalExpense = quarters[1].expense + quarters[2].expense + quarters[3].expense + quarters[4].expense;
    console.log('Total Revenue:', totalRevenue, 'Total Expense:', totalExpense, 'Profit:', totalRevenue - totalExpense);
    
    return quarters;
}

/**
 * Render report table
 */
function renderReport(quarters) {
    if (!reportsTableBody) return;
    
    let html = '';
    let totalRevenue = 0;
    let totalExpense = 0;
    let totalProfit = 0;
    
    // Render each quarter
    for (let q = 1; q <= 4; q++) {
        const quarter = quarters[q];
        const monthCount = quarter.months.length;
        
        totalRevenue += quarter.revenue;
        totalExpense += quarter.expense;
        totalProfit += quarter.profit;
        
        // Render each month in the quarter
        quarter.months.forEach((month, monthIndex) => {
            const monthData = quarter.monthlyData[month];
            
            if (monthIndex === 0) {
                // First month row - includes quarter summary with rowspan
                html += `
                    <tr class="border">
                        <td class="py-3 px-4 text-center font-semibold border" rowspan="${monthCount}">${getRomanNumeral(q)}</td>
                        <td class="py-3 px-4 text-right font-semibold border" rowspan="${monthCount}">${formatMoney(quarter.revenue)}</td>
                        <td class="py-3 px-4 text-right font-semibold border" rowspan="${monthCount}">${formatMoney(quarter.expense)}</td>
                        <td class="py-3 px-4 text-right font-semibold border ${quarter.profit >= 0 ? 'text-green-600' : 'text-red-600'}" rowspan="${monthCount}">${formatMoney(quarter.profit)}</td>
                        <td class="py-3 px-4 text-center border">${month}</td>
                        <td class="py-3 px-4 text-right border">${formatMoney(monthData.revenue)}</td>
                        <td class="py-3 px-4 text-right border">${formatMoney(monthData.expense)}</td>
                        <td class="py-3 px-4 text-right border ${monthData.profit >= 0 ? 'text-green-600' : 'text-red-600'}">${formatMoney(monthData.profit)}</td>
                    </tr>
                `;
            } else {
                // Remaining months - only month details (quarter cells are merged from first row)
                html += `
                    <tr class="border">
                        <td class="py-3 px-4 text-center border">${month}</td>
                        <td class="py-3 px-4 text-right border">${formatMoney(monthData.revenue)}</td>
                        <td class="py-3 px-4 text-right border">${formatMoney(monthData.expense)}</td>
                        <td class="py-3 px-4 text-right border ${monthData.profit >= 0 ? 'text-green-600' : 'text-red-600'}">${formatMoney(monthData.profit)}</td>
                    </tr>
                `;
            }
        });
    }
    
    // Total row
    html += `
        <tr class="border bg-gray-100">
            <td class="py-3 px-4 text-center font-bold border">Tổng</td>
            <td class="py-3 px-4 text-right font-bold border">${formatMoney(totalRevenue)}</td>
            <td class="py-3 px-4 text-right font-bold border">${formatMoney(totalExpense)}</td>
            <td class="py-3 px-4 text-right font-bold border ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}">${formatMoney(totalProfit)}</td>
            <td class="py-3 px-4 text-center font-bold border">Cả năm</td>
            <td class="py-3 px-4 text-right font-bold border">${formatMoney(totalRevenue)}</td>
            <td class="py-3 px-4 text-right font-bold border">${formatMoney(totalExpense)}</td>
            <td class="py-3 px-4 text-right font-bold border ${totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}">${formatMoney(totalProfit)}</td>
        </tr>
    `;
    
    reportsTableBody.innerHTML = html;
    
    // Render mobile cards
    renderQuarterlyReportMobileCards(quarters);
}

/**
 * Get Roman numeral for quarter
 */
function getRomanNumeral(num) {
    const numerals = ['I', 'II', 'III', 'IV'];
    return numerals[num - 1] || num;
}

/**
 * Load category report data
 */
async function loadCategoryReport() {
    try {
        const selectedMonth = categoryReportMonthEl?.value || 'all';
        const selectedYear = parseInt(categoryReportYearEl?.value) || new Date().getFullYear();

        console.log('Loading category report for:', { selectedMonth, selectedYear });
        console.log('🔄 Loading fresh data from Firebase...');

        // Load trực tiếp từ Firebase
        const transactionsRef = collection(db, 'transactions');
        const transactionsSnapshot = await getDocs(transactionsRef);
        const transactions = transactionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const billsRef = collection(db, 'bills');
        const billsSnapshot = await getDocs(billsRef);
        const bills = billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Load transaction categories từ Firebase
        const categoriesRef = collection(db, 'transactionCategories');
        const categoriesSnapshot = await getDocs(categoriesRef);
        const categories = categoriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        console.log('💾 Loaded data:', { 
            transactions: transactions.length, 
            bills: bills.length, 
            categories: categories.length 
        });

        // Filter transactions by selected period
        const filteredTransactions = transactions.filter(t => {
            if (!t.date || !t.approved) return false;

            const transactionDate = new Date(t.date);
            const transactionYear = transactionDate.getFullYear();
            const transactionMonth = transactionDate.getMonth() + 1;

            if (transactionYear !== selectedYear) return false;
            if (selectedMonth !== 'all' && transactionMonth !== parseInt(selectedMonth)) return false;

            return true;
        });

        // Filter bills theo nhiều cách xác định tháng
        const filteredBills = bills.filter(bill => {
            if (bill.status !== 'paid') return false;
            
            // DEBUG: In ra tất cả field của bill để xem
            console.log('🔍 BILL ID:', bill.id);
            console.log('📋 ALL BILL FIELDS:', JSON.stringify(bill, null, 2));
            
            let billMonth = null;
            let billYear = null;
            
            // Cách 1: billMonth/billYear trực tiếp
            if (bill.billMonth && bill.billYear) {
                billMonth = parseInt(bill.billMonth);
                billYear = parseInt(bill.billYear);
                console.log('✅ Found via billMonth/billYear:', billMonth, billYear);
            }
            // Cách 2: period + year (CHÍNH LÀ FIELD NÀY!)
            else if (bill.period && bill.year) {
                billMonth = parseInt(bill.period);
                billYear = parseInt(bill.year);
                console.log('✅ Found via period/year:', billMonth, billYear);
            }
            // Cách 3: period string (VD: "Tháng 10", "10/2025")
            else if (bill.period && typeof bill.period === 'string') {
                const periodStr = bill.period.toString().toLowerCase();
                console.log('🔍 Checking period string:', periodStr);
                
                // Pattern "tháng X"
                const monthMatch = periodStr.match(/tháng\s*(\d{1,2})/);
                if (monthMatch) {
                    billMonth = parseInt(monthMatch[1]);
                    billYear = selectedYear;
                    console.log('✅ Found via period tháng:', billMonth, billYear);
                }
                // Pattern "X/YYYY" hoặc "XX/YYYY"
                else {
                    const dateMatch = periodStr.match(/(\d{1,2})\/(\d{4})/);
                    if (dateMatch) {
                        billMonth = parseInt(dateMatch[1]);
                        billYear = parseInt(dateMatch[2]);
                        console.log('✅ Found via period date:', billMonth, billYear);
                    }
                }
            }
            
            // Nếu có tháng/năm thì check match
            if (billMonth && billYear) {
                console.log('🎯 Final check:', { billMonth, billYear, selectedMonth, selectedYear });
                if (billYear !== selectedYear) return false;
                if (selectedMonth !== 'all' && billMonth !== parseInt(selectedMonth)) return false;
                console.log('✅ BILL MATCHED!');
                return true;
            }
            
            console.log('❌ No month/year found for bill');
            return false;
        });

        console.log('Filtered transactions:', filteredTransactions.length);
        console.log('Filtered paid bills:', filteredBills.length);

        // Calculate totals by category
        const categoryTotals = {};
        let totalIncome = 0;
        let totalExpense = 0;

        // Initialize all categories (để luôn hiển thị dù chưa có transaction)
        categories.forEach(category => {
            categoryTotals[category.id] = {
                name: category.name,
                income: 0,
                expense: 0,
                profit: 0
            };
        });

        // Process transactions
        filteredTransactions.forEach(transaction => {
            if (!transaction.items) return;

            transaction.items.forEach(item => {
                if (!item.categoryId || !item.amount) return;

                const amount = parseFloat(item.amount) || 0;

                if (!categoryTotals[item.categoryId]) {
                    categoryTotals[item.categoryId] = {
                        name: `Unknown Category (${item.categoryId})`,
                        income: 0,
                        expense: 0,
                        profit: 0
                    };
                }

                if (transaction.type === 'income') {
                    categoryTotals[item.categoryId].income += amount;
                    totalIncome += amount;
                } else if (transaction.type === 'expense') {
                    categoryTotals[item.categoryId].expense += amount;
                    totalExpense += amount;
                }

                categoryTotals[item.categoryId].profit = 
                    categoryTotals[item.categoryId].income - categoryTotals[item.categoryId].expense;
            });
        });

        // 💡 TÍNH TIỀN ĐIỆN/NƯỚC/NHÀ TỪ HÓA ĐƠN ĐÃ THANH TOÁN VÀ CỘNG VÀO HẠNG MỤC
        let totalElectricity = 0;
        let totalWater = 0;
        let totalHouse = 0;

        filteredBills.forEach(bill => {
            if (!bill.services || !Array.isArray(bill.services)) return;
            
            bill.services.forEach(service => {
                if (!service.amount) return;
                const amount = parseFloat(service.amount) || 0;
                
                // Kiểm tra loại dịch vụ (có thể là serviceId hoặc tên service)
                const serviceName = (service.serviceName || service.name || '').toLowerCase();
                const serviceId = service.serviceId || '';
                
                // Tìm dịch vụ điện (có thể có nhiều cách đặt tên)
                if (serviceName.includes('điện') || serviceName.includes('electric') || 
                    serviceId.includes('electric') || serviceId.includes('dien')) {
                    totalElectricity += amount;
                }
                // Tìm dịch vụ nước (có thể có nhiều cách đặt tên)  
                else if (serviceName.includes('nước') || serviceName.includes('water') ||
                         serviceName.includes('nuoc') || serviceId.includes('water') || 
                         serviceId.includes('nuoc')) {
                    totalWater += amount;
                }
                // Tìm dịch vụ tiền nhà (có thể có nhiều cách đặt tên)
                else if (serviceName.includes('tiền nhà') || serviceName.includes('nhà') || 
                         serviceName.includes('house') || serviceName.includes('rent') ||
                         serviceId.includes('house') || serviceId.includes('rent')) {
                    totalHouse += amount;
                }
            });
        });

        // TÌM VÀ CỘNG VÀO HẠNG MỤC "TIỀN ĐIỆN", "TIỀN NƯỚC", VÀ "TIỀN NHÀ" CÓ SẴN
        categories.forEach(category => {
            const categoryName = category.name.toLowerCase();
            
            // Đảm bảo hạng mục luôn được khởi tạo (dù chưa có transaction)
            if (!categoryTotals[category.id]) {
                categoryTotals[category.id] = {
                    name: category.name,
                    income: 0,
                    expense: 0,
                    profit: 0
                };
            }
            
            // Cộng tiền điện vào hạng mục "Tiền điện"
            if ((categoryName.includes('tiền điện') || categoryName.includes('điện')) && totalElectricity > 0) {
                categoryTotals[category.id].income += totalElectricity;
                categoryTotals[category.id].profit = categoryTotals[category.id].income - categoryTotals[category.id].expense;
            }
            
            // Cộng tiền nước vào hạng mục "Tiền nước"  
            if ((categoryName.includes('tiền nước') || categoryName.includes('nước')) && totalWater > 0) {
                categoryTotals[category.id].income += totalWater;
                categoryTotals[category.id].profit = categoryTotals[category.id].income - categoryTotals[category.id].expense;
            }
            
            // Cộng tiền nhà vào hạng mục "Tiền nhà"
            if ((categoryName.includes('tiền nhà') || categoryName.includes('nhà')) && totalHouse > 0) {
                categoryTotals[category.id].income += totalHouse;
                categoryTotals[category.id].profit = categoryTotals[category.id].income - categoryTotals[category.id].expense;
            }
        });

        // Render table (không có hạng mục đặc biệt nữa)
        renderCategoryReport(categoryTotals);

    } catch (error) {
        console.error('Error loading category report:', error);
        if (categoryReportTableBody) {
            categoryReportTableBody.innerHTML = '<tr><td colspan="4" class="py-4 px-4 text-center text-red-500">Lỗi tải dữ liệu báo cáo</td></tr>';
        }
    }
}

/**
 * Render category report table
 */
function renderCategoryReport(categoryTotals) {
    if (!categoryReportTableBody) return;

    let html = '';
    
    // Lấy các hạng mục có hoạt động và bỏ "Tiền hóa đơn"
    const activeCategories = Object.values(categoryTotals)
        .filter(cat => {
            // Bỏ hạng mục "Tiền hóa đơn" 
            const categoryName = cat.name.toLowerCase();
            if (categoryName.includes('tiền hóa đơn') || categoryName.includes('hóa đơn')) {
                return false;
            }
            return cat.income > 0 || cat.expense > 0;
        });

    // Sắp xếp: các hạng mục ưu tiên lên đầu, còn lại theo profit
    const priorityOrder = ['tiền nhà', 'tiền điện', 'tiền nước', 'chi phí cố định', 'tiền vệ sinh'];
    
    activeCategories.sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        
        // Tìm vị trí trong danh sách ưu tiên
        const priorityA = priorityOrder.findIndex(p => nameA.includes(p));
        const priorityB = priorityOrder.findIndex(p => nameB.includes(p));
        
        // Nếu cả 2 đều có ưu tiên → sắp xếp theo thứ tự ưu tiên
        if (priorityA !== -1 && priorityB !== -1) {
            return priorityA - priorityB;
        }
        
        // Nếu chỉ A có ưu tiên → A lên trước
        if (priorityA !== -1 && priorityB === -1) {
            return -1;
        }
        
        // Nếu chỉ B có ưu tiên → B lên trước  
        if (priorityA === -1 && priorityB !== -1) {
            return 1;
        }
        
        // Nếu cả 2 đều không có ưu tiên → sắp xếp theo profit
        return b.profit - a.profit;
    });

    if (activeCategories.length === 0) {
        html = '<tr><td colspan="4" class="py-4 px-4 text-center text-gray-500">Không có dữ liệu trong khoảng thời gian đã chọn</td></tr>';
    } else {
        // THÊM HEADER (giống như báo cáo tháng/quý)
        html += `
            <tr class="border bg-gray-100">
                <td class="py-3 px-4 font-bold border">Tên hạng mục</td>
                <td class="py-3 px-4 text-right font-bold border">Tổng thu</td>
                <td class="py-3 px-4 text-right font-bold border">Tổng chi</td>
                <td class="py-3 px-4 text-right font-bold border">Lãi/Lỗ</td>
            </tr>
        `;

        // NỘI DUNG (màu trắng)
        activeCategories.forEach(category => {
            const profitClass = category.profit >= 0 ? 'text-green-600' : 'text-red-600';
            
            html += `
                <tr class="border bg-white">
                    <td class="py-3 px-4 border">${category.name}</td>
                    <td class="py-3 px-4 text-right border text-green-600">${formatMoney(category.income)}</td>
                    <td class="py-3 px-4 text-right border text-red-600">${formatMoney(category.expense)}</td>
                    <td class="py-3 px-4 text-right border ${profitClass}">${formatMoney(category.profit)}</td>
                </tr>
            `;
        });
    }

    categoryReportTableBody.innerHTML = html;
    
    // Render mobile cards
    renderCategoryReportMobileCards(activeCategories);

    // ẨN PHẦN TỔNG CỘNG (tfoot)
    const categoryTable = categoryReportTableBody.closest('table');
    const tfoot = categoryTable?.querySelector('tfoot');
    if (tfoot) {
        tfoot.style.display = 'none';
    }

    // XÓA PHẦN HIỂN THỊ TỔNG CỘNG (vì đây là báo cáo từng hạng mục, không phải tổng tiền)
    if (categoryTotalIncomeEl) categoryTotalIncomeEl.textContent = '';
    if (categoryTotalExpenseEl) categoryTotalExpenseEl.textContent = '';
    if (categoryTotalProfitEl) categoryTotalProfitEl.textContent = '';
}

/**
 * Render mobile cards for category report
 */
function renderCategoryReportMobileCards(categories) {
    const mobileContainer = document.getElementById('category-report-mobile-cards');
    if (!mobileContainer) return;
    
    if (categories.length === 0) {
        mobileContainer.innerHTML = '<div class="text-center py-8 text-gray-500">Không có dữ liệu trong khoảng thời gian đã chọn</div>';
        return;
    }
    
    let html = '';
    
    categories.forEach(category => {
        const profitClass = category.profit >= 0 ? 'text-green-600' : 'text-red-600';
        const profitIcon = category.profit >= 0 ? '↑' : '↓';
        
        html += `
            <div class="bg-white border rounded-lg p-4 shadow-sm">
                <h4 class="font-semibold text-gray-800 mb-3">${category.name}</h4>
                <div class="grid grid-cols-2 gap-3">
                    <div class="text-center">
                        <div class="text-sm text-gray-600">Tổng thu</div>
                        <div class="text-lg font-semibold text-green-600">${formatMoney(category.income)}</div>
                    </div>
                    <div class="text-center">
                        <div class="text-sm text-gray-600">Tổng chi</div>
                        <div class="text-lg font-semibold text-red-600">${formatMoney(category.expense)}</div>
                    </div>
                </div>
                <div class="mt-3 pt-3 border-t text-center">
                    <div class="text-sm text-gray-600">Lãi/Lỗ</div>
                    <div class="text-xl font-bold ${profitClass}">
                        ${profitIcon} ${formatMoney(Math.abs(category.profit))}
                    </div>
                </div>
            </div>
        `;
    });
    
    mobileContainer.innerHTML = html;
}

/**
 * Render mobile cards for quarterly report
 */
function renderQuarterlyReportMobileCards(reportData) {
    const mobileContainer = document.getElementById('quarterly-report-mobile-cards');
    if (!mobileContainer) return;
    
    let html = '';
    
    for (let q = 1; q <= 4; q++) {
        const quarter = reportData[q];
        const profitClass = quarter.profit >= 0 ? 'text-green-600' : 'text-red-600';
        const profitIcon = quarter.profit >= 0 ? '↑' : '↓';
        
        html += `
            <div class="bg-white border rounded-lg p-4 shadow-sm">
                <h4 class="font-semibold text-gray-800 mb-3 text-center">QUÝ ${getRomanNumeral(q)}</h4>
                <div class="grid grid-cols-3 gap-2 mb-4">
                    <div class="text-center">
                        <div class="text-xs text-gray-600">Doanh thu</div>
                        <div class="text-sm font-semibold text-green-600">${formatMoney(quarter.revenue)}</div>
                    </div>
                    <div class="text-center">
                        <div class="text-xs text-gray-600">Chi phí</div>
                        <div class="text-sm font-semibold text-red-600">${formatMoney(quarter.expense)}</div>
                    </div>
                    <div class="text-center">
                        <div class="text-xs text-gray-600">Lợi nhuận</div>
                        <div class="text-sm font-bold ${profitClass}">${profitIcon} ${formatMoney(Math.abs(quarter.profit))}</div>
                    </div>
                </div>
                
                <div class="space-y-2">
                    <div class="text-sm font-medium text-gray-700">Chi tiết theo tháng:</div>`;
        
        quarter.months.forEach(month => {
            const monthData = quarter.monthlyData[month];
            const monthProfitClass = monthData.profit >= 0 ? 'text-green-600' : 'text-red-600';
            
            html += `
                    <div class="bg-gray-50 rounded p-2">
                        <div class="text-xs text-gray-600 mb-1">Tháng ${month}</div>
                        <div class="grid grid-cols-3 gap-1 text-xs">
                            <span class="text-green-600">${formatMoney(monthData.revenue)}</span>
                            <span class="text-red-600">${formatMoney(monthData.expense)}</span>
                            <span class="${monthProfitClass}">${formatMoney(monthData.profit)}</span>
                        </div>
                    </div>`;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    mobileContainer.innerHTML = html;
}

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

// Cache
let transactionsCache = [];

/**
 * Khởi tạo module Reports
 */
export function initReports() {
    if (!reportsSection) return;
    
    setupEventListeners();
    // Set current year as default
    const currentYear = new Date().getFullYear();
    if (reportYearEl && !reportYearEl.value) {
        reportYearEl.value = currentYear;
    }
    loadReportData();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    reportYearEl?.addEventListener('change', loadReportData);
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
}

/**
 * Get Roman numeral for quarter
 */
function getRomanNumeral(num) {
    const numerals = ['I', 'II', 'III', 'IV'];
    return numerals[num - 1] || num;
}

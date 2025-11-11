// js/modules/dashboard.js

/**
 * Dashboard Module - Quản lý bảng tin tổng quan
 */

import { 
    getBuildings, 
    getContracts, 
    getCustomers, 
    getBills, 
    getTransactions, 
    getTasks 
} from '../store.js';
import { formatCurrency } from '../utils.js';

// Cache DOM elements
const dashboardSection = document.getElementById('dashboard-section');

/**
 * Initialize dashboard module
 */
export function initDashboard() {
    if (!dashboardSection) return;
    
    console.log('Dashboard initialized');
    
    // Listen for store ready event to load data
    document.addEventListener('store:ready', () => {
        console.log('Dashboard: Store ready, loading data...');
        loadDashboardData();
    });
}

/**
 * Load và hiển thị dữ liệu dashboard
 */
export function loadDashboard() {
    console.log('Dashboard: Loading dashboard...');
    loadDashboardData();
}

export function loadDashboardData() {
    if (!dashboardSection) return;
    
    console.log('Loading dashboard data...');
    
    // Kiểm tra xem store đã có dữ liệu chưa
    const buildings = getBuildings();
    const contracts = getContracts();
    const customers = getCustomers();
    
    // Nếu store chưa khởi tạo (return null/undefined), hiển thị loading
    if (buildings === null || buildings === undefined) {
        console.log('Dashboard: Store chưa khởi tạo, hiển thị loading...');
        renderLoadingDashboard();
        
        // Lắng nghe store ready event với timeout
        const handleStoreReady = () => {
            console.log('Dashboard: Store ready! Loading data now...');
            loadDashboardDataWithStats();
            document.removeEventListener('store:ready', handleStoreReady);
        };
        
        document.addEventListener('store:ready', handleStoreReady);
        
        // Fallback: Nếu sau 5 giây vẫn không có event, load dashboard với dữ liệu rỗng
        setTimeout(() => {
            console.log('Dashboard: Timeout, loading with empty data...');
            document.removeEventListener('store:ready', handleStoreReady);
            loadDashboardDataWithStats();
        }, 5000);
        
        return;
    }
    
    // Store đã ready (có thể rỗng hoặc có dữ liệu), load ngay
    console.log('Dashboard: Store ready, loading with data...');
    loadDashboardDataWithStats();
}

function loadDashboardDataWithStats() {
    // Lấy tháng hiện tại
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYear = now.getFullYear();
    
    // Tính toán các thống kê
    const buildingStats = calculateBuildingStats();
    const contractStats = calculateContractStats();
    const customerStats = calculateCustomerStats();
    const billStats = calculateBillStats(currentMonth, currentYear);
    const transactionStats = calculateTransactionStats(currentMonth, currentYear);
    const taskStats = calculateTaskStats(currentMonth, currentYear);
    
    // Render dashboard
    renderDashboard({
        buildings: buildingStats,
        contracts: contractStats,
        customers: customerStats,
        bills: billStats,
        transactions: transactionStats,
        tasks: taskStats,
        currentMonth,
        currentYear
    });
}

function renderLoadingDashboard() {
    if (!dashboardSection) return;
    
    dashboardSection.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            <div class="bg-white p-6 rounded-lg shadow-md animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div class="h-8 bg-gray-200 rounded w-1/4"></div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-md animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div class="h-8 bg-gray-200 rounded w-1/4"></div>
            </div>
            <div class="bg-white p-6 rounded-lg shadow-md animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div class="h-8 bg-gray-200 rounded w-1/4"></div>
            </div>
        </div>
        <div class="text-center text-gray-500 py-8">
            <div class="animate-spin inline-block w-8 h-8 border-4 border-current border-t-transparent text-blue-600 rounded-full mb-4"></div>
            <p>Đang tải dữ liệu dashboard...</p>
        </div>
    `;
}

/**
 * Tính toán thống kê tòa nhà
 */
function calculateBuildingStats() {
    const buildings = getBuildings();
    
    const total = buildings.length;
    const active = buildings.filter(b => b.isActive !== false).length;
    const inactive = buildings.filter(b => b.isActive === false).length;
    
    return { total, active, inactive };
}

/**
 * Tính toán thống kê hợp đồng
 */
function calculateContractStats() {
    const contracts = getContracts();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const total = contracts.length;
    const active = contracts.filter(c => {
        return c.status === 'active' || 
               c.status === 'đang thuê' ||
               c.status === 'Đang thuê' ||
               c.isActive === true ||
               (!c.status && !c.hasOwnProperty('status'));
    }).length;
    
    // Hợp đồng sắp hết hạn (trong 30 ngày tới)
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(today.getDate() + 30);
    
    const expiring = contracts.filter(contract => {
        if (contract.status !== 'active' || !contract.endDate) return false;
        
        let contractEndDate;
        if (typeof contract.endDate === 'string') {
            contractEndDate = new Date(contract.endDate);
        } else if (contract.endDate.toDate) {
            contractEndDate = contract.endDate.toDate();
        } else {
            contractEndDate = new Date(contract.endDate);
        }
        
        return contractEndDate >= today && contractEndDate <= thirtyDaysLater;
    }).length;
    
    // Hợp đồng quá hạn
    const expired = contracts.filter(contract => {
        if (contract.status !== 'active' || !contract.endDate) return false;
        
        let contractEndDate;
        if (typeof contract.endDate === 'string') {
            contractEndDate = new Date(contract.endDate);
        } else if (contract.endDate.toDate) {
            contractEndDate = contract.endDate.toDate();
        } else {
            contractEndDate = new Date(contract.endDate);
        }
        
        return contractEndDate < today;
    }).length;
    
    const terminated = contracts.filter(c => c.status === 'terminated').length;
    
    return { total, active, expiring, expired, terminated };
}

/**
 * Tính toán thống kê khách hàng
 */
function calculateCustomerStats() {
    const customers = getCustomers();
    
    const total = customers.length;
    const current = customers.filter(c => {
        return c.status === 'active' || 
               c.status === 'đang ở' ||
               c.status === 'Đang ở' ||
               c.isActive === true ||
               (!c.status && !c.hasOwnProperty('status'));
    }).length;
    
    const movedOut = customers.filter(c => {
        return c.status === 'moved_out' || 
               c.status === 'đã chuyển đi' ||
               c.status === 'Đã chuyển đi' ||
               c.status === 'inactive';
    }).length;
    
    return { total, current, movedOut };
}

/**
 * Tính toán thống kê hóa đơn theo tháng
 */
function calculateBillStats(month, year) {
    const bills = getBills();
    
    // Lọc hóa đơn theo tháng hiện tại - sử dụng field period
    const currentMonthBills = bills.filter(bill => {
        return parseInt(bill.period) === month;
    });
    
    const totalAmount = currentMonthBills.reduce((sum, bill) => {
        const amount = bill.totalAmount || 0;
        return sum + amount;
    }, 0);
    
    const paidBills = currentMonthBills.filter(bill => bill.status === 'paid');
    const paidAmount = paidBills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
    
    const unpaidBills = currentMonthBills.filter(bill => bill.status !== 'paid');
    const unpaidAmount = unpaidBills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);
    
    return {
        totalAmount,
        paidAmount,
        unpaidAmount,
        count: currentMonthBills.length,
        paidCount: paidBills.length,
        unpaidCount: unpaidBills.length
    };
}

/**
 * Tính toán thống kê giao dịch theo tháng
 */
function calculateTransactionStats(month, year) {
    const transactions = getTransactions();
    
    // Lọc giao dịch theo tháng hiện tại
    const currentMonthTransactions = transactions.filter(transaction => {
        if (!transaction.date) return false;
        
        let transactionMonth, transactionYear;
        
        if (typeof transaction.date === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
                // YYYY-MM-DD
                const [y, m] = transaction.date.split('-');
                transactionYear = parseInt(y);
                transactionMonth = parseInt(m);
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(transaction.date)) {
                // DD/MM/YYYY
                const [d, m, y] = transaction.date.split('/');
                transactionYear = parseInt(y);
                transactionMonth = parseInt(m);
            }
        } else if (transaction.date.toDate) {
            // Firestore Timestamp
            const date = transaction.date.toDate();
            transactionMonth = date.getMonth() + 1;
            transactionYear = date.getFullYear();
        }
        
        return transactionMonth === month && transactionYear === year;
    });
    
    const totalIncome = currentMonthTransactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => {
            const itemTotal = t.items && t.items.length > 0 
                ? t.items.reduce((s, item) => s + (item.amount || 0), 0) 
                : 0;
            return sum + itemTotal;
        }, 0);
    
    const totalExpense = currentMonthTransactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => {
            const itemTotal = t.items && t.items.length > 0 
                ? t.items.reduce((s, item) => s + (item.amount || 0), 0) 
                : 0;
            return sum + itemTotal;
        }, 0);
    
    const profit = totalIncome - totalExpense;
    
    return {
        totalIncome,
        totalExpense,
        profit,
        count: currentMonthTransactions.length
    };
}

/**
 * Tính toán thống kê công việc
 */
function calculateTaskStats(month, year) {
    const tasks = getTasks();
    
    // Helper function để parse date
    function parseDateInput(dateInput) {
        if (!dateInput) return null;
        
        let date;
        if (typeof dateInput === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                date = new Date(dateInput + 'T00:00:00');
            } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateInput)) {
                const [day, month, year] = dateInput.split('/');
                date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            } else {
                date = new Date(dateInput);
            }
        } else if (dateInput.toDate) {
            date = dateInput.toDate();
        } else {
            date = new Date(dateInput);
        }
        
        return isNaN(date.getTime()) ? null : date;
    }
    
    // Lọc task đang pending
    const pendingTasks = tasks.filter(task => task.status === 'pending' || task.status === 'in_progress');
    
    // Task quá hạn
    const overdueTasks = pendingTasks.filter(task => {
        const dueDate = parseDateInput(task.dueDate);
        if (!dueDate) return false;
        
        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today
        return dueDate < today;
    });
    
    // Task hoàn thành trong tháng hiện tại
    const completedThisMonth = tasks.filter(task => {
        if (task.status !== 'completed' || !task.completedDate) return false;
        
        const completedDate = parseDateInput(task.completedDate);
        if (!completedDate) return false;
        
        return completedDate.getMonth() + 1 === month && 
               completedDate.getFullYear() === year;
    });
    
    return {
        pending: pendingTasks.length,
        overdue: overdueTasks.length,
        completed: completedThisMonth.length
    };
}

/**
 * Render dashboard UI - Update các element có sẵn
 */
function renderDashboard(data) {
    const { buildings, contracts, customers, bills, transactions, tasks } = data;
    
    // Update building statistics
    const totalBuildings = document.getElementById('dash-total-buildings');
    const activeBuildings = document.getElementById('dash-active-buildings');
    const inactiveBuildings = document.getElementById('dash-inactive-buildings');
    
    if (totalBuildings) totalBuildings.textContent = buildings.total;
    if (activeBuildings) activeBuildings.textContent = buildings.active;
    if (inactiveBuildings) inactiveBuildings.textContent = buildings.inactive;
    
    // Update contract statistics  
    const totalContracts = document.getElementById('dash-total-contracts');
    const activeContracts = document.getElementById('dash-active-contracts');
    const expiringContracts = document.getElementById('dash-expiring-contracts');
    const expiredContracts = document.getElementById('dash-expired-contracts');
    const terminatedContracts = document.getElementById('dash-terminated-contracts');
    
    if (totalContracts) totalContracts.textContent = contracts.total;
    if (activeContracts) activeContracts.textContent = contracts.active;
    if (expiringContracts) expiringContracts.textContent = contracts.expiring;
    if (expiredContracts) expiredContracts.textContent = contracts.expired;
    if (terminatedContracts) terminatedContracts.textContent = contracts.terminated;
    
    // Update customer statistics
    const totalCustomers = document.getElementById('dash-total-customers');
    const currentCustomers = document.getElementById('dash-current-customers');
    const movedCustomers = document.getElementById('dash-moved-customers');
    
    if (totalCustomers) totalCustomers.textContent = customers.total;
    if (currentCustomers) currentCustomers.textContent = customers.current;
    if (movedCustomers) movedCustomers.textContent = customers.movedOut;
    
    // Update bill statistics
    const paidBillsAmount = document.getElementById('dash-paid-bills-amount');
    const unpaidBillsAmount = document.getElementById('dash-unpaid-bills-amount');
    const totalBillsAmount = document.getElementById('dash-total-bills-amount');
    
    if (paidBillsAmount) paidBillsAmount.textContent = formatCurrency(bills.paidAmount);
    if (unpaidBillsAmount) unpaidBillsAmount.textContent = formatCurrency(bills.unpaidAmount);
    if (totalBillsAmount) totalBillsAmount.textContent = formatCurrency(bills.totalAmount);
    
    // Update transaction statistics
    const totalIncome = document.getElementById('dash-total-income');
    const totalExpense = document.getElementById('dash-total-expense');
    const totalProfit = document.getElementById('dash-total-profit');
    
    if (totalIncome) totalIncome.textContent = formatCurrency(transactions.totalIncome);
    if (totalExpense) totalExpense.textContent = formatCurrency(transactions.totalExpense);
    if (totalProfit) {
        totalProfit.textContent = formatCurrency(transactions.profit);
        totalProfit.className = transactions.profit >= 0 ? 'font-bold text-green-600' : 'font-bold text-red-600';
    }
    
    // Update task statistics
    const pendingTasks = document.getElementById('dash-pending-tasks');
    const overdueTasks = document.getElementById('dash-overdue-tasks');
    const completedTasks = document.getElementById('dash-completed-tasks-month');
    
    if (pendingTasks) pendingTasks.textContent = tasks.pending;
    if (overdueTasks) overdueTasks.textContent = tasks.overdue;
    if (completedTasks) completedTasks.textContent = tasks.completed || 0;
    

}
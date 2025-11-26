/**
 * Custom Calendar Component
 * Provides a Vietnamese monthly calendar with left/right navigation
 */

class CustomCalendar {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.selectedDate = options.selectedDate || new Date();
        this.onDateSelect = options.onDateSelect || (() => {});
        this.currentMonth = this.selectedDate.getMonth();
        this.currentYear = this.selectedDate.getFullYear();
        this.isDropdown = options.isDropdown || false;
        
        // Vietnamese month names
        this.monthNames = [
            'Tháng một', 'Tháng hai', 'Tháng ba', 'Tháng tư', 'Tháng năm', 'Tháng sáu',
            'Tháng bảy', 'Tháng tám', 'Tháng chín', 'Tháng mười', 'Tháng mười một', 'Tháng mười hai'
        ];
        
        // Vietnamese day names
        this.dayNames = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        
        this.init();
    }
    
    init() {
        if (!this.container) {
            console.error('Calendar container not found');
            return;
        }
        
        this.render();
        this.attachEventListeners();
        
        // Debug log
        console.log('Calendar initialized with navigation buttons');
    }
    
    render() {
        const wrapperClass = this.isDropdown ? 'custom-calendar-wrapper dropdown-calendar' : 'custom-calendar-wrapper';
        const html = `
            <div class="${wrapperClass}">
                <div class="custom-calendar-header">
                    <button type="button" class="calendar-nav-btn calendar-prev" data-action="prev" aria-label="Tháng trước">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M15 18l-6-6 6-6"/>
                        </svg>
                    </button>
                    
                    <div class="calendar-title">
                        <h3 class="calendar-month">${this.monthNames[this.currentMonth]}</h3>
                        <div class="calendar-year">${this.currentYear}</div>
                    </div>
                    
                    <button type="button" class="calendar-nav-btn calendar-next" data-action="next" aria-label="Tháng sau">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 18l6-6-6-6"/>
                        </svg>
                    </button>
                </div>
                
                <div class="custom-calendar-grid">
                    <div class="calendar-day-headers">
                        ${this.dayNames.map(day => `<div class="calendar-day-header">${day}</div>`).join('')}
                    </div>
                    <div class="calendar-dates">
                        ${this.generateCalendarDates()}
                    </div>
                </div>
            </div>
        `;
        
        this.container.innerHTML = html;
    }
    
    generateCalendarDates() {
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        const startDate = new Date(firstDay);
        
        // Adjust to Monday start (Vietnamese calendar typically starts on Monday)
        const dayOfWeek = (firstDay.getDay() + 6) % 7; // Convert Sunday=0 to Monday=0
        startDate.setDate(firstDay.getDate() - dayOfWeek);
        
        const dates = [];
        const today = new Date();
        const selectedDateStr = this.formatDateString(this.selectedDate);
        
        // Generate 6 weeks (42 days) to cover all possible month layouts
        for (let i = 0; i < 42; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            
            const isCurrentMonth = date.getMonth() === this.currentMonth;
            const isToday = this.isSameDate(date, today);
            const isSelected = this.formatDateString(date) === selectedDateStr;
            const isPreviousMonth = date.getMonth() < this.currentMonth || 
                                   (this.currentMonth === 0 && date.getMonth() === 11);
            const isNextMonth = date.getMonth() > this.currentMonth ||
                               (this.currentMonth === 11 && date.getMonth() === 0);
            
            let className = 'calendar-date';
            if (!isCurrentMonth) className += ' calendar-date-other-month';
            if (isToday) className += ' calendar-date-today';
            if (isSelected) className += ' calendar-date-selected';
            
            dates.push(`
                <button type="button" class="${className}" data-date="${this.formatDateString(date)}">
                    ${date.getDate()}
                </button>
            `);
        }
        
        return dates.join('');
    }
    
    attachEventListeners() {
        // Remove old listener if exists to prevent duplicates
        if (this._clickHandler) {
            this.container.removeEventListener('click', this._clickHandler);
        }
        
        // Create new handler and store reference
        this._clickHandler = (e) => {
            e.stopPropagation();
            
            const target = e.target.closest('button, .calendar-date');
            if (!target) return;
            
            // Handle navigation buttons
            if (target.classList.contains('calendar-prev') || target.dataset.action === 'prev') {
                e.preventDefault();
                this.previousMonth();
                return;
            }
            
            if (target.classList.contains('calendar-next') || target.dataset.action === 'next') {
                e.preventDefault();
                this.nextMonth();
                return;
            }
            
            // Handle date selection
            if (target.classList.contains('calendar-date')) {
                const dateStr = target.dataset.date;
                if (dateStr) {
                    this.selectDate(dateStr);
                }
            }
        };
        
        // Add new listener
        this.container.addEventListener('click', this._clickHandler);
    }
    
    previousMonth() {
        if (this.currentMonth === 0) {
            this.currentMonth = 11;
            this.currentYear--;
        } else {
            this.currentMonth--;
        }
        this.render();
        this.attachEventListeners();
    }
    
    nextMonth() {
        if (this.currentMonth === 11) {
            this.currentMonth = 0;
            this.currentYear++;
        } else {
            this.currentMonth++;
        }
        this.render();
        this.attachEventListeners();
    }
    
    selectDate(dateStr) {
        // Parse date string (dd-mm-yyyy)
        const [day, month, year] = dateStr.split('-').map(num => parseInt(num));
        this.selectedDate = new Date(year, month - 1, day);
        
        // Update visual selection
        this.container.querySelectorAll('.calendar-date').forEach(btn => {
            btn.classList.remove('calendar-date-selected');
        });
        
        const selectedBtn = this.container.querySelector(`[data-date="${dateStr}"]`);
        if (selectedBtn) {
            selectedBtn.classList.add('calendar-date-selected');
        }
        
        // Call callback
        this.onDateSelect(this.selectedDate, dateStr);
    }
    
    formatDateString(date) {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }
    
    isSameDate(date1, date2) {
        return date1.getDate() === date2.getDate() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getFullYear() === date2.getFullYear();
    }
    
    // Public methods
    setDate(date) {
        this.selectedDate = new Date(date);
        this.currentMonth = this.selectedDate.getMonth();
        this.currentYear = this.selectedDate.getFullYear();
        this.render();
        this.attachEventListeners();
    }
    
    getSelectedDate() {
        return this.selectedDate;
    }
    
    getSelectedDateString() {
        return this.formatDateString(this.selectedDate);
    }
}

// Export for use in other modules
window.CustomCalendar = CustomCalendar;
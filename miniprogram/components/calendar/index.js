Component({
  properties: {
    theme: {
      type: Object,
      value: {}
    },
    year: {
      type: Number,
      value: 0
    },
    month: {
      type: Number,
      value: 0
    },
    markDates: {
      type: Array,
      value: []
    },
    selectedDate: {
      type: String,
      value: ''
    }
  },

  data: {
    currentYear: 0,
    currentMonth: 0,
    days: [],
    weekdays: ['日', '一', '二', '三', '四', '五', '六']
  },

  lifetimes: {
    attached: function() {
      var now = new Date();
      var year = this.data.year || now.getFullYear();
      var month = this.data.month || (now.getMonth() + 1);
      this.setData({
        currentYear: year,
        currentMonth: month
      });
      this.computeDays();
    }
  },

  observers: {
    'markDates': function() {
      this.computeDays();
    },
    'selectedDate': function() {
      this.computeDays();
    },
    'year': function(val) {
      if (val) {
        this.setData({ currentYear: val });
        this.computeDays();
      }
    },
    'month': function(val) {
      if (val) {
        this.setData({ currentMonth: val });
        this.computeDays();
      }
    }
  },

  methods: {
    computeDays: function() {
      var year = this.data.currentYear;
      var month = this.data.currentMonth;
      if (!year || !month) return;

      var markDates = this.data.markDates || [];
      var selectedDate = this.data.selectedDate || '';
      var now = new Date();
      var todayStr = now.getFullYear() + '-' + this._pad(now.getMonth() + 1) + '-' + this._pad(now.getDate());

      // First day of the month (0=Sun, 1=Mon, ...)
      var firstDay = new Date(year, month - 1, 1).getDay();
      // Total days in the month
      var daysInMonth = new Date(year, month, 0).getDate();
      // Total days in previous month
      var daysInPrevMonth = new Date(year, month - 1, 0).getDate();

      var days = [];
      var totalCells = 42; // 6 rows x 7 cols

      for (var i = 0; i < totalCells; i++) {
        var day = 0;
        var dateStr = '';
        var isCurrentMonth = false;

        if (i < firstDay) {
          // Previous month days
          day = daysInPrevMonth - firstDay + 1 + i;
          var prevMonth = month - 1;
          var prevYear = year;
          if (prevMonth === 0) {
            prevMonth = 12;
            prevYear = year - 1;
          }
          dateStr = prevYear + '-' + this._pad(prevMonth) + '-' + this._pad(day);
          isCurrentMonth = false;
        } else if (i - firstDay < daysInMonth) {
          // Current month days
          day = i - firstDay + 1;
          dateStr = year + '-' + this._pad(month) + '-' + this._pad(day);
          isCurrentMonth = true;
        } else {
          // Next month days
          day = i - firstDay - daysInMonth + 1;
          var nextMonth = month + 1;
          var nextYear = year;
          if (nextMonth === 13) {
            nextMonth = 1;
            nextYear = year + 1;
          }
          dateStr = nextYear + '-' + this._pad(nextMonth) + '-' + this._pad(day);
          isCurrentMonth = false;
        }

        days.push({
          day: day,
          dateStr: dateStr,
          isToday: dateStr === todayStr,
          isMarked: markDates.indexOf(dateStr) !== -1,
          isSelected: dateStr === selectedDate,
          isCurrentMonth: isCurrentMonth
        });
      }

      this.setData({ days: days });
    },

    prevMonth: function() {
      var year = this.data.currentYear;
      var month = this.data.currentMonth;
      month--;
      if (month === 0) {
        month = 12;
        year--;
      }
      this.setData({
        currentYear: year,
        currentMonth: month
      });
      this.computeDays();
      this.triggerEvent('monthchange', { year: year, month: month });
    },

    nextMonth: function() {
      var year = this.data.currentYear;
      var month = this.data.currentMonth;
      month++;
      if (month === 13) {
        month = 1;
        year++;
      }
      this.setData({
        currentYear: year,
        currentMonth: month
      });
      this.computeDays();
      this.triggerEvent('monthchange', { year: year, month: month });
    },

    onDayTap: function(e) {
      var info = e.currentTarget.dataset.info;
      if (!info || !info.isCurrentMonth) return;
      this.triggerEvent('daytap', {
        date: info.dateStr,
        year: this.data.currentYear,
        month: this.data.currentMonth,
        day: info.day
      });
    },

    _pad: function(n) {
      return n < 10 ? '0' + n : '' + n;
    }
  }
})
/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * وحدة تحكم بوابة الموظف (employee.js)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

let currentEmployee = null;
let employeeLeaveTypes = [];

document.addEventListener('DOMContentLoaded', async () => {
  // التحقق من الجلسة وحماية بوابة الموظف
  protectPage('employee');

  // استرجاع معرّف الموظف
  const uid = localStorage.getItem('alfajr_uid');
  if (!uid) {
    window.location.href = 'login.html';
    return;
  }

  setupEmployeeTabs();
  setupEmployeeForms();

  await loadCurrentEmployeeData(uid);
});

// ==========================================
// 1. تحميل بيانات الموظف
// ==========================================

async function loadCurrentEmployeeData(uid) {
  try {
    const doc = await db.collection('employees').doc(uid).get();
    if (!doc.exists) {
      // قد يكون المسجل مستخدماً غير مرتبط بعد بوثيقة موظف
      showToast('لم يتم العثور على ملف موظف مرتبط بحسابك', 'danger');
      return;
    }

    currentEmployee = { id: doc.id, ...doc.data() };

    // تحديث بيانات الترحيب بالواجهة
    const welcomeEl = document.getElementById('emp-welcome-name');
    if (welcomeEl) welcomeEl.textContent = currentEmployee.name;

    const jobEl = document.getElementById('emp-welcome-job');
    if (jobEl) jobEl.textContent = currentEmployee.jobTitle || 'موظف';

    // تحميل أنواع الإجازات المتاحة
    employeeLeaveTypes = await getLeaveTypes();
    populateLeaveTypeSelect();

    // فحص حالة الحضور اليوم
    await checkTodayAttendanceStatus();

    // تحميل التبويب النشط (الافتراضي: الحضور أو الراتب)
    await loadMyAttendanceHistory();
    await loadMySalaryBreakdown();
    await loadMyLeavesHistory();
    await loadMyExcusesHistory();

  } catch (err) {
    console.error('خطأ تحميل بيانات الموظف:', err);
    showToast('فشل تحميل بيانات الملف الشخصي', 'danger');
  }
}

// فحص ما إذا كان الموظف قد سجل حضور أو انصراف اليوم
async function checkTodayAttendanceStatus() {
  if (!currentEmployee) return;
  const todayStr = dateToDayString(new Date());
  const recordId = `${currentEmployee.id}_${todayStr}`;

  try {
    const doc = await db.collection('attendance').doc(recordId).get();
    const checkInBtn = document.getElementById('btn-action-checkin');
    const checkOutBtn = document.getElementById('btn-action-checkout');
    const statusText = document.getElementById('today-status-text');

    if (doc.exists) {
      const data = doc.data();
      if (data.checkIn) {
        checkInBtn.disabled = true;
        checkInBtn.innerHTML = `✓ تم تسجيل الحضور (${data.checkInTimeStr})`;
        checkInBtn.classList.add('btn-outline');
      }
      if (data.checkOut) {
        checkOutBtn.disabled = true;
        checkOutBtn.innerHTML = `✓ تم تسجيل الانصراف (${data.checkOutTimeStr})`;
        checkOutBtn.classList.add('btn-outline');
      } else if (data.checkIn) {
        checkOutBtn.disabled = false;
      }

      if (statusText) {
        if (data.checkOut) {
          statusText.innerHTML = `🟢 يوم عمل مكتمل: حضور ${data.checkInTimeStr} | انصراف ${data.checkOutTimeStr}`;
        } else {
          statusText.innerHTML = `🟢 أنت حاضر حالياً منذ ${data.checkInTimeStr}`;
        }
      }
    } else {
      if (checkOutBtn) checkOutBtn.disabled = true;
      if (statusText) statusText.innerHTML = 'لم يتم تسجيل الحضور لهذا اليوم بعد';
    }
  } catch (e) {
    console.warn(e);
  }
}

// ==========================================
// 2. تسجيل الحضور والانصراف الميداني (Check-in & Check-out)
// ==========================================

async function handleEmployeeCheckIn() {
  if (!currentEmployee) return;
  const btn = document.getElementById('btn-action-checkin');
  btn.disabled = true;
  btn.innerHTML = 'جاري التحقق من الموقع...';

  const success = await performCheckIn(currentEmployee.id);
  if (success) {
    await checkTodayAttendanceStatus();
    await loadMyAttendanceHistory();
    await loadMySalaryBreakdown();
  } else {
    btn.disabled = false;
    btn.innerHTML = '🟢 تحقق في';
  }
}

async function handleEmployeeCheckOut() {
  if (!currentEmployee) return;
  const btn = document.getElementById('btn-action-checkout');
  btn.disabled = true;
  btn.innerHTML = 'جاري التحقق من الانصراف...';

  const success = await performCheckOut(currentEmployee.id);
  if (success) {
    await checkTodayAttendanceStatus();
    await loadMyAttendanceHistory();
  } else {
    btn.disabled = false;
    btn.innerHTML = '🟠 الدفع';
  }
}

// ==========================================
// 3. تبويب: 💰 راتبي والحسابات الدقيقة
// ==========================================

async function loadMySalaryBreakdown(periodType = 'this_month') {
  if (!currentEmployee) return;

  const now = new Date();
  let startDate, endDate;

  if (periodType === 'this_month') {
    startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    endDate = dateToDayString(now);
  } else if (periodType === 'prev_month') {
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    startDate = dateToDayString(prevMonthDate);
    endDate = dateToDayString(lastDayPrevMonth);
  } else if (periodType === 'custom') {
    startDate = document.getElementById('salary-filter-start')?.value;
    endDate = document.getElementById('salary-filter-end')?.value;
    if (!startDate || !endDate) return;
  }

  try {
    const breakdown = await getEmployeeSalaryBreakdown(currentEmployee.id, startDate, endDate);

    // تحديث بطاقات الراتب العلوية
    document.getElementById('my-base-salary').textContent = formatCurrency(breakdown.rates.monthlySalary);
    document.getElementById('my-daily-wage').textContent = formatCurrency(breakdown.rates.dailyWage);
    document.getElementById('my-hourly-wage').textContent = formatCurrency(breakdown.rates.hourlyWage);
    document.getElementById('my-minute-wage').textContent = formatCurrency(breakdown.rates.minuteWage);
    document.getElementById('my-total-late-mins').textContent = `${breakdown.totalChargeableMinutes} دقيقة`;
    document.getElementById('my-total-deductions').textContent = formatCurrency(breakdown.totalDeductions);
    document.getElementById('my-net-salary').textContent = formatCurrency(breakdown.netSalary);

    // ملء جدول سجل التأخير والخصومات
    const tbody = document.getElementById('salary-deductions-table-body');
    if (!tbody) return;

    if (breakdown.records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">لا توجد سجلات حضور مسجلة خلال هذه الفترة</td></tr>';
      return;
    }

    tbody.innerHTML = breakdown.records.map(r => {
      const actualText = r.actualLateSeconds > 0 ? formatSecondsToArabicDuration(r.actualLateSeconds) : '—';
      const chargeableText = r.chargeableLateSeconds > 0 ? formatSecondsToArabicDuration(r.chargeableLateSeconds) : (r.actualLateSeconds > 0 ? 'داخل السماح (0)' : 'لا يوجد');

      let deductCol = '0 ريال';
      if (r.excuseApproved) {
        deductCol = '<span class="badge badge-success">عذر مقبول (0 ريال)</span>';
      } else if (r.deduction > 0) {
        deductCol = `<strong style="color: var(--danger);">${formatCurrency(r.deduction)}</strong>`;
      }

      return `
        <tr>
          <td><strong>${r.date}</strong></td>
          <td>${r.checkInTimeStr}</td>
          <td>${actualText}</td>
          <td><strong>${chargeableText}</strong></td>
          <td>${formatCurrency(r.minuteWage)}</td>
          <td>${deductCol}</td>
        </tr>
      `;
    }).join('');

  } catch (err) {
    console.error('خطأ تحميل بيانات الراتب:', err);
  }
}

// ==========================================
// 4. تبويب: 📋 سجل حضوري
// ==========================================

async function loadMyAttendanceHistory() {
  if (!currentEmployee) return;

  const tbody = document.getElementById('my-attendance-table-body');
  if (!tbody) return;

  try {
    const snap = await db.collection('attendance')
      .where('employeeId', '==', currentEmployee.id)
      .orderBy('date', 'desc')
      .limit(31)
      .get();

    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">لا توجد سجلات حضور مسجلة</td></tr>';
      return;
    }

    tbody.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      const statusBadge = d.status === 'present'
        ? '<span class="badge badge-success">حاضر</span>'
        : (d.status === 'late' ? '<span class="badge badge-warning">متأخر</span>' : '<span class="badge badge-danger">غائب</span>');

      return `
        <tr>
          <td><strong>${d.date}</strong></td>
          <td>${d.checkInTimeStr || '—'}</td>
          <td>${d.checkOutTimeStr || '—'}</td>
          <td>${d.chargeableLateSeconds > 0 ? formatSecondsToArabicDuration(d.chargeableLateSeconds) : (d.lateSeconds > 0 ? 'داخل فترة السماح' : 'في الموعد')}</td>
          <td>${d.earlyLeaveSeconds > 0 ? formatSecondsToArabicDuration(d.earlyLeaveSeconds) : '—'}</td>
          <td>${d.excuseApproved ? '<span class="badge badge-success">عذر معتمد</span>' : (d.lateDeduction > 0 ? formatCurrency(d.lateDeduction) : '—')}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.warn(err);
  }
}

// ==========================================
// 5. تبويب: 🏖️ إجازاتي وتقديم طلب إجازة
// ==========================================

async function loadMyLeavesHistory() {
  if (!currentEmployee) return;

  // تحديث أرصدة الإجازات
  document.getElementById('my-leave-annual-balance').textContent = `${currentEmployee.annualLeaveBalance || 30} يوم`;
  document.getElementById('my-leave-used').textContent = `${currentEmployee.usedLeave || 0} يوم`;
  document.getElementById('my-leave-remaining').textContent = `${currentEmployee.remainingLeave ?? currentEmployee.annualLeaveBalance ?? 30} يوم`;

  const tbody = document.getElementById('my-leaves-table-body');
  if (!tbody) return;

  const leaves = await getEmployeeLeaves(currentEmployee.id);
  if (leaves.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">لا توجد طلبات إجازة سابقة</td></tr>';
    return;
  }

  tbody.innerHTML = leaves.map(l => {
    const statusBadge = l.status === 'approved'
      ? '<span class="badge badge-success">موافقة</span>'
      : (l.status === 'rejected' ? '<span class="badge badge-danger">مرفوض</span>' : '<span class="badge badge-warning">قيد المراجعة</span>');

    return `
      <tr>
        <td><strong>${l.leaveTypeName}</strong></td>
        <td>${l.startDate}</td>
        <td>${l.endDate}</td>
        <td><strong>${l.days} يوم</strong></td>
        <td>${l.reason || '—'}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

function populateLeaveTypeSelect() {
  const select = document.getElementById('request-leave-type');
  if (!select) return;

  select.innerHTML = employeeLeaveTypes
    .filter(t => t.active !== false)
    .map(t => `<option value="${t.id}">${t.name} (رصيد: ${t.defaultBalance} يوم)</option>`)
    .join('');
}

async function handleLeaveFormSubmit(e) {
  e.preventDefault();
  if (!currentEmployee) return;

  const leaveTypeId = document.getElementById('request-leave-type').value;
  const startDate = document.getElementById('request-leave-start').value;
  const endDate = document.getElementById('request-leave-end').value;
  const reason = document.getElementById('request-leave-reason').value;

  // حساب عدد الأيام بين التاريخين
  const d1 = new Date(startDate);
  const d2 = new Date(endDate);
  const diffTime = d2.getTime() - d1.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  if (diffDays <= 0) {
    showToast('تاريخ نهاية الإجازة لا يمكن أن يسبق تاريخ البداية', 'warning');
    return;
  }

  const success = await submitLeaveRequest({
    employeeId: currentEmployee.id,
    leaveTypeId: leaveTypeId,
    startDate: startDate,
    endDate: endDate,
    days: diffDays,
    reason: reason
  });

  if (success) {
    document.getElementById('leave-request-form').reset();
    await loadCurrentEmployeeData(currentEmployee.id);
  }
}

// ==========================================
// 6. تبويب: ⚠️ طلب عذر
// ==========================================

async function loadMyExcusesHistory() {
  if (!currentEmployee) return;

  const tbody = document.getElementById('my-excuses-table-body');
  if (!tbody) return;

  const excuses = await getEmployeeExcuses(currentEmployee.id);
  if (excuses.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">لا توجد أعذار مقدمة</td></tr>';
    return;
  }

  tbody.innerHTML = excuses.map(x => {
    const statusBadge = x.status === 'approved'
      ? '<span class="badge badge-success">موافق (أُسقط الخصم)</span>'
      : (x.status === 'rejected' ? '<span class="badge badge-danger">مرفوض</span>' : '<span class="badge badge-warning">قيد المراجعة</span>');

    return `
      <tr>
        <td><strong>${x.type === 'late_checkin' ? 'عذر تأخير' : 'عذر انصراف مبكر'}</strong></td>
        <td>${x.date}</td>
        <td>${x.reason}</td>
        <td>${x.notes || '—'}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

async function handleExcuseFormSubmit(e) {
  e.preventDefault();
  if (!currentEmployee) return;

  const type = document.getElementById('request-excuse-type').value;
  const date = document.getElementById('request-excuse-date').value;
  const time = document.getElementById('request-excuse-time').value;
  const reason = document.getElementById('request-excuse-reason').value;
  const notes = document.getElementById('request-excuse-notes').value;

  const success = await submitExcuseRequest({
    employeeId: currentEmployee.id,
    type,
    date,
    time,
    reason,
    notes
  });

  if (success) {
    document.getElementById('excuse-request-form').reset();
    await loadMyExcusesHistory();
  }
}

// ==========================================
// 7. إعداد التبويبات والمستمعات
// ==========================================

function toggleEmployeeSidebar(forceState = null) {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;

  const isOpen = (forceState !== null) ? forceState : !sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
  } else {
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
  }
}

function switchEmployeeTab(tabId) {
  if (!tabId) return;

  // تحديث أزرار القائمة الجانبية
  document.querySelectorAll('.sidebar-menu .nav-link[data-tab]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
  });

  // تحديث أزرار شريط التنقل السفلي للهواتف
  document.querySelectorAll('#emp-bottom-nav .bottom-nav-item').forEach(b => {
    if (b.getAttribute('data-tab') === tabId) {
      b.classList.add('active');
    } else if (b.getAttribute('data-tab')) {
      b.classList.remove('active');
    }
  });

  // إظهار التبويب المحدد
  document.querySelectorAll('.employee-tab-pane').forEach(pane => {
    pane.style.display = (pane.id === `tab-pane-${tabId}`) ? 'block' : 'none';
  });

  // إغلاق القائمة في الشاشات الصغيرة
  if (window.innerWidth <= 992) {
    toggleEmployeeSidebar(false);
  }
}

function setupEmployeeTabs() {
  const tabButtons = document.querySelectorAll('.sidebar-menu .nav-link[data-tab], .tabs-nav .tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = btn.getAttribute('data-tab');
      if (tabId) switchEmployeeTab(tabId);
    });
  });

  // شريط التنقل السفلي للهواتف بنمط أندرويد
  document.querySelectorAll('#emp-bottom-nav .bottom-nav-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) switchEmployeeTab(tabId);
    });
  });

  const moreBtn = document.getElementById('btn-emp-bottom-more');
  if (moreBtn) {
    moreBtn.addEventListener('click', () => toggleEmployeeSidebar(true));
  }

  // زر القائمة في الهاتف
  const menuBtn = document.getElementById('menu-toggle');
  if (menuBtn) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEmployeeSidebar();
    });
  }

  // زر إغلاق القائمة الجانبية في رأس القائمة
  const closeBtn = document.getElementById('emp-sidebar-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      toggleEmployeeSidebar(false);
    });
  }

  // إغلاق القائمة عند النقر على الخلفية المعتمة
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      toggleEmployeeSidebar(false);
    });
  }
}
  // فلاتر فترة الراتب
  document.querySelectorAll('input[name="salary-period-radio"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const val = e.target.value;
      const customDates = document.getElementById('salary-custom-dates');
      if (val === 'custom') {
        if (customDates) customDates.style.display = 'flex';
      } else {
        if (customDates) customDates.style.display = 'none';
        loadMySalaryBreakdown(val);
      }
    });
  });

  document.getElementById('btn-apply-custom-salary')?.addEventListener('click', () => {
    loadMySalaryBreakdown('custom');
  });
}

function setupEmployeeForms() {
  document.getElementById('btn-action-checkin')?.addEventListener('click', handleEmployeeCheckIn);
  document.getElementById('btn-action-checkout')?.addEventListener('click', handleEmployeeCheckOut);
  document.getElementById('leave-request-form')?.addEventListener('submit', handleLeaveFormSubmit);
  document.getElementById('excuse-request-form')?.addEventListener('submit', handleExcuseFormSubmit);

  // تعيين التواريخ الافتراضية للنماذج
  const today = dateToDayString(new Date());
  const leaveStart = document.getElementById('request-leave-start');
  const leaveEnd = document.getElementById('request-leave-end');
  const excuseDate = document.getElementById('request-excuse-date');
  if (leaveStart) leaveStart.value = today;
  if (leaveEnd) leaveEnd.value = today;
  if (excuseDate) excuseDate.value = today;
}

/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * محرك التقارير التفصيلية والتصدير والطباعة الرسمية (reports.js)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

/**
 * توليد تقرير الحضور والانصراف
 * @param {string} employeeId معرّف الموظف أو 'all' للجميع
 * @param {string} startDate تاريخ البداية YYYY-MM-DD
 * @param {string} endDate تاريخ النهاية YYYY-MM-DD
 */
async function generateAttendanceReport(employeeId, startDate, endDate) {
  try {
    let query = db.collection('attendance')
      .where('date', '>=', startDate)
      .where('date', '<=', endDate);

    if (employeeId && employeeId !== 'all') {
      query = query.where('employeeId', '==', employeeId);
    }

    const snap = await query.get();
    const rows = [];
    let totalLateSeconds = 0;
    let totalEarlySeconds = 0;
    let totalPresent = 0;

    snap.forEach(doc => {
      const d = doc.data();
      totalLateSeconds += (d.chargeableLateSeconds || 0);
      totalEarlySeconds += (d.earlyLeaveSeconds || 0);
      if (d.checkIn) totalPresent++;

      rows.push({
        id: doc.id,
        employeeName: d.employeeName || 'موظف',
        date: d.date,
        checkIn: d.checkInTimeStr || '--:--:--',
        checkOut: d.checkOutTimeStr || '--:--:--',
        lateText: (d.chargeableLateSeconds > 0) ? formatSecondsToArabicDuration(d.chargeableLateSeconds) : (d.lateSeconds > 0 ? 'داخل السماح' : '—'),
        earlyText: (d.earlyLeaveSeconds > 0) ? formatSecondsToArabicDuration(d.earlyLeaveSeconds) : '—',
        status: d.status === 'present' ? 'حاضر' : (d.status === 'late' ? 'متأخر' : 'غياب'),
        distance: d.distance ? `${d.distance} متر` : '—'
      });
    });

    // ترتيب بحسب التاريخ
    rows.sort((a, b) => b.date.localeCompare(a.date));

    return {
      rows,
      summary: {
        totalRecords: rows.length,
        totalPresent,
        totalLateFormatted: formatSecondsToArabicDuration(totalLateSeconds),
        totalEarlyFormatted: formatSecondsToArabicDuration(totalEarlySeconds)
      }
    };
  } catch (error) {
    console.error('خطأ توليد تقرير الحضور:', error);
    showToast('فشل تحميل تقرير الحضور: ' + error.message, 'danger');
    return { rows: [], summary: {} };
  }
}

/**
 * توليد تقرير الرواتب الشامل
 * @param {string} employeeId معرّف الموظف أو 'all' للجميع
 * @param {string} startDate تاريخ البداية
 * @param {string} endDate تاريخ النهاية
 */
async function generateSalaryReport(employeeId, startDate, endDate) {
  try {
    const [employeesSnap, salarySettings] = await Promise.all([
      db.collection('employees').get(),
      getSalarySettings()
    ]);

    const employees = [];
    employeesSnap.forEach(doc => {
      if (employeeId === 'all' || doc.id === employeeId) {
        employees.push({ id: doc.id, ...doc.data() });
      }
    });

    const reportRows = [];
    let grandTotalBaseSalary = 0;
    let grandTotalDeductions = 0;
    let grandTotalNetSalary = 0;

    for (const emp of employees) {
      // جلب تفصيل الراتب والخصومات للموظف في الفترة
      const breakdown = await getEmployeeSalaryBreakdown(emp.id, startDate, endDate);

      grandTotalBaseSalary += breakdown.rates.monthlySalary;
      grandTotalDeductions += breakdown.totalDeductions;
      grandTotalNetSalary += breakdown.netSalary;

      reportRows.push({
        employeeId: emp.id,
        employeeName: emp.name,
        jobTitle: emp.jobTitle || 'موظف',
        baseSalary: breakdown.rates.monthlySalary,
        dailyWage: breakdown.rates.dailyWage,
        hourlyWage: breakdown.rates.hourlyWage,
        minuteWage: breakdown.rates.minuteWage,
        totalLateMinutes: breakdown.totalChargeableMinutes,
        totalDeductions: breakdown.totalDeductions,
        netSalary: breakdown.netSalary
      });
    }

    return {
      rows: reportRows,
      summary: {
        totalEmployees: reportRows.length,
        grandTotalBaseSalary,
        grandTotalDeductions,
        grandTotalNetSalary
      }
    };
  } catch (error) {
    console.error('خطأ توليد تقرير الرواتب:', error);
    showToast('فشل تحميل تقرير الرواتب: ' + error.message, 'danger');
    return { rows: [], summary: {} };
  }
}

/**
 * توليد تقرير الإجازات
 * @param {string} employeeId معرّف الموظف أو 'all'
 * @param {string} startDate تاريخ البداية
 * @param {string} endDate تاريخ النهاية
 */
async function generateLeaveReport(employeeId, startDate, endDate) {
  try {
    let query = db.collection('leaves')
      .where('startDate', '>=', startDate)
      .where('startDate', '<=', endDate);

    if (employeeId && employeeId !== 'all') {
      query = query.where('employeeId', '==', employeeId);
    }

    const snap = await query.get();
    const rows = [];
    let totalDays = 0;

    snap.forEach(doc => {
      const d = doc.data();
      totalDays += (Number(d.days) || 0);

      let statusArabic = 'قيد المراجعة';
      if (d.status === 'approved') statusArabic = 'موافقة';
      if (d.status === 'rejected') statusArabic = 'مرفوض';

      rows.push({
        id: doc.id,
        employeeName: d.employeeName || 'موظف',
        leaveType: d.leaveTypeName || 'إجازة',
        startDate: d.startDate,
        endDate: d.endDate,
        days: d.days,
        reason: d.reason || '—',
        status: statusArabic
      });
    });

    rows.sort((a, b) => b.startDate.localeCompare(a.startDate));

    return {
      rows,
      summary: {
        totalRequests: rows.length,
        totalDays: totalDays
      }
    };
  } catch (error) {
    console.error('خطأ توليد تقرير الإجازات:', error);
    showToast('فشل تحميل تقرير الإجازات', 'danger');
    return { rows: [], summary: {} };
  }
}

/**
 * إطلاق عملية الطباعة الرسمية مع تحديث بيانات الترويسة والفترة
 * @param {string} title عنوان التقرير
 * @param {string} periodRange الفترة الزمنية
 */
function triggerReportPrint(title, periodRange) {
  // تحديث الترويسة المطبوعة
  const printTitleEl = document.getElementById('print-report-title');
  const printPeriodEl = document.getElementById('print-report-period');
  const printDateEl = document.getElementById('print-generate-date');

  if (printTitleEl) printTitleEl.textContent = title;
  if (printPeriodEl) printPeriodEl.textContent = `الفترة الزمنية: ${periodRange}`;
  if (printDateEl) printDateEl.textContent = `تاريخ إصدار التقرير: ${formatDisplayDate(new Date())} - ${dateToTimeString(new Date())}`;

  window.print();
}

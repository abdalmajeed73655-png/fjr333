/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * محرك احتساب الرواتب والخصومات وتاريخ التعديلات (salary.js)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

/**
 * حساب معدلات الأجر الأساسية للموظف (اليومي، الساعي، الدقيقة)
 * @param {number} monthlySalary الراتب الشهري
 * @param {object} salarySettings إعدادات الرواتب (أيام الشهر، ساعات العمل، طريقة التقريب)
 */
function computeSalaryRates(monthlySalary, salarySettings = {}) {
  const salary = Number(monthlySalary) || 0;
  const approvedDays = Number(salarySettings.approvedMonthDays) || 30;
  const workHours = Number(salarySettings.dailyWorkHours) || 7;

  const dailyWage = salary > 0 ? (salary / approvedDays) : 0;
  const hourlyWage = dailyWage > 0 ? (dailyWage / workHours) : 0;
  const minuteWage = hourlyWage > 0 ? (hourlyWage / 60) : 0;

  return {
    monthlySalary: salary,
    approvedDays: approvedDays,
    dailyWorkHours: workHours,
    dailyWage: dailyWage,
    hourlyWage: hourlyWage,
    minuteWage: minuteWage
  };
}

/**
 * جلب وتفصيل بيانات الراتب والخصومات لموظف خلال فترة زمنية محددة
 * @param {string} employeeId معرّف الموظف
 * @param {string} startDate تاريخ البداية بصيغة YYYY-MM-DD
 * @param {string} endDate تاريخ النهاية بصيغة YYYY-MM-DD
 */
async function getEmployeeSalaryBreakdown(employeeId, startDate, endDate) {
  try {
    const [empDoc, salarySettings] = await Promise.all([
      db.collection('employees').doc(employeeId).get(),
      getSalarySettings()
    ]);

    if (!empDoc.exists) {
      throw new Error('بيانات الموظف غير متوفرة');
    }

    const employee = empDoc.data();
    const rates = computeSalaryRates(employee.salary, salarySettings);

    // جلب سجلات الحضور ضمن الفترة المحددة
    let query = db.collection('attendance')
      .where('employeeId', '==', employeeId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate);

    const snap = await query.get();

    let totalChargeableSeconds = 0;
    let totalActualLateSeconds = 0;
    let totalDeductions = 0;
    const records = [];

    snap.forEach(doc => {
      const data = doc.data();
      
      // إذا تمت الموافقة على عذر لهذا اليوم، لا يتم احتساب خصم
      const isExcuseWaived = Boolean(data.excuseApproved);
      const effectiveChargeableSeconds = isExcuseWaived ? 0 : (data.chargeableLateSeconds || 0);
      const effectiveDeduction = isExcuseWaived ? 0 : (data.lateDeduction || 0);

      totalActualLateSeconds += (data.lateSeconds || 0);
      totalChargeableSeconds += effectiveChargeableSeconds;
      totalDeductions += effectiveDeduction;

      records.push({
        id: doc.id,
        date: data.date,
        checkInTimeStr: data.checkInTimeStr || '--:--:--',
        actualLateSeconds: data.lateSeconds || 0,
        chargeableLateSeconds: effectiveChargeableSeconds,
        minuteWage: rates.minuteWage,
        deduction: effectiveDeduction,
        excuseApproved: isExcuseWaived,
        status: data.status
      });
    });

    // ترتيب السجلات تصاعدياً حسب التاريخ
    records.sort((a, b) => a.date.localeCompare(b.date));

    const netSalary = Math.max(0, rates.monthlySalary - totalDeductions);

    return {
      employee: employee,
      rates: rates,
      period: { startDate, endDate },
      totalActualLateSeconds: totalActualLateSeconds,
      totalChargeableSeconds: totalChargeableSeconds,
      totalChargeableMinutes: Math.round(totalChargeableSeconds / 60),
      totalDeductions: Number(totalDeductions.toFixed(2)),
      netSalary: Number(netSalary.toFixed(2)),
      records: records
    };

  } catch (error) {
    console.error('خطأ حساب الراتب:', error);
    throw error;
  }
}

/**
 * تعديل راتب الموظف بواسطة المدير مع توثيق السجل التاريخي (salaryHistory)
 * @param {string} employeeId معرّف الموظف
 * @param {number} newSalary الراتب الجديد
 * @param {string} reason سبب التعديل (علاوة، ترقية، تعديل هيكل...)
 */
async function updateEmployeeSalary(employeeId, newSalary, reason = 'تعديل إداري للراتب') {
  if (!employeeId || newSalary === undefined || newSalary < 0) {
    showToast('يرجى تحديد راتب صالح وغير سالب', 'warning');
    return false;
  }

  try {
    const empRef = db.collection('employees').doc(employeeId);
    const empDoc = await empRef.get();

    if (!empDoc.exists) {
      showToast('الموظف غير موجود', 'danger');
      return false;
    }

    const currentEmp = empDoc.data();
    const oldSalary = currentEmp.salary || 0;
    const adminUser = localStorage.getItem('alfajr_username') || 'fjr';

    // 1. تحديث الراتب في وثيقة الموظف
    await empRef.update({
      salary: Number(newSalary),
      updatedAt: getServerTimestamp()
    });

    // 2. تسجيل العملية في جدول تاريخ الرواتب (salaryHistory)
    await db.collection('salaryHistory').add({
      employeeId: employeeId,
      employeeName: currentEmp.name,
      oldSalary: oldSalary,
      newSalary: Number(newSalary),
      changedBy: adminUser,
      reason: reason,
      changedAt: getServerTimestamp(),
      dateStr: dateToDayString(new Date()),
      timeStr: dateToTimeString(new Date())
    });

    // 3. تسجيل في Audit Log العام
    await logActivity(
      'تعديل راتب',
      `تعديل راتب الموظف ${currentEmp.name} من ${formatCurrency(oldSalary)} إلى ${formatCurrency(newSalary)} (السبب: ${reason})`,
      { salary: oldSalary },
      { salary: Number(newSalary) }
    );

    showToast(`تم تحديث راتب الموظف (${currentEmp.name}) بنجاح إلى ${formatCurrency(newSalary)}`, 'success');
    return true;

  } catch (error) {
    console.error('فشل تعديل الراتب:', error);
    showToast('فشل تعديل الراتب: ' + error.message, 'danger');
    return false;
  }
}

/**
 * جلب سجل التعديلات التاريخية لراتب موظف معين
 */
async function getEmployeeSalaryHistory(employeeId) {
  try {
    const snap = await db.collection('salaryHistory')
      .where('employeeId', '==', employeeId)
      .orderBy('changedAt', 'desc')
      .get();

    const history = [];
    snap.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
    return history;
  } catch (e) {
    console.warn('تعذر جلب تاريخ الرواتب:', e);
    return [];
  }
}

/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * إدارة الأعذار وربطها التلقائي بسجلات الحضور والخصومات (excuses.js)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

/**
 * تقديم طلب عذر جديد من الموظف
 * @param {object} excuseData بيانات العذر
 */
async function submitExcuseRequest(excuseData) {
  const { employeeId, type, date, time, reason, notes, attachmentUrl } = excuseData;

  if (!employeeId || !type || !date || !reason) {
    showToast('يرجى ملء جميع حقول العذر الإلزامية', 'warning');
    return false;
  }

  try {
    const empDoc = await db.collection('employees').doc(employeeId).get();
    if (!empDoc.exists) {
      showToast('الموظف غير موجود', 'danger');
      return false;
    }

    const employee = empDoc.data();

    const newExcuse = {
      employeeId: employeeId,
      employeeName: employee.name,
      employeeUsername: employee.username || '',
      type: type, // 'late_checkin' (عذر تأخير) أو 'early_checkout' (عذر مغادرة مبكرة)
      date: date,
      time: time || '',
      reason: reason,
      notes: notes || '',
      attachmentUrl: attachmentUrl || '',
      status: 'pending', // pending (قيد المراجعة), approved (موافق), rejected (مرفوض)
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp()
    };

    const docRef = await db.collection('excuses').add(newExcuse);

    const typeLabel = type === 'late_checkin' ? 'تأخير حضور' : 'مغادرة مبكرة';
    await logActivity('طلب عذر جديد', `الموظف: ${employee.name} - عذر ${typeLabel} بتاريخ ${date}`);

    showToast('تم تقديم العذر بنجاح وهو قيد المراجعة الإدارية', 'success');
    return docRef.id;

  } catch (error) {
    console.error('خطأ تقديم العذر:', error);
    showToast('فشل تقديم العذر: ' + error.message, 'danger');
    return false;
  }
}

/**
 * موافقة المدير على العذر مع إسقاط الخصم وتحديث سجل الحضور تلقائياً
 * @param {string} excuseId معرّف العذر
 */
async function approveExcuseRequest(excuseId) {
  if (!excuseId) return false;

  try {
    const excuseRef = db.collection('excuses').doc(excuseId);
    const excuseDoc = await excuseRef.get();

    if (!excuseDoc.exists) {
      showToast('طلب العذر غير موجود', 'danger');
      return false;
    }

    const excuse = excuseDoc.data();
    const adminUser = localStorage.getItem('alfajr_username') || 'fjr';

    // 1. تحديث حالة العذر
    await excuseRef.update({
      status: 'approved',
      approvedBy: adminUser,
      approvedAt: getServerTimestamp(),
      updatedAt: getServerTimestamp()
    });

    // 2. إذا كان عذر تأخير: البحث عن سجل الحضور المقابل لهذا التاريخ وإلغاء الخصم والتأخير المحتسب
    if (excuse.type === 'late_checkin' && excuse.employeeId && excuse.date) {
      const attendanceId = `${excuse.employeeId}_${excuse.date}`;
      const attRef = db.collection('attendance').doc(attendanceId);
      const attDoc = await attRef.get();

      if (attDoc.exists) {
        // إسقاط التأخير المحتسب وقيمة الخصم عن هذا اليوم
        await attRef.update({
          excuseApproved: true,
          excuseId: excuseId,
          chargeableLateSeconds: 0,
          lateDeduction: 0,
          updatedAt: getServerTimestamp()
        });
        console.log(`✅ تم إسقاط الخصم عن سجل الحضور ${attendanceId} بموجب قبول العذر`);
      }
    }

    await logActivity('موافقة على عذر', `تم قبول عذر الموظف: ${excuse.employeeName} بتاريخ ${excuse.date}`);
    showToast('تمت الموافقة على العذر وإسقاط الخصم المترتب عليه بنجاح', 'success');
    return true;

  } catch (error) {
    console.error('فشل الموافقة على العذر:', error);
    showToast('فشل قبول العذر: ' + error.message, 'danger');
    return false;
  }
}

/**
 * رفض العذر من قبل المدير
 * @param {string} excuseId معرّف العذر
 * @param {string} rejectReason سبب الرفض
 */
async function rejectExcuseRequest(excuseId, rejectReason = 'العذر غير مقبول') {
  if (!excuseId) return false;

  try {
    const excuseRef = db.collection('excuses').doc(excuseId);
    const excuseDoc = await excuseRef.get();

    if (!excuseDoc.exists) {
      showToast('طلب العذر غير موجود', 'danger');
      return false;
    }

    const excuse = excuseDoc.data();
    const adminUser = localStorage.getItem('alfajr_username') || 'fjr';

    await excuseRef.update({
      status: 'rejected',
      rejectedBy: adminUser,
      rejectReason: rejectReason,
      rejectedAt: getServerTimestamp(),
      updatedAt: getServerTimestamp()
    });

    // إذا كان مرتبطاً بسجل حضور وكان قد عفي عنه سابقاً، نعيد الحساب (احتياطياً)
    if (excuse.type === 'late_checkin' && excuse.employeeId && excuse.date) {
      const attendanceId = `${excuse.employeeId}_${excuse.date}`;
      const attRef = db.collection('attendance').doc(attendanceId);
      const attDoc = await attRef.get();

      if (attDoc.exists && attDoc.data().excuseApproved) {
        const attData = attDoc.data();
        const [empDoc, salarySettings] = await Promise.all([
          db.collection('employees').doc(excuse.employeeId).get(),
          getSalarySettings()
        ]);

        const salary = empDoc.exists ? empDoc.data().salary : 0;
        const restoredDeduction = calculateDeductionAmount(attData.lateSeconds, salary, salarySettings);

        await attRef.update({
          excuseApproved: false,
          chargeableLateSeconds: attData.lateSeconds,
          lateDeduction: restoredDeduction,
          updatedAt: getServerTimestamp()
        });
      }
    }

    await logActivity('رفض عذر', `تم رفض عذر الموظف: ${excuse.employeeName} (السبب: ${rejectReason})`);
    showToast('تم رفض العذر بنجاح', 'info');
    return true;

  } catch (error) {
    console.error('فشل رفض العذر:', error);
    showToast('فشل رفض العذر: ' + error.message, 'danger');
    return false;
  }
}

/**
 * جلب أعذار موظف معين
 */
async function getEmployeeExcuses(employeeId) {
  try {
    const snap = await db.collection('excuses')
      .where('employeeId', '==', employeeId)
      .orderBy('createdAt', 'desc')
      .get();

    const excuses = [];
    snap.forEach(doc => excuses.push({ id: doc.id, ...doc.data() }));
    return excuses;
  } catch (e) {
    console.warn('فشل جلب أعذار الموظف:', e);
    return [];
  }
}

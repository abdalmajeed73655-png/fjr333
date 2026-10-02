/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * إدارة الإجازات والأنواع واحتساب الأرصدة (leaves.js)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

// جلب كافة أنواع الإجازات المتاحة
async function getLeaveTypes() {
  try {
    const snap = await db.collection('leaveTypes').get();
    const types = [];
    snap.forEach(doc => {
      types.push({ id: doc.id, ...doc.data() });
    });
    return types;
  } catch (error) {
    console.warn('فشل جلب أنواع الإجازات:', error);
    return [];
  }
}

/**
 * تقديم طلب إجازة جديد للموظف
 * @param {object} leaveData بيانات الطلب (employeeId, leaveTypeId, startDate, endDate, days, reason, attachmentUrl)
 */
async function submitLeaveRequest(leaveData) {
  const { employeeId, leaveTypeId, startDate, endDate, days, reason, attachmentUrl } = leaveData;

  if (!employeeId || !leaveTypeId || !startDate || !endDate || !days || days <= 0) {
    showToast('يرجى تعبئة جميع الحقول المطلوبة للإجازة بشكل صحيح', 'warning');
    return false;
  }

  // التحقق من صحة التواريخ
  if (new Date(endDate) < new Date(startDate)) {
    showToast('تاريخ نهاية الإجازة لا يمكن أن يكون قبل تاريخ البداية', 'warning');
    return false;
  }

  try {
    // 1. جلب بيانات الموظف ونوع الإجازة للتحقق
    const [empDoc, typeDoc] = await Promise.all([
      db.collection('employees').doc(employeeId).get(),
      db.collection('leaveTypes').doc(leaveTypeId).get()
    ]);

    if (!empDoc.exists) {
      showToast('الموظف غير مسجل بالنظام', 'danger');
      return false;
    }

    const employee = empDoc.data();
    const leaveType = typeDoc.exists ? typeDoc.data() : { name: 'إجازة', deductFromBalance: true };

    // إذا كانت الإجازة تخصم من الرصيد السنوي، تحقق من كفاية الرصيد
    if (leaveType.deductFromBalance) {
      const remaining = Number(employee.remainingLeave) || 0;
      if (days > remaining) {
        showToast(`رصيد إجازاتك المتبقي (${remaining} يوم) غير كافٍ لطلب (${days} يوم)`, 'warning', 'رصيد غير كافٍ');
        return false;
      }
    }

    // 2. إنشاء طلب الإجازة في Firestore
    const newLeave = {
      employeeId: employeeId,
      employeeName: employee.name,
      employeeUsername: employee.username || '',
      leaveTypeId: leaveTypeId,
      leaveTypeName: leaveType.name,
      startDate: startDate,
      endDate: endDate,
      days: Number(days),
      reason: reason || '',
      attachmentUrl: attachmentUrl || '',
      deductFromBalance: Boolean(leaveType.deductFromBalance),
      status: 'pending', // pending (قيد المراجعة), approved (موافقة), rejected (مرفوض)
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp()
    };

    const docRef = await db.collection('leaves').add(newLeave);

    await logActivity('طلب إجازة جديد', `الموظف: ${employee.name} - نوع: ${leaveType.name} (${days} يوم)`);
    showToast('تم إرسال طلب الإجازة بنجاح، وهو قيد مراجعة الإدارة', 'success');
    return docRef.id;

  } catch (error) {
    console.error('خطأ تقديم الإجازة:', error);
    showToast('فشل إرسال طلب الإجازة: ' + error.message, 'danger');
    return false;
  }
}

/**
 * موافقة المدير على طلب الإجازة وخصم الرصيد باستخدام Firestore Transaction لمنع التكرار
 * @param {string} leaveId معرّف الإجازة
 */
async function approveLeaveRequest(leaveId) {
  if (!leaveId) return false;

  try {
    const leaveRef = db.collection('leaves').doc(leaveId);
    const adminUser = localStorage.getItem('alfajr_username') || 'fjr';

    // تنفيذ العملية عبر Transaction لضمان الاتساق ومنع الخصم المكرر
    await db.runTransaction(async (transaction) => {
      const leaveDoc = await transaction.get(leaveRef);
      if (!leaveDoc.exists) throw new Error('طلب الإجازة غير موجود');

      const leave = leaveDoc.data();
      if (leave.status === 'approved') throw new Error('تمت الموافقة على هذه الإجازة مسبقاً');

      const empRef = db.collection('employees').doc(leave.employeeId);
      const empDoc = await transaction.get(empRef);

      if (empDoc.exists && leave.deductFromBalance) {
        const emp = empDoc.data();
        const currentRemaining = Number(emp.remainingLeave) || 0;
        const currentUsed = Number(emp.usedLeave) || 0;
        const daysToDeduct = Number(leave.days) || 0;

        transaction.update(empRef, {
          usedLeave: currentUsed + daysToDeduct,
          remainingLeave: Math.max(0, currentRemaining - daysToDeduct),
          updatedAt: getServerTimestamp()
        });
      }

      transaction.update(leaveRef, {
        status: 'approved',
        approvedBy: adminUser,
        approvedAt: getServerTimestamp(),
        updatedAt: getServerTimestamp()
      });
    });

    await logActivity('موافقة على إجازة', `تمت الموافقة على الإجازة رقم ${leaveId}`);
    showToast('تمت الموافقة على طلب الإجازة وخصم الأيام من الرصيد بنجاح', 'success');
    return true;

  } catch (error) {
    console.error('فشل الموافقة على الإجازة:', error);
    showToast(error.message || 'فشلت عملية الموافقة', 'danger');
    return false;
  }
}

/**
 * رفض طلب الإجازة
 * @param {string} leaveId معرّف الإجازة
 * @param {string} rejectReason سبب الرفض
 */
async function rejectLeaveRequest(leaveId, rejectReason = 'غير مستوفٍ للشروط') {
  if (!leaveId) return false;

  try {
    const leaveRef = db.collection('leaves').doc(leaveId);
    const adminUser = localStorage.getItem('alfajr_username') || 'fjr';

    await leaveRef.update({
      status: 'rejected',
      rejectedBy: adminUser,
      rejectReason: rejectReason,
      rejectedAt: getServerTimestamp(),
      updatedAt: getServerTimestamp()
    });

    await logActivity('رفض إجازة', `تم رفض الإجازة رقم ${leaveId} (السبب: ${rejectReason})`);
    showToast('تم رفض طلب الإجازة بنجاح', 'info');
    return true;

  } catch (error) {
    console.error('فشل رفض الإجازة:', error);
    showToast('فشل الرفض: ' + error.message, 'danger');
    return false;
  }
}

/**
 * جلب إجازات موظف محدد
 */
async function getEmployeeLeaves(employeeId) {
  try {
    const snap = await db.collection('leaves')
      .where('employeeId', '==', employeeId)
      .orderBy('createdAt', 'desc')
      .get();

    const leaves = [];
    snap.forEach(doc => leaves.push({ id: doc.id, ...doc.data() }));
    return leaves;
  } catch (e) {
    console.warn('فشل جلب إجازات الموظف:', e);
    return [];
  }
}

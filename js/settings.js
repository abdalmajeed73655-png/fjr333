/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * إدارة إعدادات النظام (المؤسسة، الدوام، GPS، الرواتب، الإجازات، الحساب) (settings.js)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

/**
 * جلب كافة إعدادات النظام لتعبئة نماذج الإعدادات
 */
async function loadAllSystemSettings() {
  try {
    const [orgDoc, workDoc, gpsDoc, salaryDoc, leaveTypesSnap] = await Promise.all([
      db.collection('organization').doc('info').get(),
      db.collection('settings').doc('workSettings').get(),
      db.collection('settings').doc('gpsSettings').get(),
      db.collection('settings').doc('salarySettings').get(),
      db.collection('leaveTypes').get()
    ]);

    const org = orgDoc.exists ? orgDoc.data() : {
      name: "مؤسسة الفجر الخيرية الاجتماعية",
      region: "حضرموت – المكلا",
      developer: "عبد المجيد عياش برديني",
      phone: "770905092",
      logoUrl: "assets/logo.svg"
    };

    const work = workDoc.exists ? workDoc.data() : {
      startTime: "07:00:00",
      endTime: "14:00:00",
      gracePeriodMinutes: 15,
      dailyWorkHours: 7
    };

    const gps = gpsDoc.exists ? gpsDoc.data() : {
      latitude: 14.5424,
      longitude: 49.1248,
      radius: 100
    };

    const salary = salaryDoc.exists ? salaryDoc.data() : {
      approvedMonthDays: 30,
      dailyWorkHours: 7,
      roundingMethod: "exact_seconds"
    };

    const leaveTypes = [];
    leaveTypesSnap.forEach(d => leaveTypes.push({ id: d.id, ...d.data() }));

    return { org, work, gps, salary, leaveTypes };
  } catch (error) {
    console.error('خطأ تحميل الإعدادات:', error);
    showToast('فشل تحميل بعض إعدادات النظام', 'danger');
    return null;
  }
}

/**
 * حفظ إعدادات المؤسسة
 */
async function saveOrganizationSettings(data, logoFile = null) {
  try {
    let logoUrl = data.logoUrl || localStorage.getItem('alfajr_custom_logo') || "assets/logo.svg";

    // إذا قام المستخدم باختيار ملف شعار جديد، تحويله إلى DataURL ورفعه
    if (logoFile) {
      showToast('جاري معالجة وحفظ الشعار الجديد...', 'info');
      logoUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(logoFile);
      });

      // إذا كان Firebase Storage مفعلاً وحقيقياً
      if (typeof isPlaceholderMode !== 'undefined' && !isPlaceholderMode && storage) {
        try {
          const storageRef = storage.ref(`organization/logo_${Date.now()}_${logoFile.name}`);
          const uploadTask = await storageRef.put(logoFile);
          const cloudUrl = await uploadTask.ref.getDownloadURL();
          if (cloudUrl) logoUrl = cloudUrl;
        } catch (storageErr) {
          console.warn('تم حفظ الشعار محلياً وبنجاح:', storageErr.message);
        }
      }
    }

    // حفظ الشعار محلياً وتطبيقه فورياً عبر كافة الصفحات والطباعة
    if (logoUrl) {
      try {
        localStorage.setItem('alfajr_custom_logo', logoUrl);
      } catch (e) {
        console.warn('تخزين الشعار في localStorage:', e);
      }
      if (typeof applySystemLogo === 'function') {
        applySystemLogo(logoUrl);
      }
    }

    const orgUpdate = {
      name: data.name,
      region: data.region,
      developer: "عبد المجيد عياش برديني",
      phone: "770905092",
      logoUrl: logoUrl,
      updatedAt: getServerTimestamp()
    };

    await db.collection('organization').doc('info').set(orgUpdate, { merge: true });
    await logActivity('تحديث إعدادات المؤسسة', `تحديث بيانات المؤسسة وتغيير الشعار المعتمد`);

    showToast('تم حفظ إعدادات المؤسسة واعتماد الشعار الجديد بنجاح في جميع الصفحات والطباعة', 'success');
    return true;
  } catch (error) {
    console.error('خطأ حفظ إعدادات المؤسسة:', error);
    showToast('فشل حفظ إعدادات المؤسسة: ' + error.message, 'danger');
    return false;
  }
}

/**
 * حفظ إعدادات ساعات العمل والدوام
 */
async function saveWorkSettings(data) {
  try {
    const workData = {
      startTime: data.startTime,
      endTime: data.endTime,
      gracePeriodMinutes: Number(data.gracePeriodMinutes) || 0,
      dailyWorkHours: Number(data.dailyWorkHours) || 7,
      updatedAt: getServerTimestamp()
    };

    await db.collection('settings').doc('workSettings').set(workData, { merge: true });
    await logActivity(
      'تحديث إعدادات الدوام',
      `تحديث بداية الدوام: ${data.startTime}، النهاية: ${data.endTime}، السماح: ${data.gracePeriodMinutes} دقيقة`
    );

    showToast('تم حفظ إعدادات ساعات العمل وفترة السماح بنجاح', 'success');
    return true;
  } catch (error) {
    console.error('خطأ حفظ إعدادات الدوام:', error);
    showToast('فشل حفظ إعدادات الدوام', 'danger');
    return false;
  }
}

/**
 * حفظ إعدادات GPS الجغرافية
 */
async function saveGpsSettings(data) {
  try {
    const gpsData = {
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      radius: Number(data.radius) || 100,
      updatedAt: getServerTimestamp()
    };

    await db.collection('settings').doc('gpsSettings').set(gpsData, { merge: true });
    await logActivity('تحديث إعدادات GPS', `تحديد موقع المؤسسة: (${data.latitude}, ${data.longitude}) بنصف قطر ${data.radius} متر`);

    showToast('تم حفظ إعدادات الموقع الجغرافي ونصف القطر بنجاح', 'success');
    return true;
  } catch (error) {
    console.error('خطأ حفظ إعدادات GPS:', error);
    showToast('فشل حفظ إعدادات GPS', 'danger');
    return false;
  }
}

/**
 * حفظ إعدادات الرواتب والخصومات
 */
async function saveSalarySettings(data) {
  try {
    const salaryData = {
      approvedMonthDays: Number(data.approvedMonthDays) || 30,
      dailyWorkHours: Number(data.dailyWorkHours) || 7,
      roundingMethod: data.roundingMethod || 'exact_seconds',
      updatedAt: getServerTimestamp()
    };

    await db.collection('settings').doc('salarySettings').set(salaryData, { merge: true });
    await logActivity('تحديث قواعد الرواتب', `تحديث أيام الشهر المعتمدة (${data.approvedMonthDays}) وطريقة التقريب (${data.roundingMethod})`);

    showToast('تم حفظ قواعد وإعدادات احتساب الرواتب بنجاح', 'success');
    return true;
  } catch (error) {
    console.error('خطأ حفظ إعدادات الرواتب:', error);
    showToast('فشل حفظ إعدادات الرواتب', 'danger');
    return false;
  }
}

/**
 * إضافة أو تحديث نوع إجازة
 */
async function saveLeaveType(typeData) {
  try {
    const id = typeData.id || `type_${Date.now()}`;
    const payload = {
      name: typeData.name,
      defaultBalance: Number(typeData.defaultBalance) || 0,
      deductFromBalance: Boolean(typeData.deductFromBalance),
      requiresApproval: Boolean(typeData.requiresApproval),
      requiresAttachment: Boolean(typeData.requiresAttachment),
      calculationMethod: typeData.calculationMethod || 'calendar_days',
      active: typeData.active !== undefined ? Boolean(typeData.active) : true,
      updatedAt: getServerTimestamp()
    };

    await db.collection('leaveTypes').doc(id).set(payload, { merge: true });
    await logActivity('تحديث أنواع الإجازات', `حفظ نوع الإجازة: ${typeData.name}`);

    showToast(`تم حفظ نوع الإجازة (${typeData.name}) بنجاح`, 'success');
    return true;
  } catch (error) {
    console.error('خطأ حفظ نوع الإجازة:', error);
    showToast('فشل حفظ نوع الإجازة', 'danger');
    return false;
  }
}

/**
 * حذف نوع إجازة
 */
async function deleteLeaveType(typeId) {
  try {
    await db.collection('leaveTypes').doc(typeId).delete();
    await logActivity('حذف نوع إجازة', `تم حذف نوع الإجازة معرّف ${typeId}`);
    showToast('تم حذف نوع الإجازة بنجاح', 'success');
    return true;
  } catch (error) {
    console.error('فشل حذف نوع الإجازة:', error);
    showToast('فشل حذف نوع الإجازة', 'danger');
    return false;
  }
}

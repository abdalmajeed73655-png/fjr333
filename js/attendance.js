/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * محرك تسجيل الحضور والانصراف والتحقق من GPS وحساب التأخير الدقيق (attendance.js)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

// جلب إعدادات الدوام الحالية من Firestore
async function getWorkSettings() {
  try {
    const doc = await db.collection('settings').doc('workSettings').get();
    if (doc.exists) {
      return doc.data();
    }
  } catch (e) {
    console.warn('تعذر جلب إعدادات الدوام، استخدام الافتراضي:', e);
  }
  return {
    startTime: "07:00:00",
    endTime: "14:00:00",
    gracePeriodMinutes: 15,
    earlyArrivalAllowed: true,
    dailyWorkHours: 7
  };
}

// جلب إعدادات GPS الحالية من Firestore
async function getGpsSettings() {
  try {
    const doc = await db.collection('settings').doc('gpsSettings').get();
    if (doc.exists) {
      return doc.data();
    }
  } catch (e) {
    console.warn('تعذر جلب إعدادات GPS، استخدام الافتراضي:', e);
  }
  return {
    latitude: 14.5424,
    longitude: 49.1248,
    radius: 100 // 100 متر
  };
}

// جلب إعدادات الرواتب
async function getSalarySettings() {
  try {
    const doc = await db.collection('settings').doc('salarySettings').get();
    if (doc.exists) {
      return doc.data();
    }
  } catch (e) {
    console.warn('تعذر جلب إعدادات الرواتب:', e);
  }
  return {
    approvedMonthDays: 30,
    dailyWorkHours: 7,
    roundingMethod: "exact_seconds"
  };
}

/**
 * الحصول على الموقع الجغرافي الحالي للجهاز بمرونة عالية ودعم Fallback ذكي
 */
function getCurrentDevicePosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('متصفحك لا يدعم نظام تحديد المواقع الجغرافية GPS'));
      return;
    }

    // 1. المحاولة الأولى: دقة عالية (Satellite GPS) بمهلة سريعة 5 ثوانٍ
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
          timestamp: position.timestamp
        });
      },
      (errHigh) => {
        console.warn('تنبيه GPS عالي الدقة، جاري التبديل للموقع عبر الشبكة/Wi-Fi...', errHigh.message);
        
        // 2. المحاولة البديلة: دقة عادية (Wi-Fi / Cell tower) تعمل بنجاح داخل المباني وعلى الهواتف والحواسيب
        navigator.geolocation.getCurrentPosition(
          (posFallback) => {
            resolve({
              latitude: posFallback.coords.latitude,
              longitude: posFallback.coords.longitude,
              accuracy: Math.round(posFallback.coords.accuracy),
              timestamp: posFallback.timestamp
            });
          },
          (errLow) => {
            let msg = 'تعذر الحصول على موقع GPS';
            if (errLow.code === errLow.PERMISSION_DENIED) {
              msg = 'تم رفض إذن الوصول إلى موقع GPS في المتصفح. يرجى تفعيل إذن الموقع (Location) من إعدادات المتصفح أو قفل شريط العنوان';
            } else if (errLow.code === errLow.POSITION_UNAVAILABLE) {
              msg = 'خدمة الموقع غير متوفرة حالياً، يرجى تشغيل الـ GPS بالهاتف';
            } else if (errLow.code === errLow.TIMEOUT) {
              msg = 'انتهت مهلة طلب تحديد موقع GPS. يرجى المحاولة مجدداً';
            }
            reject(new Error(msg));
          },
          {
            enableHighAccuracy: false,
            timeout: 9000,
            maximumAge: 300000
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 10000
      }
    );
  });
}

/**
 * الحساب الدقيق للتأخير المحتسب وفترة السماح
 * قاعدة النظام:
 * إذا حضر الموظف خلال فترة السماح (مثلاً حتى 07:15) => التأخير المحتسب = 0
 * إذا تجاوز فترة السماح (مثلاً 07:16) => يحسب التأخير بالكامل من بداية الدوام (16 دقيقة) وليس الفرق عن فترة السماح!
 */
function calculateLateTiming(checkInDate, workSettings) {
  const arrivalSeconds = checkInDate.getHours() * 3600 + checkInDate.getMinutes() * 60 + checkInDate.getSeconds();
  const startSeconds = timeStringToSeconds(workSettings.startTime);
  const graceSeconds = (Number(workSettings.gracePeriodMinutes) || 0) * 60;

  // إذا وصل قبل أو عند بداية الدوام
  if (arrivalSeconds <= startSeconds) {
    return {
      isLate: false,
      lateSeconds: 0,
      chargeableLateSeconds: 0
    };
  }

  // الفرق الفعلي بالثواني عن بداية الدوام
  const actualLateSeconds = arrivalSeconds - startSeconds;

  // التحقق من فترة السماح
  if (actualLateSeconds <= graceSeconds) {
    // داخل فترة السماح: يسجل التأخير الفعلي ولكن التأخير المحتسب للخصم = 0
    return {
      isLate: false,
      lateSeconds: actualLateSeconds,
      chargeableLateSeconds: 0
    };
  } else {
    // تجاوز فترة السماح: يحتسب كامل المدة من بداية الدوام الرسمي!
    return {
      isLate: true,
      lateSeconds: actualLateSeconds,
      chargeableLateSeconds: actualLateSeconds
    };
  }
}

/**
 * حساب المغادرة المبكرة بالثواني
 */
function calculateEarlyDeparture(checkOutDate, workSettings) {
  const exitSeconds = checkOutDate.getHours() * 3600 + checkOutDate.getMinutes() * 60 + checkOutDate.getSeconds();
  const endSeconds = timeStringToSeconds(workSettings.endTime);

  if (exitSeconds < endSeconds) {
    return {
      isEarly: true,
      earlyLeaveSeconds: endSeconds - exitSeconds
    };
  }

  return {
    isEarly: false,
    earlyLeaveSeconds: 0
  };
}

/**
 * حساب قيمة الخصم بناءً على التأخير المحتسب وراتب الموظف وإعدادات الرواتب
 */
function calculateDeductionAmount(chargeableLateSeconds, monthlySalary, salarySettings) {
  if (!chargeableLateSeconds || chargeableLateSeconds <= 0 || !monthlySalary || monthlySalary <= 0) {
    return 0;
  }

  const approvedDays = Number(salarySettings.approvedMonthDays) || 30;
  const dailyHours = Number(salarySettings.dailyWorkHours) || 7;

  // المعادلات المالية الدقيقة
  const dailyWage = monthlySalary / approvedDays;
  const hourlyWage = dailyWage / dailyHours;
  const minuteWage = hourlyWage / 60;

  let lateMinutes = 0;
  const method = salarySettings.roundingMethod || 'exact_seconds';

  switch (method) {
    case 'round_minute':
      lateMinutes = Math.round(chargeableLateSeconds / 60);
      break;
    case 'floor_minute':
      lateMinutes = Math.floor(chargeableLateSeconds / 60);
      break;
    case 'ceil_minute':
      lateMinutes = Math.ceil(chargeableLateSeconds / 60);
      break;
    case 'exact_seconds':
    default:
      lateMinutes = chargeableLateSeconds / 60;
      break;
  }

  const deduction = lateMinutes * minuteWage;
  return Number(deduction.toFixed(2));
}

/**
 * تسجيل الحضور الفعلي للموظف (Check-in)
 * زر: 🟢 تحقق في
 */
async function performCheckIn(employeeId) {
  if (!employeeId) {
    showToast('رقم الموظف غير محدد', 'danger');
    return false;
  }

  const todayStr = dateToDayString(new Date());
  const recordId = `${employeeId}_${todayStr}`;

  try {
    showToast('جاري التحقق من موقع GPS وقواعد الدوام...', 'info');

    // 1. التحقق من عدم وجود حضور مسبق لهذا اليوم لمنع التكرار
    const existingDoc = await db.collection('attendance').doc(recordId).get();
    if (existingDoc.exists && existingDoc.data().checkIn) {
      showToast('لقد قمت بتسجيل الحضور مسبقاً لهذا اليوم!', 'warning', 'حضور مسجل');
      return false;
    }

    // 2. جلب بيانات الموظف، إعدادات GPS، إعدادات ساعات العمل، وإعدادات الرواتب
    const [empDoc, gpsSettings, workSettings, salarySettings] = await Promise.all([
      db.collection('employees').doc(employeeId).get(),
      getGpsSettings(),
      getWorkSettings(),
      getSalarySettings()
    ]);

    if (!empDoc.exists) {
      showToast('بيانات الموظف غير موجودة في النظام', 'danger');
      return false;
    }

    const employee = empDoc.data();
    if (employee.status === 'inactive') {
      showToast('حساب هذا الموظف معطل، لا يمكن تسجيل الحضور', 'danger');
      return false;
    }

    // 3. الحصول على موقع جهاز الموظف والتحقق من النطاق الجغرافي أو السحابي
    const allowAnywhere = Boolean(gpsSettings.allowAnywhere) || Number(gpsSettings.radius) <= 0;
    let devicePos = { latitude: null, longitude: null, accuracy: 0 };
    let distanceMeters = 0;

    try {
      devicePos = await getCurrentDevicePosition();
      distanceMeters = calculateHaversineDistance(
        devicePos.latitude,
        devicePos.longitude,
        gpsSettings.latitude,
        gpsSettings.longitude
      );
    } catch (gpsErr) {
      if (!allowAnywhere) {
        throw new Error(`تعذر تحديد موقع GPS: ${gpsErr.message}. يرجى تفعيل الموقع للتسجيل من داخل المقر.`);
      }
      console.warn('تجاوز خطأ GPS بسبب تفعيل خيار الحضور السحابي من أي مكان:', gpsErr.message);
    }

    // التحقق من النطاق الجغرافي إذا كان التحقق الصارم مفعلاً
    const allowedRadius = Number(gpsSettings.radius) || 100;
    if (!allowAnywhere && distanceMeters > allowedRadius) {
      const errorMsg = `🔴 لا يمكن تسجيل الحضور! أنت على بعد (${distanceMeters} متر) من المؤسسة. النطاق الأقصى المسموح به هو (${allowedRadius} متر). يرجى التواجد داخل مقر المؤسسة.`;
      showToast(errorMsg, 'danger', 'خارج النطاق الجغرافي');
      return false;
    }

    // 6. الحساب الدقيق للتأخير والخصم
    const now = new Date();
    const lateInfo = calculateLateTiming(now, workSettings);
    const deduction = calculateDeductionAmount(lateInfo.chargeableLateSeconds, employee.salary, salarySettings);

    // 7. صياغة وثيقة الحضور وحفظها في Firestore
    const attendanceData = {
      employeeId: employeeId,
      employeeName: employee.name,
      employeeUsername: employee.username || '',
      date: todayStr,
      checkIn: getServerTimestamp(),
      checkInTimeStr: dateToTimeString(now),
      checkOut: null,
      checkOutTimeStr: null,
      
      // بيانات GPS أو الحضور السحابي
      latitude: devicePos.latitude,
      longitude: devicePos.longitude,
      accuracy: devicePos.accuracy,
      distance: distanceMeters,
      isRemoteCheckIn: allowAnywhere && (distanceMeters > allowedRadius || !devicePos.latitude),
      
      // بيانات التأخير والخصم
      lateSeconds: lateInfo.lateSeconds,
      chargeableLateSeconds: lateInfo.chargeableLateSeconds,
      lateDeduction: deduction,
      excuseApproved: false,
      excuseId: null,
      earlyLeaveSeconds: 0,
      
      status: lateInfo.isLate ? 'late' : 'present',
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp()
    };

    await db.collection('attendance').doc(recordId).set(attendanceData, { merge: true });

    // تسجيل في Audit Log
    const locDesc = attendanceData.isRemoteCheckIn ? 'تسجيل سحابي من أي مكان' : `داخل المقر (${distanceMeters}م)`;
    let logMsg = `حضور عادي في الوقت المحدد (${locDesc})`;
    if (lateInfo.isLate) {
      logMsg = `حضور متأخر (${formatSecondsToArabicDuration(lateInfo.chargeableLateSeconds)}) - الخصم: ${formatCurrency(deduction)} (${locDesc})`;
    }
    await logActivity('تسجيل حضور', `الموظف: ${employee.name} - ${logMsg}`);

    // إشعار نجاح فوري للموظف
    const successMsg = `🟢 تم تسجيل الحضور بنجاح | الوقت: ${formatDisplayTime(now)} | الموقع: ${locDesc}`;
    showToast(successMsg, 'success', 'تسجيل حضور ناجح');

    return true;
  } catch (error) {
    console.error('خطأ تسجيل الحضور:', error);
    showToast(error.message || 'فشل تسجيل الحضور. يرجى المحاولة ثانية', 'danger');
    return false;
  }
}

/**
 * تسجيل الانصراف الفعلي للموظف (Check-out)
 * زر: 🟠 الدفع
 */
async function performCheckOut(employeeId) {
  if (!employeeId) {
    showToast('رقم الموظف غير محدد', 'danger');
    return false;
  }

  const todayStr = dateToDayString(new Date());
  const recordId = `${employeeId}_${todayStr}`;

  try {
    showToast('جاري التحقق من موقع GPS والانصراف...', 'info');

    // 1. التحقق من وجود تسجيل حضور مسبق لهذا اليوم
    const attDoc = await db.collection('attendance').doc(recordId).get();
    if (!attDoc.exists || !attDoc.data().checkIn) {
      showToast('لا يمكنك تسجيل الانصراف بدون تسجيل حضور أولاً!', 'warning', 'تنبيه');
      return false;
    }

    const currentRecord = attDoc.data();
    if (currentRecord.checkOut) {
      showToast('تم تسجيل الانصراف مسبقاً لهذا اليوم!', 'warning', 'انصراف مسجل');
      return false;
    }

    // 2. جلب إعدادات GPS وساعات العمل
    const [gpsSettings, workSettings] = await Promise.all([
      getGpsSettings(),
      getWorkSettings()
    ]);

    // 3. الحصول على موقع الجهاز
    const allowAnywhere = Boolean(gpsSettings.allowAnywhere) || Number(gpsSettings.radius) <= 0;
    let devicePos = { latitude: null, longitude: null, accuracy: 0 };
    let distanceMeters = 0;

    try {
      devicePos = await getCurrentDevicePosition();
      distanceMeters = calculateHaversineDistance(
        devicePos.latitude,
        devicePos.longitude,
        gpsSettings.latitude,
        gpsSettings.longitude
      );
    } catch (gpsErr) {
      if (!allowAnywhere) {
        throw new Error(`تعذر تحديد موقع GPS: ${gpsErr.message}. يرجى تفعيل الموقع للانصراف داخل المقر.`);
      }
      console.warn('تجاوز GPS بسبب تفعيل الحضور السحابي:', gpsErr.message);
    }

    // 5. التحقق من النطاق
    const allowedRadius = Number(gpsSettings.radius) || 100;
    if (!allowAnywhere && distanceMeters > allowedRadius) {
      const errorMsg = `🔴 لا يمكن تسجيل الانصراف! أنت على بعد (${distanceMeters} متر) من المؤسسة. النطاق المسموح به هو (${allowedRadius} متر).`;
      showToast(errorMsg, 'danger', 'خارج النطاق الجغرافي');
      return false;
    }

    // 6. حساب المغادرة المبكرة
    const now = new Date();
    const earlyInfo = calculateEarlyDeparture(now, workSettings);

    // 7. تحديث وثيقة الحضور في Firestore
    const locDesc = (allowAnywhere && (distanceMeters > allowedRadius || !devicePos.latitude))
      ? 'انصراف سحابي من أي مكان'
      : `داخل المقر (${distanceMeters}م)`;

    const updateData = {
      checkOut: getServerTimestamp(),
      checkOutTimeStr: dateToTimeString(now),
      checkOutLocation: {
        latitude: devicePos.latitude,
        longitude: devicePos.longitude,
        accuracy: devicePos.accuracy,
        distance: distanceMeters
      },
      earlyLeaveSeconds: earlyInfo.earlyLeaveSeconds,
      updatedAt: getServerTimestamp()
    };

    await db.collection('attendance').doc(recordId).update(updateData);

    const logDetails = earlyInfo.isEarly
      ? `انصراف مبكر بمقدار (${formatSecondsToArabicDuration(earlyInfo.earlyLeaveSeconds)}) - ${locDesc}`
      : `انصراف نظامي في نهاية الدوام - ${locDesc}`;
    await logActivity('تسجيل انصراف', `الموظف: ${currentRecord.employeeName} - ${logDetails}`);

    showToast(`🟠 تم تسجيل الانصراف بنجاح | الوقت: ${formatDisplayTime(now)} | الموقع: ${locDesc}`, 'success', 'تسجيل انصراف');
    return true;
  } catch (error) {
    console.error('خطأ تسجيل الانصراف:', error);
    showToast(error.message || 'فشل تسجيل الانصراف. يرجى المحاولة ثانية', 'danger');
    return false;
  }
}

/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * الأدوات والدوال المساعدة المشتركة (utils.js)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

// ==========================================
// 0. إدارة وتطبيق الشعار المؤسسي الموحد (System Logo Manager)
// ==========================================

function applySystemLogo(overrideUrl = null) {
  let logoUrl = overrideUrl;
  if (!logoUrl) {
    logoUrl = localStorage.getItem('alfajr_custom_logo') || 'assets/logo.svg';
  }
  
  if (overrideUrl) {
    try {
      localStorage.setItem('alfajr_custom_logo', overrideUrl);
    } catch (e) {
      console.warn('تخزين الشعار محلياً:', e);
    }
  }

  // تحديث كافة عناصر الشعار في كافة الصفحات والتقارير والطباعة
  const logoElements = document.querySelectorAll('.login-logo, .sidebar-logo, .print-logo, #site-logo, #main-login-logo, #header-logo, #setting-logo-preview, .splash-logo');
  logoElements.forEach(img => {
    if (img && img.src !== logoUrl) {
      img.src = logoUrl;
    }
  });
}

// ==========================================
// 1. نظام الساعة المباشرة والوقت والتاريخ (Asia/Aden UTC+3)
// ==========================================

function startLiveClock() {
  function updateClock() {
    const now = new Date();
    
    // خيارات توقيت آسيا/عدن
    const timeOptions = {
      timeZone: 'Asia/Aden',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };

    const dateOptions = {
      timeZone: 'Asia/Aden',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };

    const timeString = new Intl.DateTimeFormat('ar-YE', timeOptions).format(now);
    const dateString = new Intl.DateTimeFormat('ar-YE', dateOptions).format(now);

    // تحديث كافة العناصر التي تحتوي على كلاس أو معرف الساعة
    const timeElements = document.querySelectorAll('.live-time, #live-clock-time');
    const dateElements = document.querySelectorAll('.live-date, #live-clock-date');

    timeElements.forEach(el => el.textContent = timeString);
    dateElements.forEach(el => el.textContent = dateString);
  }

  updateClock();
  setInterval(updateClock, 1000);
}

// تشغيل الساعة وتطبيق الشعار المعتمد تلقائياً عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  applySystemLogo();
  startLiveClock();
});

// ==========================================
// 2. نظام التنبيهات المنبثقة (Toast Notifications)
// ==========================================

function getToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

function showToast(message, type = 'success', title = '') {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let defaultTitle = 'إشعار';
  let icon = 'ℹ️';

  if (type === 'success') {
    defaultTitle = 'عملية ناجحة';
    icon = '🟢';
  } else if (type === 'warning') {
    defaultTitle = 'تنبيه';
    icon = '🟠';
  } else if (type === 'danger') {
    defaultTitle = 'خطأ';
    icon = '🔴';
  }

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <div class="toast-content">
      <div class="toast-title">${title || defaultTitle}</div>
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  // إظهار التوست بحركة سلسة
  setTimeout(() => toast.classList.add('show'), 20);

  // إخفاء وحذف التوست بعد 4.5 ثانية
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, 4500);
}

// ==========================================
// 3. نافذة التأكيد المنبثقة (Confirm Modal)
// ==========================================

function showConfirmModal(title, message, confirmBtnText = 'تأكيد الحذف', onConfirm, isDanger = true) {
  let modalOverlay = document.getElementById('global-confirm-modal');
  if (!modalOverlay) {
    modalOverlay = document.createElement('div');
    modalOverlay.id = 'global-confirm-modal';
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = `
      <div class="modal-container" style="max-width: 420px;">
        <div class="modal-header">
          <h3 class="modal-title" id="confirm-modal-title">تأكيد العملية</h3>
          <button class="modal-close" onclick="closeConfirmModal()">&times;</button>
        </div>
        <div class="modal-body" id="confirm-modal-message">
          هل أنت متأكد من تنفيذ هذا الإجراء؟
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline btn-sm" onclick="closeConfirmModal()">إلغاء</button>
          <button class="btn btn-danger btn-sm" id="confirm-modal-action-btn">حذف</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalOverlay);
  }

  const titleEl = document.getElementById('confirm-modal-title');
  const msgEl = document.getElementById('confirm-modal-message');
  const actionBtn = document.getElementById('confirm-modal-action-btn');

  titleEl.textContent = title;
  msgEl.textContent = message;
  actionBtn.textContent = confirmBtnText;

  if (isDanger) {
    actionBtn.className = 'btn btn-danger btn-sm';
  } else {
    actionBtn.className = 'btn btn-primary btn-sm';
  }

  // ربط إجراء التأكيد
  actionBtn.onclick = async () => {
    closeConfirmModal();
    if (typeof onConfirm === 'function') {
      await onConfirm();
    }
  };

  modalOverlay.classList.add('active');
}

function closeConfirmModal() {
  const modal = document.getElementById('global-confirm-modal');
  if (modal) modal.classList.remove('active');
}

// ==========================================
// 4. معادلة Haversine لحساب المسافة الجغرافية (GPS)
// ==========================================

/**
 * حساب المسافة بين نقطتين جغرافيتين بالأمتار
 * @param {number} lat1 خط عرض النقطة الأولى
 * @param {number} lon1 خط طول النقطة الأولى
 * @param {number} lat2 خط عرض النقطة الثانية
 * @param {number} lon2 خط طول النقطة الثانية
 * @returns {number} المسافة بالمتر
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // نصف قطر الأرض بالمتر
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // تقريب لأقرب متر
}

// ==========================================
// 5. حسابات وتحويل الوقت والثواني
// ==========================================

/**
 * تحويل نص وقت بصيغة HH:mm:ss أو HH:mm إلى إجمالي الثواني منذ بداية اليوم
 */
function timeStringToSeconds(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const seconds = parts[2] || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * تحويل تاريخ أو كائن Date إلى نص وقت HH:mm:ss
 */
function dateToTimeString(dateObj) {
  if (!dateObj) return "--:--:--";
  const d = (dateObj instanceof Date) ? dateObj : (dateObj.toDate ? dateObj.toDate() : new Date(dateObj));
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * تحويل تاريخ أو كائن Date إلى تاريخ YYYY-MM-DD
 */
function dateToDayString(dateObj) {
  if (!dateObj) return "";
  const d = (dateObj instanceof Date) ? dateObj : (dateObj.toDate ? dateObj.toDate() : new Date(dateObj));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * تنسيق مدة بالثواني إلى نص عربي مقروء (مثال: 16 دقيقة و35 ثانية)
 */
function formatSecondsToArabicDuration(totalSeconds) {
  if (!totalSeconds || totalSeconds <= 0) return "لا يوجد";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts = [];
  if (hours > 0) parts.push(`${hours} ساعة`);
  if (minutes > 0) parts.push(`${minutes} دقيقة`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds} ثانية`);

  return parts.join(' و ');
}

/**
 * تنسيق الوقت للعرض باللغة العربية مع صباحاً/مساءً
 */
function formatDisplayTime(dateObj) {
  if (!dateObj) return "—";
  const d = (dateObj instanceof Date) ? dateObj : (dateObj.toDate ? dateObj.toDate() : new Date(dateObj));
  return new Intl.DateTimeFormat('ar-YE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(d);
}

/**
 * تنسيق التاريخ للعرض باللغة العربية
 */
function formatDisplayDate(dateObj) {
  if (!dateObj) return "—";
  const d = (dateObj instanceof Date) ? dateObj : (dateObj.toDate ? dateObj.toDate() : new Date(dateObj));
  return new Intl.DateTimeFormat('ar-YE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

// ==========================================
// 6. تنسيق المبالغ المالية والأرقام
// ==========================================

function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return new Intl.NumberFormat('ar-YE', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(num) + ' ريال';
}

function formatNumber(num, decimals = 2) {
  return Number(num || 0).toLocaleString('ar-YE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// ==========================================
// 7. توثيق سجل النشاط (Activity Log)
// ==========================================

async function logActivity(action, details, oldData = null, newData = null) {
  if (!db) return;
  try {
    const currentUser = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;
    const username = localStorage.getItem('alfajr_username') || (currentUser ? currentUser.email.split('@')[0] : 'نظام');

    await db.collection('activityLogs').add({
      username: username,
      action: action,
      details: details,
      oldData: oldData || null,
      newData: newData || null,
      timestamp: getServerTimestamp(),
      dateStr: dateToDayString(new Date()),
      timeStr: dateToTimeString(new Date())
    });
  } catch (err) {
    console.error('فشل حفظ سجل النشاط:', err);
  }
}

// ==========================================
// 8. تصدير الجداول إلى CSV (Excel)
// ==========================================

function exportTableToCSV(tableId, filename = 'تقرير_مؤسسة_الفجر.csv') {
  const table = document.getElementById(tableId);
  if (!table) {
    showToast('الجدول المطلوب تصديره غير موجود', 'warning');
    return;
  }

  let csvContent = "\uFEFF"; // BOM لضمان قراءة اللغة العربية بشكل سليم في Excel
  const rows = table.querySelectorAll('tr');

  rows.forEach(row => {
    // تجاهل الأزرار أو الإجراءات في أعمدة العمليات
    const cols = row.querySelectorAll('th, td');
    const rowData = [];
    cols.forEach(col => {
      // إهمال عمود الإجراءات أو الأزرار
      if (col.classList.contains('no-export') || col.querySelector('button, .btn')) return;
      let text = col.innerText.replace(/"/g, '""').trim();
      rowData.push(`"${text}"`);
    });
    if (rowData.length > 0) {
      csvContent += rowData.join(',') + "\r\n";
    }
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('تم تصدير التقرير بنجاح بصيغة CSV', 'success');
}

/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * وحدة تحكم لوحة الإدارة الشاملة (admin.js)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

let allEmployees = [];
let allLeaveTypes = [];
let currentActiveView = 'dashboard';

document.addEventListener('DOMContentLoaded', async () => {
  // التحقق من الصلاحيات وحماية الصفحة
  protectPage('admin');

  // تهيئة الواجهة وعناصر التحكم
  setupNavigation();
  setupEventListeners();

  // تحميل البيانات الأولية
  await refreshAllData();
});

// ==========================================
// 1. التنقل بين أقسام لوحة الإدارة
// ==========================================

function toggleSidebar(forceState = null) {
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

function setupNavigation() {
  const navLinks = document.querySelectorAll('.sidebar-menu .nav-link');
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = link.getAttribute('data-view');
      if (targetView) {
        switchView(targetView);
        // في الشاشات الصغيرة، نغلق القائمة الجانبية بعد الضغط
        if (window.innerWidth <= 992) {
          toggleSidebar(false);
        }
      }
    });
  });

  // زر فتح/إغلاق القائمة الجانبية على الهاتف
  const menuToggle = document.getElementById('menu-toggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSidebar();
    });
  }

  // إغلاق القائمة عند النقر على الخلفية المعتمة
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      toggleSidebar(false);
    });
  }
}

function switchView(viewName) {
  currentActiveView = viewName;

  // تحديث تمييز القائمة الجانبية
  document.querySelectorAll('.sidebar-menu .nav-link').forEach(link => {
    if (link.getAttribute('data-view') === viewName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  // إظهار القسم المطلوب وإخفاء البقية
  document.querySelectorAll('.view-section').forEach(section => {
    if (section.id === `view-${viewName}`) {
      section.style.display = 'block';
    } else {
      section.style.display = 'none';
    }
  });

  // تحديث عنوان الصفحة في الشريط العلوي
  const titles = {
    dashboard: '🏠 لوحة التحكم والإحصائيات المباشرة',
    employees: '👥 إدارة شؤون الموظفين',
    attendance: '📋 سجل الحضور والانصراف الميداني',
    leaves: '🏖️ إدارة طلبات الإجازات والأرصدة',
    excuses: '📝 مراجعة طلبات الأعذار',
    salaries: '💰 جدول الرواتب ومسيرات الخصومات',
    reports: '📊 التقارير الرسمية والطباعة والتصدير',
    activity: '📜 سجل النشاط والتدقيق الإداري (Audit Log)',
    settings: '⚙️ إعدادات النظام والمؤسسة'
  };

  const titleEl = document.getElementById('page-title-text');
  if (titleEl && titles[viewName]) {
    titleEl.textContent = titles[viewName];
  }

  // تحميل أو تحديث بيانات القسم المحدد
  if (viewName === 'dashboard') loadDashboardStats();
  if (viewName === 'employees') renderEmployeesTable();
  if (viewName === 'attendance') loadAttendanceTable();
  if (viewName === 'leaves') loadLeavesTable();
  if (viewName === 'excuses') loadExcusesTable();
  if (viewName === 'salaries') loadSalariesTable();
  if (viewName === 'activity') loadActivityLogs();
  if (viewName === 'settings') populateSettingsForms();
}

// ==========================================
// 2. تحديث وتحميل كافة البيانات
// ==========================================

async function refreshAllData() {
  try {
    await Promise.all([
      loadEmployeesData(),
      loadLeaveTypesData()
    ]);

    await loadDashboardStats();
    populateEmployeeDropdowns();
  } catch (err) {
    console.error('خطأ تحديث البيانات:', err);
  }
}

async function loadEmployeesData() {
  try {
    const snap = await db.collection('employees').orderBy('createdAt', 'desc').get();
    allEmployees = [];
    snap.forEach(doc => allEmployees.push({ id: doc.id, ...doc.data() }));
  } catch (e) {
    console.warn('فشل جلب الموظفين:', e);
  }
}

async function loadLeaveTypesData() {
  try {
    allLeaveTypes = await getLeaveTypes();
  } catch (e) {
    console.warn('فشل جلب أنواع الإجازات:', e);
  }
}

// ==========================================
// 3. لوحة التحكم والإحصائيات المباشرة (Dashboard)
// ==========================================

async function loadDashboardStats() {
  try {
    const todayStr = dateToDayString(new Date());

    // استعلام حضور اليوم
    const attSnap = await db.collection('attendance').where('date', '==', todayStr).get();
    let presentCount = 0;
    let lateCount = 0;
    let totalDeductionsToday = 0;

    attSnap.forEach(doc => {
      const d = doc.data();
      if (d.checkIn) {
        presentCount++;
        if (d.lateSeconds > 0 && d.chargeableLateSeconds > 0 && !d.excuseApproved) {
          lateCount++;
        }
        totalDeductionsToday += (d.lateDeduction || 0);
      }
    });

    const totalEmployees = allEmployees.filter(e => e.status !== 'inactive').length;
    const absentCount = Math.max(0, totalEmployees - presentCount);

    // استعلام طلبات الإجازات المعلقة
    const pendingLeavesSnap = await db.collection('leaves').where('status', '==', 'pending').get();
    const pendingLeavesCount = pendingLeavesSnap.size;

    // استعلام طلبات الأعذار المعلقة
    const pendingExcusesSnap = await db.collection('excuses').where('status', '==', 'pending').get();
    const pendingExcusesCount = pendingExcusesSnap.size;

    // تحديث بطاقات الـ KPIs
    document.getElementById('kpi-total-employees').textContent = allEmployees.length;
    document.getElementById('kpi-present-today').textContent = presentCount;
    document.getElementById('kpi-late-today').textContent = lateCount;
    document.getElementById('kpi-absent-today').textContent = absentCount;
    document.getElementById('kpi-pending-leaves').textContent = pendingLeavesCount;
    document.getElementById('kpi-pending-excuses').textContent = pendingExcusesCount;
    document.getElementById('kpi-total-deductions').textContent = formatCurrency(totalDeductionsToday);

    // تحديث شارات التنبيه في الشريط الجانبي
    const leaveBadge = document.getElementById('sidebar-badge-leaves');
    if (leaveBadge) {
      leaveBadge.textContent = pendingLeavesCount > 0 ? pendingLeavesCount : '';
      leaveBadge.style.display = pendingLeavesCount > 0 ? 'inline-block' : 'none';
    }

    const excuseBadge = document.getElementById('sidebar-badge-excuses');
    if (excuseBadge) {
      excuseBadge.textContent = pendingExcusesCount > 0 ? pendingExcusesCount : '';
      excuseBadge.style.display = pendingExcusesCount > 0 ? 'inline-block' : 'none';
    }

    // رسم ملخص الحضور البصري
    renderDashboardOverviewChart(presentCount, lateCount, absentCount);

    // تحميل آخر النشاطات والطلبات
    loadRecentActivityFeed();
  } catch (err) {
    console.error('فشل تحميل إحصائيات لوحة التحكم:', err);
  }
}

function renderDashboardOverviewChart(present, late, absent) {
  const container = document.getElementById('dashboard-chart-visual');
  if (!container) return;

  const total = (present + absent) || 1;
  const presentPct = Math.round(((present - late) / total) * 100);
  const latePct = Math.round((late / total) * 100);
  const absentPct = Math.round((absent / total) * 100);

  container.innerHTML = `
    <div style="display: flex; height: 28px; border-radius: 14px; overflow: hidden; margin-bottom: 1.25rem; background: #e2e8f0;">
      <div style="width: ${presentPct}%; background-color: #16a34a; transition: width 0.5s;" title="حاضر في الموعد: ${presentPct}%"></div>
      <div style="width: ${latePct}%; background-color: #ea580c; transition: width 0.5s;" title="متأخر: ${latePct}%"></div>
      <div style="width: ${absentPct}%; background-color: #dc2626; transition: width 0.5s;" title="غائب: ${absentPct}%"></div>
    </div>
    <div style="display: flex; justify-content: space-around; flex-wrap: wrap; gap: 0.5rem; font-size: 0.88rem;">
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="width: 12px; height: 12px; border-radius: 3px; background: #16a34a; display: inline-block;"></span>
        <span>حاضر في الموعد (${present - late})</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="width: 12px; height: 12px; border-radius: 3px; background: #ea580c; display: inline-block;"></span>
        <span>متأخر (${late})</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="width: 12px; height: 12px; border-radius: 3px; background: #dc2626; display: inline-block;"></span>
        <span>غائب (${absent})</span>
      </div>
    </div>
  `;
}

async function loadRecentActivityFeed() {
  const feedContainer = document.getElementById('dashboard-recent-activity');
  if (!feedContainer) return;

  try {
    const snap = await db.collection('activityLogs').orderBy('timestamp', 'desc').limit(6).get();
    if (snap.empty) {
      feedContainer.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 1rem;">لا توجد نشاطات مسجلة حتى الآن</div>';
      return;
    }

    let html = '';
    snap.forEach(doc => {
      const d = doc.data();
      html += `
        <div style="display: flex; align-items: flex-start; gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border);">
          <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--primary); margin-top: 8px;"></div>
          <div style="flex: 1;">
            <div style="font-weight: 700; font-size: 0.9rem;">${d.action} <small style="color: var(--text-muted); font-weight: 400;">(بواسطة ${d.username})</small></div>
            <div style="font-size: 0.82rem; color: var(--text-muted);">${d.details}</div>
            <div style="font-size: 0.75rem; color: var(--text-light); margin-top: 2px;">${d.dateStr} - ${d.timeStr}</div>
          </div>
        </div>
      `;
    });
    feedContainer.innerHTML = html;
  } catch (e) {
    console.warn(e);
  }
}

// ==========================================
// 4. إدارة شؤون الموظفين (Employees CRUD)
// ==========================================

function renderEmployeesTable(filtered = null) {
  const tbody = document.getElementById('employees-table-body');
  if (!tbody) return;

  const list = filtered || allEmployees;

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">لا يوجد موظفون مطابقون للبحث</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((emp, index) => {
    const statusBadge = emp.status === 'inactive'
      ? `<span class="badge badge-danger">معطل</span>`
      : `<span class="badge badge-success">نشط</span>`;

    return `
      <tr>
        <td><strong>${index + 1}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--primary-dark);">${emp.name}</div>
          <small style="color: var(--text-muted);">${emp.username || '—'}</small>
        </td>
        <td>${emp.jobTitle || 'موظف'}</td>
        <td style="direction: ltr; text-align: right;">${emp.phone || '—'}</td>
        <td><strong>${formatCurrency(emp.salary)}</strong></td>
        <td>
          <span style="color: var(--primary-dark); font-weight: 700;">${emp.remainingLeave ?? emp.annualLeaveBalance ?? 30}</span> 
          / <span style="color: var(--text-muted);">${emp.annualLeaveBalance ?? 30}</span> يوم
        </td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-outline-primary btn-sm" onclick="viewEmployeeProfile('${emp.id}')" title="عرض الملف والرواتب والحضور">👤 الملف</button>
            <button class="btn btn-outline btn-sm" onclick="editEmployee('${emp.id}')" title="تعديل">✏️</button>
            <button class="btn btn-sm ${emp.status === 'inactive' ? 'btn-primary' : 'btn-outline'}" onclick="toggleEmployeeStatus('${emp.id}', '${emp.status}')" title="${emp.status === 'inactive' ? 'تفعيل' : 'تعطيل'}">
              ${emp.status === 'inactive' ? 'تنشيط' : 'تعطيل'}
            </button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteEmployee('${emp.id}', '${emp.name}')" title="حذف">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterEmployees() {
  const query = (document.getElementById('search-employee-input')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('filter-employee-status')?.value || 'all';

  const filtered = allEmployees.filter(emp => {
    const matchQuery = (emp.name && emp.name.toLowerCase().includes(query)) ||
                       (emp.jobTitle && emp.jobTitle.toLowerCase().includes(query)) ||
                       (emp.phone && emp.phone.includes(query)) ||
                       (emp.username && emp.username.toLowerCase().includes(query));

    const matchStatus = (statusFilter === 'all') || (emp.status === statusFilter);

    return matchQuery && matchStatus;
  });

  renderEmployeesTable(filtered);
}

// فتح نافذة إضافة موظف جديد
function openAddEmployeeModal() {
  document.getElementById('employee-modal-title').textContent = '➕ إضافة موظف جديد';
  document.getElementById('emp-id').value = '';
  document.getElementById('emp-name').value = '';
  document.getElementById('emp-job').value = '';
  document.getElementById('emp-phone').value = '';
  document.getElementById('emp-username').value = '';
  document.getElementById('emp-password').value = '';
  document.getElementById('emp-password-group').style.display = 'block';
  document.getElementById('emp-start-date').value = dateToDayString(new Date());
  document.getElementById('emp-salary').value = '120000';
  document.getElementById('emp-leave-balance').value = '30';
  document.getElementById('emp-status').value = 'active';

  document.getElementById('employee-modal').classList.add('active');
}

// فتح نافذة تعديل موظف
function editEmployee(employeeId) {
  const emp = allEmployees.find(e => e.id === employeeId);
  if (!emp) return;

  document.getElementById('employee-modal-title').textContent = '✏️ تعديل بيانات الموظف';
  document.getElementById('emp-id').value = emp.id;
  document.getElementById('emp-name').value = emp.name || '';
  document.getElementById('emp-job').value = emp.jobTitle || '';
  document.getElementById('emp-phone').value = emp.phone || '';
  document.getElementById('emp-username').value = emp.username || '';
  document.getElementById('emp-password-group').style.display = 'none'; // كلمة المرور لا تعدل من هنا
  document.getElementById('emp-start-date').value = emp.startDate || dateToDayString(new Date());
  document.getElementById('emp-salary').value = emp.salary || 0;
  document.getElementById('emp-leave-balance').value = emp.annualLeaveBalance || 30;
  document.getElementById('emp-status').value = emp.status || 'active';

  document.getElementById('employee-modal').classList.add('active');
}

// حفظ نموذج الموظف (إضافة أو تعديل)
async function handleSaveEmployeeForm(e) {
  e.preventDefault();

  const id = document.getElementById('emp-id').value;
  const name = document.getElementById('emp-name').value.trim();
  const jobTitle = document.getElementById('emp-job').value.trim();
  const phone = document.getElementById('emp-phone').value.trim();
  const username = document.getElementById('emp-username').value.trim().toLowerCase();
  const password = document.getElementById('emp-password').value;
  const startDate = document.getElementById('emp-start-date').value;
  const salary = Number(document.getElementById('emp-salary').value) || 0;
  const annualLeaveBalance = Number(document.getElementById('emp-leave-balance').value) || 30;
  const status = document.getElementById('emp-status').value;

  if (!name || !username) {
    showToast('يرجى ملء الاسم واسم المستخدم على الأقل', 'warning');
    return;
  }

  try {
    if (!id) {
      // إضافة موظف جديد
      if (!password || password.length < 6) {
        showToast('كلمة المرور مطلوبة ويجب ألا تقل عن 6 خانات', 'warning');
        return;
      }

      // 1. إنشاء الحساب في Firebase Auth
      const email = usernameToEmail(username);
      let authUid = null;
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        authUid = cred.user.uid;
      } catch (authErr) {
        if (authErr.code === 'auth/email-already-in-use') {
          showToast('اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم مستخدم آخر', 'danger');
          return;
        }
        throw authErr;
      }

      // 2. إنشاء وثيقة الموظف في Firestore
      const newEmpRef = db.collection('employees').doc(authUid);
      const newEmpData = {
        name,
        jobTitle,
        phone,
        username,
        email,
        startDate,
        salary,
        annualLeaveBalance,
        usedLeave: 0,
        remainingLeave: annualLeaveBalance,
        status,
        createdAt: getServerTimestamp(),
        updatedAt: getServerTimestamp()
      };

      await newEmpRef.set(newEmpData);

      // 3. إنشاء وثيقة المستخدم في مجموعة users
      await db.collection('users').doc(authUid).set({
        uid: authUid,
        username,
        email,
        name,
        role: 'employee',
        employeeId: authUid,
        phone,
        status,
        createdAt: getServerTimestamp()
      });

      // 4. تسجيل الراتب في salaryHistory
      await db.collection('salaryHistory').add({
        employeeId: authUid,
        employeeName: name,
        oldSalary: 0,
        newSalary: salary,
        changedBy: localStorage.getItem('alfajr_username') || 'fjr',
        reason: 'تعيين الموظف والراتب الأساسي الأولي',
        changedAt: getServerTimestamp(),
        dateStr: dateToDayString(new Date()),
        timeStr: dateToTimeString(new Date())
      });

      await logActivity('إضافة موظف', `إضافة الموظف: ${name} براتب ${formatCurrency(salary)}`);
      showToast(`تمت إضافة الموظف (${name}) بنجاح`, 'success');

    } else {
      // تعديل موظف حالي
      const empRef = db.collection('employees').doc(id);
      const oldDoc = await empRef.get();
      const oldData = oldDoc.data() || {};

      // فحص ما إذا تغير الراتب
      if (oldData.salary !== salary) {
        await updateEmployeeSalary(id, salary, 'تعديل من إدارة الموظفين');
      }

      const remainingDiff = (annualLeaveBalance - (oldData.annualLeaveBalance || 30));
      const newRemaining = Math.max(0, (oldData.remainingLeave || 0) + remainingDiff);

      await empRef.update({
        name,
        jobTitle,
        phone,
        username,
        startDate,
        annualLeaveBalance,
        remainingLeave: newRemaining,
        status,
        updatedAt: getServerTimestamp()
      });

      // تحديث وثيقة users
      await db.collection('users').doc(id).set({
        name,
        username,
        phone,
        status,
        updatedAt: getServerTimestamp()
      }, { merge: true });

      await logActivity('تعديل موظف', `تعديل بيانات الموظف: ${name}`);
      showToast('تم حفظ التعديلات بنجاح', 'success');
    }

    closeEmployeeModal();
    await loadEmployeesData();
    renderEmployeesTable();
    populateEmployeeDropdowns();
  } catch (err) {
    console.error('فشل حفظ الموظف:', err);
    showToast('حدث خطأ أثناء الحفظ: ' + err.message, 'danger');
  }
}

function closeEmployeeModal() {
  document.getElementById('employee-modal')?.classList.remove('active');
}

// تعطيل أو تفعيل موظف
async function toggleEmployeeStatus(employeeId, currentStatus) {
  const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
  const label = newStatus === 'active' ? 'تنشيط' : 'تعطيل';

  try {
    await db.collection('employees').doc(employeeId).update({
      status: newStatus,
      updatedAt: getServerTimestamp()
    });
    await db.collection('users').doc(employeeId).update({
      status: newStatus,
      updatedAt: getServerTimestamp()
    });

    await logActivity(`${label} موظف`, `تم ${label} حساب الموظف رقم ${employeeId}`);
    showToast(`تم ${label} حساب الموظف بنجاح`, 'success');
    await loadEmployeesData();
    renderEmployeesTable();
  } catch (err) {
    showToast(`فشل ${label} الحساب: ` + err.message, 'danger');
  }
}

// حذف موظف
function confirmDeleteEmployee(employeeId, employeeName) {
  showConfirmModal(
    'تأكيد حذف الموظف',
    `هل أنت متأكد تماماً من حذف الموظف (${employeeName})؟ سيتم حذف جميع بياناته بصورة نهائية.`,
    'نعم، احذف نهائياً',
    async () => {
      try {
        await db.collection('employees').doc(employeeId).delete();
        await db.collection('users').doc(employeeId).delete();
        await logActivity('حذف موظف', `تم حذف الموظف: ${employeeName}`);
        showToast(`تم حذف الموظف (${employeeName}) بنجاح`, 'success');
        await loadEmployeesData();
        renderEmployeesTable();
      } catch (err) {
        showToast('فشل حذف الموظف: ' + err.message, 'danger');
      }
    },
    true
  );
}

// ==========================================
// 5. عرض الملف الشخصي الكامل للموظف (Tabs: الحضور، الرواتب، الإجازات...)
// ==========================================

async function viewEmployeeProfile(employeeId) {
  const emp = allEmployees.find(e => e.id === employeeId);
  if (!emp) return;

  const modal = document.getElementById('profile-modal');
  if (!modal) return;

  document.getElementById('profile-emp-name').textContent = emp.name;
  document.getElementById('profile-emp-job').textContent = emp.jobTitle || 'موظف';
  document.getElementById('profile-emp-phone').textContent = emp.phone || '—';
  document.getElementById('profile-emp-start').textContent = emp.startDate || '—';
  document.getElementById('profile-emp-salary').textContent = formatCurrency(emp.salary);
  document.getElementById('profile-emp-leaves').textContent = `${emp.remainingLeave ?? emp.annualLeaveBalance ?? 30} يوم متبقٍ`;

  // حفظ معرّف الموظف المعروض حالياً
  modal.setAttribute('data-current-emp-id', employeeId);

  // تحميل بيانات التبويب الأول (الحضور)
  switchProfileTab('attendance');

  modal.classList.add('active');
}

function closeProfileModal() {
  document.getElementById('profile-modal')?.classList.remove('active');
}

async function switchProfileTab(tabName) {
  const modal = document.getElementById('profile-modal');
  const employeeId = modal?.getAttribute('data-current-emp-id');
  if (!employeeId) return;

  // تمييز التبويب
  modal.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
  });
  modal.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `profile-pane-${tabName}`);
  });

  // تعبئة بيانات التبويب
  if (tabName === 'attendance') {
    const tableBody = document.getElementById('profile-attendance-body');
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">جاري التحميل...</td></tr>';
    const snap = await db.collection('attendance').where('employeeId', '==', employeeId).orderBy('date', 'desc').limit(30).get();
    if (snap.empty) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">لا توجد سجلات حضور</td></tr>';
      return;
    }
    tableBody.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      return `
        <tr>
          <td>${d.date}</td>
          <td>${d.checkInTimeStr || '—'}</td>
          <td>${d.checkOutTimeStr || '—'}</td>
          <td>${d.chargeableLateSeconds > 0 ? formatSecondsToArabicDuration(d.chargeableLateSeconds) : 'لا يوجد'}</td>
          <td>${d.earlyLeaveSeconds > 0 ? formatSecondsToArabicDuration(d.earlyLeaveSeconds) : 'لا يوجد'}</td>
          <td>${d.status === 'present' ? '<span class="badge badge-success">حاضر</span>' : '<span class="badge badge-warning">متأخر</span>'}</td>
        </tr>
      `;
    }).join('');
  }

  if (tabName === 'salary') {
    const container = document.getElementById('profile-salary-details');
    container.innerHTML = 'جاري احتساب تفاصيل الراتب...';
    const now = new Date();
    const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const today = dateToDayString(now);

    const breakdown = await getEmployeeSalaryBreakdown(employeeId, firstDay, today);
    const history = await getEmployeeSalaryHistory(employeeId);

    container.innerHTML = `
      <div class="salary-metric-grid">
        <div class="salary-metric-box">
          <div class="metric-title">الراتب الأساسي</div>
          <div class="metric-value">${formatCurrency(breakdown.rates.monthlySalary)}</div>
        </div>
        <div class="salary-metric-box">
          <div class="metric-title">الأجر اليومي (30 يوم)</div>
          <div class="metric-value">${formatCurrency(breakdown.rates.dailyWage)}</div>
        </div>
        <div class="salary-metric-box">
          <div class="metric-title">أجر الساعة (7 ساعات)</div>
          <div class="metric-value">${formatCurrency(breakdown.rates.hourlyWage)}</div>
        </div>
        <div class="salary-metric-box">
          <div class="metric-title">أجر الدقيقة</div>
          <div class="metric-value">${formatCurrency(breakdown.rates.minuteWage)}</div>
        </div>
        <div class="salary-metric-box deductions">
          <div class="metric-title">إجمالي الخصومات</div>
          <div class="metric-value">${formatCurrency(breakdown.totalDeductions)}</div>
        </div>
        <div class="salary-metric-box net-salary">
          <div class="metric-title">صافي الراتب المستحق</div>
          <div class="metric-value">${formatCurrency(breakdown.netSalary)}</div>
        </div>
      </div>

      <div style="margin-top: 1.5rem;">
        <h4 style="margin-bottom: 0.75rem; font-size: 1rem;">📜 سجل التعديلات التاريخية للراتب:</h4>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>التاريخ والوقت</th>
                <th>الراتب السابق</th>
                <th>الراتب الجديد</th>
                <th>بواسطة</th>
                <th>السبب</th>
              </tr>
            </thead>
            <tbody>
              ${history.length === 0 ? '<tr><td colspan="5" style="text-align: center;">لا توجد تعديلات سابقة</td></tr>' : history.map(h => `
                <tr>
                  <td>${h.dateStr} - ${h.timeStr}</td>
                  <td>${formatCurrency(h.oldSalary)}</td>
                  <td><strong>${formatCurrency(h.newSalary)}</strong></td>
                  <td>${h.changedBy}</td>
                  <td>${h.reason}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (tabName === 'leaves') {
    const tableBody = document.getElementById('profile-leaves-body');
    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">جاري التحميل...</td></tr>';
    const leaves = await getEmployeeLeaves(employeeId);
    if (leaves.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">لا توجد طلبات إجازة</td></tr>';
      return;
    }
    tableBody.innerHTML = leaves.map(l => `
      <tr>
        <td>${l.leaveTypeName}</td>
        <td>${l.startDate}</td>
        <td>${l.endDate}</td>
        <td>${l.days} يوم</td>
        <td>${l.reason || '—'}</td>
        <td>${l.status === 'approved' ? '<span class="badge badge-success">موافقة</span>' : (l.status === 'rejected' ? '<span class="badge badge-danger">مرفوض</span>' : '<span class="badge badge-warning">قيد المراجعة</span>')}</td>
      </tr>
    `).join('');
  }

  if (tabName === 'excuses') {
    const tableBody = document.getElementById('profile-excuses-body');
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">جاري التحميل...</td></tr>';
    const excuses = await getEmployeeExcuses(employeeId);
    if (excuses.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">لا توجد أعذار مسجلة</td></tr>';
      return;
    }
    tableBody.innerHTML = excuses.map(x => `
      <tr>
        <td>${x.type === 'late_checkin' ? 'عذر تأخير' : 'عذر انصراف مبكر'}</td>
        <td>${x.date}</td>
        <td>${x.reason}</td>
        <td>${x.notes || '—'}</td>
        <td>${x.status === 'approved' ? '<span class="badge badge-success">موافق</span>' : (x.status === 'rejected' ? '<span class="badge badge-danger">مرفوض</span>' : '<span class="badge badge-warning">قيد المراجعة</span>')}</td>
      </tr>
    `).join('');
  }
}

// ==========================================
// 6. جدول الحضور الميداني (Attendance Table)
// ==========================================

async function loadAttendanceTable() {
  const tbody = document.getElementById('admin-attendance-table-body');
  if (!tbody) return;

  const dateInput = document.getElementById('attendance-filter-date');
  const selectedDate = dateInput?.value || dateToDayString(new Date());

  tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">جاري جلب سجلات الحضور...</td></tr>';

  try {
    const snap = await db.collection('attendance')
      .where('date', '==', selectedDate)
      .get();

    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);">لا توجد سجلات حضور مسجلة لتاريخ ${selectedDate}</td></tr>`;
      return;
    }

    tbody.innerHTML = snap.docs.map(doc => {
      const d = doc.data();
      const statusBadge = d.status === 'present'
        ? '<span class="badge badge-success">حاضر</span>'
        : (d.status === 'late' ? '<span class="badge badge-warning">متأخر</span>' : '<span class="badge badge-danger">غائب</span>');

      const lateFormatted = (d.chargeableLateSeconds > 0)
        ? `<strong style="color: var(--danger);">${formatSecondsToArabicDuration(d.chargeableLateSeconds)}</strong>`
        : (d.lateSeconds > 0 ? '<span style="color: var(--text-muted);">داخل السماح</span>' : '—');

      const excuseStatus = d.excuseApproved
        ? '<span class="badge badge-success" title="تم إسقاط الخصم">عذر مقبول ✓</span>'
        : (d.chargeableLateSeconds > 0 ? `<span style="color: var(--danger); font-weight: 700;">${formatCurrency(d.lateDeduction)}</span>` : '—');

      return `
        <tr>
          <td><strong>${d.employeeName}</strong></td>
          <td>${d.checkInTimeStr || '—'}</td>
          <td>${d.checkOutTimeStr || '—'}</td>
          <td>${d.distance !== undefined ? d.distance + ' م' : '—'}</td>
          <td>${lateFormatted}</td>
          <td>${d.earlyLeaveSeconds > 0 ? formatSecondsToArabicDuration(d.earlyLeaveSeconds) : '—'}</td>
          <td>${excuseStatus}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-outline btn-sm" onclick="editAttendanceRecord('${doc.id}')" title="تعديل يدوي">✏️</button>
            <button class="btn btn-danger btn-sm" onclick="deleteAttendanceRecord('${doc.id}', '${d.employeeName}')" title="حذف">🗑️</button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('فشل جلب الحضور:', err);
    tbody.innerHTML = `<tr><td colspan="9" style="color: var(--danger); text-align: center;">فشل تحميل السجلات</td></tr>`;
  }
}

function deleteAttendanceRecord(recordId, empName) {
  showConfirmModal(
    'تأكيد حذف سجل الحضور',
    `هل تريد حذف سجل الحضور الخاص بـ (${empName})؟`,
    'تأكيد الحذف',
    async () => {
      try {
        await db.collection('attendance').doc(recordId).delete();
        await logActivity('حذف سجل حضور', `تم حذف سجل الحضور رقم ${recordId}`);
        showToast('تم حذف السجل بنجاح', 'success');
        loadAttendanceTable();
      } catch (e) {
        showToast('فشل حذف السجل', 'danger');
      }
    }
  );
}

async function editAttendanceRecord(recordId) {
  try {
    const doc = await db.collection('attendance').doc(recordId).get();
    if (!doc.exists) {
      showToast('سجل الحضور غير موجود', 'danger');
      return;
    }
    const data = doc.data();
    const newCheckIn = prompt(`تعديل وقت الحضور (الحالي: ${data.checkInTimeStr || '--:--:--'}):`, data.checkInTimeStr || '07:00:00');
    if (newCheckIn === null) return;

    const newCheckOut = prompt(`تعديل وقت الانصراف (الحالي: ${data.checkOutTimeStr || '--:--:--'}):`, data.checkOutTimeStr || '14:00:00');
    if (newCheckOut === null) return;

    const waive = confirm('هل تريد إعفاء الموظف من خصم التأخير لهذا اليوم؟ (موافق = نعم، إلغاء = لا)');

    const updatePayload = {
      checkInTimeStr: newCheckIn,
      checkOutTimeStr: newCheckOut,
      updatedAt: getServerTimestamp()
    };

    if (waive) {
      updatePayload.excuseApproved = true;
      updatePayload.chargeableLateSeconds = 0;
      updatePayload.lateDeduction = 0;
    }

    await db.collection('attendance').doc(recordId).update(updatePayload);
    await logActivity('تعديل يدوي لحضور', `تعديل سجل الحضور رقم ${recordId} للموظف ${data.employeeName}`);
    showToast('تم تحديث سجل الحضور بنجاح', 'success');
    loadAttendanceTable();
  } catch (err) {
    showToast('فشل تعديل السجل: ' + err.message, 'danger');
  }
}

// ==========================================
// 7. إدارة الإجازات (Leaves Table & Actions)
// ==========================================

async function loadLeavesTable() {
  const tbody = document.getElementById('admin-leaves-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">جاري التحميل...</td></tr>';

  try {
    const snap = await db.collection('leaves').orderBy('createdAt', 'desc').limit(50).get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">لا توجد طلبات إجازة حالياً</td></tr>';
      return;
    }

    tbody.innerHTML = snap.docs.map(doc => {
      const l = doc.data();
      const statusBadge = l.status === 'approved'
        ? '<span class="badge badge-success">موافقة</span>'
        : (l.status === 'rejected' ? '<span class="badge badge-danger">مرفوض</span>' : '<span class="badge badge-warning">قيد المراجعة</span>');

      const actions = l.status === 'pending' ? `
        <button class="btn btn-primary btn-sm" onclick="handleApproveLeave('${doc.id}')">🟢 موافقة</button>
        <button class="btn btn-danger btn-sm" onclick="handleRejectLeave('${doc.id}')">🔴 رفض</button>
      ` : `<span style="font-size: 0.82rem; color: var(--text-muted);">${l.approvedBy ? `بواسطة ${l.approvedBy}` : (l.rejectReason || 'مكتمل')}</span>`;

      return `
        <tr>
          <td><strong>${l.employeeName}</strong></td>
          <td><span class="badge badge-info">${l.leaveTypeName}</span></td>
          <td>${l.startDate}</td>
          <td>${l.endDate}</td>
          <td><strong>${l.days} يوم</strong></td>
          <td>${l.reason || '—'}</td>
          <td>${statusBadge}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="8" style="color: var(--danger); text-align: center;">فشل جلب طلبات الإجازات</td></tr>';
  }
}

async function handleApproveLeave(leaveId) {
  await approveLeaveRequest(leaveId);
  loadLeavesTable();
  loadDashboardStats();
}

async function handleRejectLeave(leaveId) {
  const reason = prompt('يرجى كتابة سبب رفض الإجازة:', 'لا يتناسب مع جدول العمل الحالي');
  if (reason !== null) {
    await rejectLeaveRequest(leaveId, reason);
    loadLeavesTable();
    loadDashboardStats();
  }
}

// ==========================================
// 8. إدارة الأعذار (Excuses Table & Actions)
// ==========================================

async function loadExcusesTable() {
  const tbody = document.getElementById('admin-excuses-table-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">جاري التحميل...</td></tr>';

  try {
    const snap = await db.collection('excuses').orderBy('createdAt', 'desc').limit(50).get();
    if (snap.empty) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">لا توجد طلبات أعذار مسجلة</td></tr>';
      return;
    }

    tbody.innerHTML = snap.docs.map(doc => {
      const x = doc.data();
      const statusBadge = x.status === 'approved'
        ? '<span class="badge badge-success">موافق (أُسقط الخصم)</span>'
        : (x.status === 'rejected' ? '<span class="badge badge-danger">مرفوض</span>' : '<span class="badge badge-warning">قيد المراجعة</span>');

      const actions = x.status === 'pending' ? `
        <button class="btn btn-primary btn-sm" onclick="handleApproveExcuse('${doc.id}')">🟢 قبول وإسقاط الخصم</button>
        <button class="btn btn-danger btn-sm" onclick="handleRejectExcuse('${doc.id}')">🔴 رفض</button>
      ` : `<span style="font-size: 0.82rem; color: var(--text-muted);">${x.approvedBy ? `بواسطة ${x.approvedBy}` : 'مكتمل'}</span>`;

      return `
        <tr>
          <td><strong>${x.employeeName}</strong></td>
          <td><span class="badge badge-info">${x.type === 'late_checkin' ? 'تأخير حضور' : 'انصراف مبكر'}</span></td>
          <td>${x.date}</td>
          <td>${x.reason}</td>
          <td>${x.notes || '—'}</td>
          <td>${statusBadge}</td>
          <td>${actions}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="color: var(--danger); text-align: center;">فشل جلب الأعذار</td></tr>';
  }
}

async function handleApproveExcuse(excuseId) {
  await approveExcuseRequest(excuseId);
  loadExcusesTable();
  loadDashboardStats();
}

async function handleRejectExcuse(excuseId) {
  const reason = prompt('يرجى كتابة سبب رفض العذر:', 'عذر غير مبرر');
  if (reason !== null) {
    await rejectExcuseRequest(excuseId, reason);
    loadExcusesTable();
    loadDashboardStats();
  }
}

// ==========================================
// 9. جدول الرواتب ومسيرات الخصومات (Salaries Table)
// ==========================================

async function loadSalariesTable() {
  const tbody = document.getElementById('admin-salaries-table-body');
  if (!tbody) return;

  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = dateToDayString(now);

  tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">جاري احتساب مسيرات الرواتب...</td></tr>';

  try {
    const report = await generateSalaryReport('all', firstDay, lastDay);

    if (report.rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">لا توجد بيانات موظفين لحساب الرواتب</td></tr>';
      return;
    }

    tbody.innerHTML = report.rows.map(row => {
      return `
        <tr>
          <td><strong>${row.employeeName}</strong></td>
          <td>${formatCurrency(row.baseSalary)}</td>
          <td>${formatCurrency(row.dailyWage)}</td>
          <td>${formatCurrency(row.hourlyWage)}</td>
          <td>${formatCurrency(row.minuteWage)}</td>
          <td>${row.totalLateMinutes} دقيقة</td>
          <td><strong style="color: var(--danger);">${formatCurrency(row.totalDeductions)}</strong></td>
          <td><strong style="color: var(--primary-dark); font-size: 1.05rem;">${formatCurrency(row.netSalary)}</strong></td>
          <td>
            <button class="btn btn-outline-primary btn-sm" onclick="quickEditSalary('${row.employeeId}', ${row.baseSalary})">تعديل الراتب</button>
          </td>
        </tr>
      `;
    }).join('');

    // تحديث الملخص
    document.getElementById('salary-summary-total-base').textContent = formatCurrency(report.summary.grandTotalBaseSalary);
    document.getElementById('salary-summary-total-deduct').textContent = formatCurrency(report.summary.grandTotalDeductions);
    document.getElementById('salary-summary-total-net').textContent = formatCurrency(report.summary.grandTotalNetSalary);

  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="9" style="color: var(--danger); text-align: center;">فشل احتساب مسيرات الرواتب</td></tr>';
  }
}

async function quickEditSalary(employeeId, currentSalary) {
  const newSal = prompt(`الراتب الحالي هو (${currentSalary} ريال). أدخل الراتب الجديد:`, currentSalary);
  if (newSal !== null && !isNaN(newSal) && Number(newSal) >= 0) {
    const reason = prompt('سبب التعديل:', 'تعديل دوري للراتب') || 'تعديل دوري للراتب';
    await updateEmployeeSalary(employeeId, Number(newSal), reason);
    await loadEmployeesData();
    loadSalariesTable();
  }
}

// ==========================================
// 10. التقارير والتصدير والطباعة (Reports)
// ==========================================

async function runReportGeneration() {
  const type = document.getElementById('report-type-select').value;
  const empId = document.getElementById('report-employee-select').value;
  const startDate = document.getElementById('report-start-date').value;
  const endDate = document.getElementById('report-end-date').value;

  if (!startDate || !endDate) {
    showToast('يرجى اختيار الفترة الزمنية (من - إلى)', 'warning');
    return;
  }

  const container = document.getElementById('report-results-container');
  container.innerHTML = '<div style="text-align: center; padding: 2rem;">جاري توليد التقرير...</div>';

  if (type === 'attendance') {
    const data = await generateAttendanceReport(empId, startDate, endDate);
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3>📋 تقرير الحضور والانصراف (${startDate} إلى ${endDate})</h3>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-outline btn-sm" onclick="exportTableToCSV('generated-report-table', 'تقرير_الحضور_${startDate}.csv')">📥 تصدير CSV</button>
          <button class="btn btn-primary btn-sm" onclick="triggerReportPrint('تقرير الحضور والانصراف', 'من ${startDate} إلى ${endDate}')">🖨️ طباعة التقرير</button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="custom-table" id="generated-report-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>التاريخ</th>
              <th>وقت الحضور</th>
              <th>وقت الانصراف</th>
              <th>التأخير المحتسب</th>
              <th>المغادرة المبكرة</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows.map(r => `
              <tr>
                <td><strong>${r.employeeName}</strong></td>
                <td>${r.date}</td>
                <td>${r.checkIn}</td>
                <td>${r.checkOut}</td>
                <td>${r.lateText}</td>
                <td>${r.earlyText}</td>
                <td>${r.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="print-summary-box" style="margin-top: 1rem; display: flex; gap: 1.5rem; background: var(--primary-light); padding: 1rem; border-radius: var(--radius-md);">
        <div>إجمالي السجلات: <strong>${data.summary.totalRecords}</strong></div>
        <div>إجمالي التأخير: <strong>${data.summary.totalLateFormatted}</strong></div>
        <div>إجمالي المغادرة المبكرة: <strong>${data.summary.totalEarlyFormatted}</strong></div>
      </div>
    `;
  } else if (type === 'salary') {
    const data = await generateSalaryReport(empId, startDate, endDate);
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3>💰 تقرير الرواتب والخصومات (${startDate} إلى ${endDate})</h3>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-outline btn-sm" onclick="exportTableToCSV('generated-report-table', 'تقرير_الرواتب_${startDate}.csv')">📥 تصدير CSV</button>
          <button class="btn btn-primary btn-sm" onclick="triggerReportPrint('تقرير الرواتب والخصومات المالية', 'من ${startDate} إلى ${endDate}')">🖨️ طباعة التقرير</button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="custom-table" id="generated-report-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>الوظيفة</th>
              <th>الراتب الأساسي</th>
              <th>الأجر اليومي</th>
              <th>أجر الدقيقة</th>
              <th>دقائق التأخير</th>
              <th>الخصومات</th>
              <th>صافي الراتب</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows.map(r => `
              <tr>
                <td><strong>${r.employeeName}</strong></td>
                <td>${r.jobTitle}</td>
                <td>${formatCurrency(r.baseSalary)}</td>
                <td>${formatCurrency(r.dailyWage)}</td>
                <td>${formatCurrency(r.minuteWage)}</td>
                <td>${r.totalLateMinutes} دقيقة</td>
                <td style="color: var(--danger); font-weight: 700;">${formatCurrency(r.totalDeductions)}</td>
                <td style="color: var(--primary-dark); font-weight: 800;">${formatCurrency(r.netSalary)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="print-summary-box" style="margin-top: 1rem; display: flex; gap: 1.5rem; background: var(--primary-light); padding: 1rem; border-radius: var(--radius-md);">
        <div>إجمالي الأساسي: <strong>${formatCurrency(data.summary.grandTotalBaseSalary)}</strong></div>
        <div>إجمالي الخصومات: <strong style="color: var(--danger);">${formatCurrency(data.summary.grandTotalDeductions)}</strong></div>
        <div>إجمالي الصافي المستحق: <strong style="color: var(--primary-dark);">${formatCurrency(data.summary.grandTotalNetSalary)}</strong></div>
      </div>
    `;
  } else if (type === 'leaves') {
    const data = await generateLeaveReport(empId, startDate, endDate);
    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <h3>🏖️ تقرير الإجازات (${startDate} إلى ${endDate})</h3>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-outline btn-sm" onclick="exportTableToCSV('generated-report-table', 'تقرير_الإجازات_${startDate}.csv')">📥 تصدير CSV</button>
          <button class="btn btn-primary btn-sm" onclick="triggerReportPrint('تقرير الإجازات والأرصدة', 'من ${startDate} إلى ${endDate}')">🖨️ طباعة التقرير</button>
        </div>
      </div>
      <div class="table-responsive">
        <table class="custom-table" id="generated-report-table">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>نوع الإجازة</th>
              <th>من تاريخ</th>
              <th>إلى تاريخ</th>
              <th>عدد الأيام</th>
              <th>السبب</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows.map(r => `
              <tr>
                <td><strong>${r.employeeName}</strong></td>
                <td>${r.leaveType}</td>
                <td>${r.startDate}</td>
                <td>${r.endDate}</td>
                <td>${r.days} يوم</td>
                <td>${r.reason}</td>
                <td>${r.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

// ==========================================
// 11. سجل النشاط والتدقيق الإداري (Audit Log)
// ==========================================

async function loadActivityLogs() {
  const container = document.getElementById('activity-logs-list');
  if (!container) return;

  container.innerHTML = '<div style="text-align: center; padding: 2rem;">جاري تحميل سجل النشاطات...</div>';

  try {
    const snap = await db.collection('activityLogs').orderBy('timestamp', 'desc').limit(100).get();
    if (snap.empty) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">لا توجد سجلات نشاط مسجلة</div>';
      return;
    }

    container.innerHTML = snap.docs.map(doc => {
      const log = doc.data();
      return `
        <div class="activity-item">
          <div class="activity-icon-badge">📋</div>
          <div class="activity-content">
            <div class="activity-action">${log.action} <span style="font-size: 0.8rem; font-weight: normal; color: var(--accent);">(${log.username})</span></div>
            <div class="activity-details">${log.details}</div>
            <div class="activity-time">التاريخ: ${log.dateStr || ''} | الوقت: ${log.timeStr || ''}</div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div style="color: var(--danger); text-align: center;">فشل تحميل سجل النشاط</div>';
  }
}

// ==========================================
// 12. إعدادات النظام (Settings)
// ==========================================

async function populateSettingsForms() {
  const settings = await loadAllSystemSettings();
  if (!settings) return;

  // إعدادات المؤسسة
  if (document.getElementById('setting-org-name')) {
    document.getElementById('setting-org-name').value = settings.org.name || '';
  }
  if (document.getElementById('setting-org-region')) {
    document.getElementById('setting-org-region').value = settings.org.region || '';
  }
  const currentLogo = settings.org.logoUrl || localStorage.getItem('alfajr_custom_logo') || 'assets/logo.svg';
  const preview = document.getElementById('setting-logo-preview');
  if (preview) {
    preview.src = currentLogo;
  }
  if (typeof applySystemLogo === 'function') {
    applySystemLogo(currentLogo);
  }

  // إعدادات الدوام
  document.getElementById('setting-work-start').value = settings.work.startTime || '07:00:00';
  document.getElementById('setting-work-end').value = settings.work.endTime || '14:00:00';
  document.getElementById('setting-work-grace').value = settings.work.gracePeriodMinutes ?? 15;
  document.getElementById('setting-work-hours').value = settings.work.dailyWorkHours ?? 7;

  // إعدادات GPS
  document.getElementById('setting-gps-lat').value = settings.gps.latitude || 14.5424;
  document.getElementById('setting-gps-lng').value = settings.gps.longitude || 49.1248;
  document.getElementById('setting-gps-radius').value = settings.gps.radius || 100;

  // إعدادات الرواتب
  document.getElementById('setting-salary-days').value = settings.salary.approvedMonthDays || 30;
  document.getElementById('setting-salary-hours').value = settings.salary.dailyWorkHours || 7;
  document.getElementById('setting-salary-round').value = settings.salary.roundingMethod || 'exact_seconds';

  // أنواع الإجازات
  renderLeaveTypesSettings(settings.leaveTypes);
}

function renderLeaveTypesSettings(types) {
  const container = document.getElementById('leave-types-list-container');
  if (!container) return;

  container.innerHTML = types.map(t => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: 0.5rem; background: #ffffff;">
      <div>
        <strong>${t.name}</strong>
        <span style="font-size: 0.8rem; color: var(--text-muted); margin-right: 0.5rem;">(الرصيد الافتراضي: ${t.defaultBalance} يوم | ${t.deductFromBalance ? 'يخصم من الرصيد' : 'لا يخصم'})</span>
      </div>
      <div>
        <button class="btn btn-danger btn-sm" onclick="handleDeleteLeaveType('${t.id}')">حذف</button>
      </div>
    </div>
  `).join('');
}

async function handleGetAdminCurrentLocation() {
  try {
    showToast('جاري تحديد إحداثيات موقعك الحالي عبر GPS...', 'info');
    const pos = await getCurrentDevicePosition();
    document.getElementById('setting-gps-lat').value = pos.latitude;
    document.getElementById('setting-gps-lng').value = pos.longitude;
    showToast(`تم التقاط إحداثيات الموقع الحالي بدقة (${pos.accuracy} متر)`, 'success');
  } catch (err) {
    showToast(err.message, 'danger');
  }
}

// ==========================================
// 13. مستمعات الأحداث والمساعدات (Event Listeners)
// ==========================================

function setupEventListeners() {
  // بحث الموظفين
  document.getElementById('search-employee-input')?.addEventListener('input', filterEmployees);
  document.getElementById('filter-employee-status')?.addEventListener('change', filterEmployees);

  // نموذج إضافة/تعديل موظف
  document.getElementById('employee-form')?.addEventListener('submit', handleSaveEmployeeForm);

  // معاينة وحفظ الشعار في إعدادات المؤسسة
  const logoInput = document.getElementById('setting-org-logo-file');
  if (logoInput) {
    logoInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const previewEl = document.getElementById('setting-logo-preview');
          if (previewEl) previewEl.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const orgForm = document.getElementById('form-setting-org');
  if (orgForm) {
    orgForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('setting-org-name').value.trim();
      const region = document.getElementById('setting-org-region').value.trim();
      const logoFile = document.getElementById('setting-org-logo-file').files[0] || null;
      await saveOrganizationSettings({ name, region }, logoFile);
    });
  }

  // مرشح تاريخ الحضور
  const attDate = document.getElementById('attendance-filter-date');
  if (attDate) {
    attDate.value = dateToDayString(new Date());
    attDate.addEventListener('change', loadAttendanceTable);
  }

  // التقارير: تعيين التواريخ الافتراضية
  const now = new Date();
  const repStart = document.getElementById('report-start-date');
  const repEnd = document.getElementById('report-end-date');
  if (repStart && repEnd) {
    repStart.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    repEnd.value = dateToDayString(now);
  }
}

function populateEmployeeDropdowns() {
  const selects = document.querySelectorAll('#report-employee-select, #quick-employee-select');
  selects.forEach(select => {
    let options = '<option value="all">جميع الموظفين</option>';
    allEmployees.forEach(e => {
      options += `<option value="${e.id}">${e.name} (${e.jobTitle || 'موظف'})</option>`;
    });
    select.innerHTML = options;
  });
}

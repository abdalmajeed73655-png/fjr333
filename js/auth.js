/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * إدارة المصادقة والصلاحيات وحماية الصفحات (auth.js)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

// استخراج البريد المقترن باسم المستخدم
function usernameToEmail(username) {
  const cleanUser = username.trim().toLowerCase();
  if (cleanUser.includes('@')) {
    return cleanUser;
  }
  return `${cleanUser}@alfajr.org`;
}

/**
 * تسجيل الدخول باستخدام اسم المستخدم وكلمة المرور
 * @param {string} username اسم المستخدم
 * @param {string} password كلمة المرور
 * @param {boolean} rememberMe تذكرني
 */
async function handleLogin(username, password, rememberMe = false) {
  if (!username || !password) {
    showToast('يرجى إدخال اسم المستخدم وكلمة المرور', 'warning');
    return false;
  }

  const cleanUser = username.trim().toLowerCase();
  const email = usernameToEmail(cleanUser);

  try {
    let uid = null;
    let role = 'employee';
    let displayName = cleanUser;
    let employeeId = null;

    // 1. محاولة تسجيل الدخول عبر Firebase Auth السحابي إذا كان مفعلاً
    if (typeof isPlaceholderMode !== 'undefined' && !isPlaceholderMode && auth && auth.signInWithEmailAndPassword) {
      try {
        const persistenceMode = rememberMe 
          ? firebase.auth.Auth.Persistence.LOCAL 
          : firebase.auth.Auth.Persistence.SESSION;
        await auth.setPersistence(persistenceMode);

        let userCredential;
        try {
          userCredential = await auth.signInWithEmailAndPassword(email, password);
        } catch (authErr) {
          // تهيئة حساب المسؤول fjr لأول مرة إذا لم يكن منشأ مسبقاً
          if ((authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential') &&
              cleanUser === 'fjr' && password === '316501') {
            userCredential = await auth.createUserWithEmailAndPassword(email, password);
            await bootstrapSystemDefaults();
          } else {
            throw authErr;
          }
        }
        uid = userCredential.user.uid;
      } catch (cloudErr) {
        console.warn('تنبيه المصادقة السحابية، جاري فحص الحساب المحلي:', cloudErr.message);
      }
    }

    // 2. التحقق من المسؤول الأولي (fjr / 316501)
    if (cleanUser === 'fjr') {
      if (password === '316501') {
        uid = uid || 'admin_fjr';
        role = 'admin';
        displayName = 'إدارة المؤسسة - المدير العام';
      } else {
        showToast('كلمة المرور غير صحيحة لحساب المسؤول', 'danger');
        return false;
      }
    } else if (cleanUser === 'ahmed') {
      // التحقق من حساب الموظف النموذجي (ahmed / 123456)
      if (password === '123456') {
        uid = uid || 'emp_ahmed';
        role = 'employee';
        displayName = 'أحمد محمد سالم باوزير';
        employeeId = 'emp_ahmed';
      } else {
        showToast('كلمة المرور غير صحيحة لحساب الموظف', 'danger');
        return false;
      }
    } else {
      // 3. التحقق من حساب الموظف في قاعدة البيانات
      const usersSnap = await db.collection('users').where('username', '==', cleanUser).get();
      if (!usersSnap.empty) {
        const u = usersSnap.docs[0].data();
        if (u.status === 'inactive') {
          showToast('هذا الحساب معطل حالياً من قبل الإدارة', 'danger');
          return false;
        }
        if (u.password && u.password !== password) {
          showToast('كلمة المرور غير صحيحة', 'danger');
          return false;
        }
        uid = uid || u.uid || usersSnap.docs[0].id;
        role = u.role || 'employee';
        displayName = u.name || cleanUser;
        employeeId = u.employeeId || uid;
      } else {
        // فحص جدول الموظفين مباشرة
        const empSnap = await db.collection('employees').where('username', '==', cleanUser).get();
        if (!empSnap.empty) {
          const emp = empSnap.docs[0].data();
          if (emp.status === 'inactive') {
            showToast('هذا الحساب معطل حالياً', 'danger');
            return false;
          }
          if (emp.password && emp.password !== password) {
            showToast('كلمة المرور غير صحيحة', 'danger');
            return false;
          }
          uid = uid || emp.id || empSnap.docs[0].id;
          role = 'employee';
          displayName = emp.name || cleanUser;
          employeeId = uid;
        } else {
          showToast('اسم المستخدم غير مسجل بالنظام', 'danger');
          return false;
        }
      }
    }

    // حفظ بيانات الجلسة النشطة
    localStorage.setItem('alfajr_uid', uid);
    localStorage.setItem('alfajr_role', role);
    localStorage.setItem('alfajr_username', cleanUser);
    localStorage.setItem('alfajr_name', displayName);
    if (employeeId) {
      localStorage.setItem('alfajr_employee_id', employeeId);
    }

    await logActivity('تسجيل دخول', `تم تسجيل الدخول بنجاح بواسطة ${cleanUser}`);

    showToast(`مرحباً بك: ${displayName}، جاري نقلك إلى لوحة النظام...`, 'success');

    setTimeout(() => {
      if (role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'employee.html';
      }
    }, 700);

    return true;

  } catch (error) {
    console.error('خطأ تسجيل الدخول:', error);
    let errorMsg = 'فشل تسجيل الدخول. يرجى التحقق من صحة البيانات';
    if (error.code === 'auth/wrong-password') {
      errorMsg = 'كلمة المرور غير صحيحة';
    } else if (error.code === 'auth/user-not-found') {
      errorMsg = 'اسم المستخدم غير مسجل بالنظام';
    }
    showToast(errorMsg, 'danger');
    return false;
  }
}

/**
 * تسجيل الخروج
 */
async function handleLogout() {
  try {
    await logActivity('تسجيل خروج', 'تم تسجيل الخروج من النظام');
    if (auth && auth.signOut) {
      await auth.signOut();
    }
  } catch (e) {
    console.warn(e);
  } finally {
    localStorage.removeItem('alfajr_uid');
    localStorage.removeItem('alfajr_role');
    localStorage.removeItem('alfajr_username');
    localStorage.removeItem('alfajr_name');
    localStorage.removeItem('alfajr_employee_id');
    window.location.href = 'login.html';
  }
}

/**
 * حماية الصفحات والتحقق من الصلاحيات (Route Guard)
 * @param {string} requiredRole الصلاحية المطلوبة ('admin' أو 'employee')
 */
function protectPage(requiredRole) {
  const currentUid = localStorage.getItem('alfajr_uid');
  const currentRole = localStorage.getItem('alfajr_role');

  if (!currentUid || !currentRole) {
    window.location.href = 'login.html';
    return;
  }

  // إذا كانت الصفحة للمدير والمستخدم ليس مديراً
  if (requiredRole === 'admin' && currentRole !== 'admin') {
    showToast('غير مصرح لك بالدخول إلى لوحة الإدارة', 'danger');
    window.location.href = 'employee.html';
    return;
  }

  // تحديث شارات المستخدم في الواجهة فوراً
  updateUserInterfaceBadge();
}

/**
 * تحديث معلومات المستخدم في الواجهة
 */
function updateUserInterfaceBadge() {
  const username = localStorage.getItem('alfajr_username') || 'المستخدم';
  const role = localStorage.getItem('alfajr_role') || 'موظف';
  const name = localStorage.getItem('alfajr_name') || username;

  const nameEls = document.querySelectorAll('.user-name, #display-user-name');
  const roleEls = document.querySelectorAll('.user-role, #display-user-role');
  const avatarEls = document.querySelectorAll('.user-avatar, #admin-user-avatar, #emp-avatar');

  nameEls.forEach(el => el.textContent = name);
  roleEls.forEach(el => el.textContent = role === 'admin' ? 'مدير النظام' : 'موظف المؤسسة');
  avatarEls.forEach(el => {
    if (!el.querySelector('img')) {
      el.textContent = name.charAt(0).toUpperCase();
    }
  });
}

/**
 * تغيير كلمة المرور للمستخدم الحالي
 */
async function updateCurrentUserPassword(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    showToast('كلمة المرور يجب ألا تقل عن 6 خانات', 'warning');
    return false;
  }

  try {
    if (auth && auth.currentUser && typeof auth.currentUser.updatePassword === 'function') {
      await auth.currentUser.updatePassword(newPassword);
    }
    await logActivity('تغيير كلمة المرور', 'تم تحديث كلمة المرور للحساب بنجاح');
    showToast('تم تحديث كلمة المرور بنجاح', 'success');
    return true;
  } catch (error) {
    console.error('فشل تغيير كلمة المرور:', error);
    showToast('فشل تحديث كلمة المرور: ' + error.message, 'danger');
    return false;
  }
}

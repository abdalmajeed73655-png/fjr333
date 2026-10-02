/**
 * نظام مؤسسة الفجر الخيرية الاجتماعية
 * إعدادات وتكامل Firebase (Authentication, Firestore, Storage)
 * مطور الموقع: عبد المجيد عياش برديني (770905092)
 */

// جلب إعدادات Firebase الفعالة (من التخزين المحلي إذا قام المدير بربط مشروعه السحابي أو الافتراضية)
function getActiveFirebaseConfig() {
  try {
    const saved = localStorage.getItem('alfajr_custom_firebase_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.apiKey && !parsed.apiKey.includes('PLACEHOLDER')) {
        return parsed;
      }
    }
  } catch (e) {}

  return {
    apiKey: "AIzaSyD-PLACEHOLDER-ALFAJR-CHARITY-2026",
    authDomain: "al-fajr-charity.firebaseapp.com",
    projectId: "al-fajr-charity",
    storageBucket: "al-fajr-charity.appspot.com",
    messagingSenderId: "109876543210",
    appId: "1:109876543210:web:abcdef123456789"
  };
}

const firebaseConfig = getActiveFirebaseConfig();

// فحص ما إذا كانت الإعدادات مفاتيح حقيقية أم تجريبية أولية
const isPlaceholderMode = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("PLACEHOLDER");

let app = null, auth = null, db = null, storage = null;
let isFirebaseInitialized = false;

// ==========================================
// 1. التهيئة الحقيقية لـ Firebase إذا توفرت المفاتيح
// ==========================================
if (!isPlaceholderMode && typeof firebase !== 'undefined') {
  try {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    storage = firebase.storage();

    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
      console.warn('تنبيه التخزين المؤقت المحلي:', err.message);
    });

    isFirebaseInitialized = true;
    console.log('✅ تم الاتصال السحابي المباشر بـ Firebase بنجاح بمشروع:', firebaseConfig.projectId);
  } catch (e) {
    console.warn('خطأ تهيئة فايربيس السحابي:', e.message);
  }
}

// دوال إدارة الربط السحابي
function saveCustomFirebaseConfig(config) {
  if (!config || !config.apiKey || !config.projectId) {
    throw new Error('يرجى ملء مفتاح API و Project ID على الأقل للربط السحابي');
  }
  localStorage.setItem('alfajr_custom_firebase_config', JSON.stringify(config));
  return true;
}

function resetCustomFirebaseConfig() {
  localStorage.removeItem('alfajr_custom_firebase_config');
  return true;
}

function getFirebaseConnectionStatus() {
  return {
    isCloudActive: !isPlaceholderMode && isFirebaseInitialized,
    isPlaceholder: isPlaceholderMode,
    projectId: firebaseConfig.projectId || 'al-fajr-charity',
    config: firebaseConfig
  };
}

// ==========================================
// 2. محرك الجاهزية المحلي (Local Storage Firestore Adapter)
// يعمل فوراً لضمان فتح واستخدام النظام بنسبة 100% حتى قبل وضع المفاتيح السحابية
// ==========================================
if (isPlaceholderMode || !db) {
  console.log('⚡ يعمل النظام في وضع الجاهزية المحلي المتكامل (Local Database Engine)');

  // مخزن البيانات المحلي
  const STORAGE_KEY = 'alfajr_local_firestore_db';

  function getLocalData() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.users) parsed.users = {};
        if (!parsed.employees) parsed.employees = {};
        
        // ضمان وجود وتحديث حساب المسؤول الأولي
        if (!parsed.users.admin_fjr) {
          parsed.users.admin_fjr = {
            uid: "admin_fjr",
            username: "fjr",
            email: "fjr@alfajr.org",
            role: "admin",
            name: "إدارة المؤسسة - المدير العام",
            phone: "770905092",
            password: "316501",
            status: "active"
          };
        } else {
          parsed.users.admin_fjr.password = "316501";
        }

        // ضمان وجود وتحديث حساب الموظف التجريبي أحمد
        if (!parsed.users.emp_ahmed) {
          parsed.users.emp_ahmed = {
            uid: "emp_ahmed",
            username: "ahmed",
            email: "ahmed@alfajr.org",
            role: "employee",
            name: "أحمد محمد سالم باوزير",
            phone: "771234567",
            employeeId: "emp_ahmed",
            password: "123456",
            status: "active"
          };
        } else {
          parsed.users.emp_ahmed.password = "123456";
        }

        if (!parsed.employees.emp_ahmed) {
          parsed.employees.emp_ahmed = {
            id: "emp_ahmed",
            name: "أحمد محمد سالم باوزير",
            jobTitle: "أخصائي اجتماعي",
            phone: "771234567",
            username: "ahmed",
            email: "ahmed@alfajr.org",
            startDate: "2026-01-01",
            salary: 120000,
            annualLeaveBalance: 30,
            usedLeave: 0,
            remainingLeave: 30,
            status: "active",
            createdAt: new Date().toISOString()
          };
        }

        return parsed;
      }
    } catch (e) {}

    // البيانات الأولية الافتراضية للمؤسسة والموظفين
    const initialData = {
      organization: {
        info: {
          name: "مؤسسة الفجر الخيرية الاجتماعية",
          region: "حضرموت – المكلا",
          developer: "عبد المجيد عياش برديني",
          phone: "770905092",
          logoUrl: "assets/logo.svg",
          updatedAt: new Date().toISOString()
        }
      },
      settings: {
        workSettings: {
          startTime: "07:00:00",
          endTime: "14:00:00",
          gracePeriodMinutes: 15,
          earlyArrivalAllowed: true,
          dailyWorkHours: 7,
          updatedAt: new Date().toISOString()
        },
        gpsSettings: {
          latitude: 14.5424,
          longitude: 49.1248,
          radius: 100,
          locationName: "المقر الرئيسي - حضرموت، المكلا",
          updatedAt: new Date().toISOString()
        },
        salarySettings: {
          approvedMonthDays: 30,
          dailyWorkHours: 7,
          roundingMethod: "exact_seconds",
          updatedAt: new Date().toISOString()
        }
      },
      leaveTypes: {
        annual: {
          id: "annual",
          name: "إجازة سنوية",
          defaultBalance: 30,
          deductFromBalance: true,
          requiresApproval: true,
          requiresAttachment: false,
          active: true
        },
        sick: {
          id: "sick",
          name: "إجازة مرضية",
          defaultBalance: 15,
          deductFromBalance: false,
          requiresApproval: true,
          requiresAttachment: true,
          active: true
        },
        emergency: {
          id: "emergency",
          name: "إجازة طارئة / عارضة",
          defaultBalance: 7,
          deductFromBalance: true,
          requiresApproval: true,
          requiresAttachment: false,
          active: true
        }
      },
      users: {
        admin_fjr: {
          uid: "admin_fjr",
          username: "fjr",
          email: "fjr@alfajr.org",
          role: "admin",
          name: "إدارة المؤسسة - المدير العام",
          phone: "770905092",
          password: "316501",
          status: "active"
        },
        emp_ahmed: {
          uid: "emp_ahmed",
          username: "ahmed",
          email: "ahmed@alfajr.org",
          role: "employee",
          name: "أحمد محمد سالم باوزير",
          phone: "771234567",
          employeeId: "emp_ahmed",
          password: "123456",
          status: "active"
        }
      },
      employees: {
        emp_ahmed: {
          id: "emp_ahmed",
          name: "أحمد محمد سالم باوزير",
          jobTitle: "أخصائي اجتماعي",
          phone: "771234567",
          username: "ahmed",
          email: "ahmed@alfajr.org",
          startDate: "2026-01-01",
          salary: 120000,
          annualLeaveBalance: 30,
          usedLeave: 0,
          remainingLeave: 30,
          status: "active",
          createdAt: new Date().toISOString()
        }
      },
      attendance: {},
      leaves: {},
      excuses: {},
      salaryHistory: {},
      activityLogs: {}
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialData));
    return initialData;
  }

  function saveLocalData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  // محاكي كائن Firestore المطابق للواجهة الرسمية
  class LocalDocRef {
    constructor(collName, docId) {
      this.collName = collName;
      this.id = docId;
    }

    async get() {
      const data = getLocalData();
      const coll = data[this.collName] || {};
      const docData = coll[this.id];
      return {
        exists: Boolean(docData),
        id: this.id,
        data: () => docData ? JSON.parse(JSON.stringify(docData)) : undefined
      };
    }

    async set(newData, options = {}) {
      const data = getLocalData();
      if (!data[this.collName]) data[this.collName] = {};

      if (options.merge && data[this.collName][this.id]) {
        data[this.collName][this.id] = { ...data[this.collName][this.id], ...newData };
      } else {
        data[this.collName][this.id] = { ...newData, id: this.id };
      }
      saveLocalData(data);
    }

    async update(updateData) {
      const data = getLocalData();
      if (!data[this.collName] || !data[this.collName][this.id]) {
        throw new Error('الوثيقة غير موجودة لتحديثها');
      }
      data[this.collName][this.id] = { ...data[this.collName][this.id], ...updateData };
      saveLocalData(data);
    }

    async delete() {
      const data = getLocalData();
      if (data[this.collName] && data[this.collName][this.id]) {
        delete data[this.collName][this.id];
        saveLocalData(data);
      }
    }
  }

  class LocalQuery {
    constructor(collName, filters = [], orderField = null, orderDir = 'asc', limitCount = null) {
      this.collName = collName;
      this.filters = filters;
      this.orderField = orderField;
      this.orderDir = orderDir;
      this.limitCount = limitCount;
    }

    where(field, op, val) {
      return new LocalQuery(
        this.collName,
        [...this.filters, { field, op, val }],
        this.orderField,
        this.orderDir,
        this.limitCount
      );
    }

    orderBy(field, dir = 'asc') {
      return new LocalQuery(this.collName, this.filters, field, dir, this.limitCount);
    }

    limit(n) {
      return new LocalQuery(this.collName, this.filters, this.orderField, this.orderDir, n);
    }

    async get() {
      const data = getLocalData();
      const coll = data[this.collName] || {};
      let list = Object.keys(coll).map(id => ({ id, ...coll[id] }));

      // تطبيق الفلاتر
      for (const f of this.filters) {
        list = list.filter(item => {
          const itemVal = item[f.field];
          if (f.op === '==') return itemVal === f.val;
          if (f.op === '>=') return itemVal >= f.val;
          if (f.op === '<=') return itemVal <= f.val;
          if (f.op === '>') return itemVal > f.val;
          if (f.op === '<') return itemVal < f.val;
          return true;
        });
      }

      // تطبيق الترتيب
      if (this.orderField) {
        list.sort((a, b) => {
          const valA = a[this.orderField];
          const valB = b[this.orderField];
          if (valA === valB) return 0;
          if (valA === undefined) return 1;
          if (valB === undefined) return -1;
          const res = valA > valB ? 1 : -1;
          return this.orderDir === 'desc' ? -res : res;
        });
      }

      // تطبيق الحد الأقصى
      if (this.limitCount && this.limitCount > 0) {
        list = list.slice(0, this.limitCount);
      }

      const docs = list.map(item => ({
        id: item.id,
        exists: true,
        data: () => JSON.parse(JSON.stringify(item))
      }));

      return {
        empty: docs.length === 0,
        size: docs.length,
        docs: docs,
        forEach: (callback) => docs.forEach(callback)
      };
    }
  }

  class LocalCollectionRef extends LocalQuery {
    doc(id) {
      const docId = id || `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      return new LocalDocRef(this.collName, docId);
    }

    async add(newData) {
      const newId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const docRef = this.doc(newId);
      await docRef.set(newData);
      return { id: newId };
    }
  }

  // بناء كائن db المتوافق كلياً
  db = {
    collection: (name) => new LocalCollectionRef(name),
    runTransaction: async (updateFunction) => {
      const transaction = {
        get: async (docRef) => docRef.get(),
        set: (docRef, data, opts) => docRef.set(data, opts),
        update: (docRef, data) => docRef.update(data),
        delete: (docRef) => docRef.delete()
      };
      return await updateFunction(transaction);
    }
  };

  // محاكي كائن Auth المطابق
  auth = {
    currentUser: null,
    onAuthStateChanged: (callback) => {
      const uid = localStorage.getItem('alfajr_uid');
      if (uid) {
        const email = `${localStorage.getItem('alfajr_username') || 'user'}@alfajr.org`;
        auth.currentUser = { uid, email };
        callback(auth.currentUser);
      } else {
        auth.currentUser = null;
        callback(null);
      }
      return () => {};
    },
    setPersistence: async () => true,
    signInWithEmailAndPassword: async (email, password) => {
      const username = email.split('@')[0].toLowerCase();
      if (username === 'fjr') {
        if (password === '316501') {
          auth.currentUser = { uid: 'admin_fjr', email: 'fjr@alfajr.org' };
          return { user: auth.currentUser };
        } else {
          const err = new Error('كلمة المرور غير صحيحة');
          err.code = 'auth/wrong-password';
          throw err;
        }
      }

      // فحص الموظفين
      const data = getLocalData();
      const users = data.users || {};
      for (const uid in users) {
        const u = users[uid];
        if (u.username === username) {
          if (u.password && u.password !== password) {
            const err = new Error('كلمة المرور غير صحيحة');
            err.code = 'auth/wrong-password';
            throw err;
          }
          auth.currentUser = { uid: u.uid, email: u.email };
          return { user: auth.currentUser };
        }
      }

      const err = new Error('بيانات الدخول غير صحيحة');
      err.code = 'auth/invalid-credential';
      throw err;
    },
    createUserWithEmailAndPassword: async (email, password) => {
      const username = email.split('@')[0].toLowerCase();
      const newUid = `user_${Date.now()}`;
      auth.currentUser = { uid: newUid, email };
      
      const data = getLocalData();
      if (!data.users) data.users = {};
      data.users[newUid] = {
        uid: newUid,
        username: username,
        email: email,
        password: password,
        role: 'employee',
        status: 'active'
      };
      saveLocalData(data);

      return { user: auth.currentUser };
    },
    signOut: async () => {
      auth.currentUser = null;
      return true;
    }
  };

  // محاكي Storage
  storage = {
    ref: (path) => ({
      put: async (file) => ({
        ref: {
          getDownloadURL: async () => {
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(file);
            });
          }
        }
      })
    })
  };
}

// دالة مساعدة للحصول على ServerTimestamp
function getServerTimestamp() {
  if (typeof firebase !== 'undefined' && firebase.firestore && !isPlaceholderMode) {
    return firebase.firestore.FieldValue.serverTimestamp();
  }
  return new Date();
}

// مراقبة حالة الاتصال بالإنترنت
window.addEventListener('online', () => {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = 'none';
  if (typeof showToast === 'function') {
    showToast('تم استعادة الاتصال بالإنترنت بنجاح', 'success', 'متصل الآن');
  }
});

window.addEventListener('offline', () => {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = 'block';
  if (typeof showToast === 'function') {
    showToast('انقطع الاتصال بالإنترنت. يرجى التحقق من الشبكة', 'danger', 'غير متصل');
  }
});

/**
 * دالة تهيئة الإعدادات الافتراضية
 */
async function bootstrapSystemDefaults() {
  if (!db) return;
  try {
    const orgDoc = await db.collection('organization').doc('info').get();
    if (!orgDoc.exists) {
      await db.collection('organization').doc('info').set({
        name: "مؤسسة الفجر الخيرية الاجتماعية",
        region: "حضرموت – المكلا",
        developer: "عبد المجيد عياش برديني",
        phone: "770905092",
        logoUrl: "assets/logo.svg",
        updatedAt: getServerTimestamp()
      });
    }
  } catch (err) {
    console.warn('تهيئة الإعدادات:', err);
  }
}

// ============================================
// إعدادات Firebase - لازم تغيرها بمعلومات مشروعك
// ============================================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// تهيئة Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();

// ============================================
// متغيرات عامة
// ============================================
let currentRole = localStorage.getItem("role") || null;
let currentName = localStorage.getItem("name") || null;
let currentUserId = localStorage.getItem("userId") || null;

// ============================================
// بدء التطبيق
// ============================================
window.onload = function () {
  // توليد معرف مستخدم ثابت لو ما في
  if (!currentUserId) {
    currentUserId = "user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem("userId", currentUserId);
  }

  // إخفاء التحميل
  document.getElementById("loading").classList.remove("active");

  if (!currentRole) {
    showScreen("welcome-screen");
  } else if (currentRole === "driver") {
    showScreen("driver-screen");
    // تعبئة الاسم لو موجود
    if (currentName) {
      document.getElementById("driver-name").value = currentName;
    }
  } else if (currentRole === "passenger") {
    if (!currentName) {
      showScreen("passenger-name-screen");
    } else {
      showScreen("passenger-screen");
      document.getElementById("passenger-greeting").textContent = "مرحباً " + currentName;
      loadTrips();
    }
  }

  // مراقبة تغيير الاتجاه
  document.getElementById("direction").addEventListener("change", function () {
    const otherGroup = document.getElementById("other-direction-group");
    if (this.value === "أخرى") {
      otherGroup.style.display = "block";
      document.getElementById("other-direction").required = true;
    } else {
      otherGroup.style.display = "none";
      document.getElementById("other-direction").required = false;
    }
  });

  // معاينة الصورة
  document.getElementById("car-photo").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (ev) {
        document.getElementById("photo-preview").innerHTML =
          `<img src="${ev.target.result}" alt="معاينة السيارة">`;
      };
      reader.readAsDataURL(file);
    }
  });
};

// ============================================
// وظائف مساعدة
// ============================================
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function showToast(message, type = "success") {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "toast show " + type;
  setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// ============================================
// اختيار الدور
// ============================================
function selectRole(role) {
  if (currentRole) {
    showToast("لا يمكن تغيير الدور بعد اختياره", "error");
    return;
  }
  currentRole = role;
  localStorage.setItem("role", role);

  if (role === "driver") {
    showScreen("driver-screen");
  } else {
    showScreen("passenger-name-screen");
  }
}

// ============================================
// حفظ اسم الراكب
// ============================================
function savePassengerName() {
  const name = document.getElementById("passenger-name").value.trim();
  if (name.length < 5) {
    showToast("اكتب اسمك الثلاثي كاملاً", "error");
    return;
  }
  currentName = name;
  localStorage.setItem("name", name);
  document.getElementById("passenger-greeting").textContent = "مرحباً " + name;
  showScreen("passenger-screen");
  loadTrips();
}

// ============================================
// نشر رحلة (سائق)
// ============================================
async function publishTrip(e) {
  e.preventDefault();

  const name = document.getElementById("driver-name").value.trim();
  const carType = document.getElementById("car-type").value.trim();
  const whatsapp = document.getElementById("whatsapp").value.trim();
  let direction = document.getElementById("direction").value;
  const time = document.getElementById("trip-time").value;
  const price = document.getElementById("price").value;
  const photoFile = document.getElementById("car-photo").files[0];

  if (direction === "أخرى") {
    direction = document.getElementById("other-direction").value.trim();
    if (!direction) {
      showToast("اكتب الاتجاه", "error");
      return;
    }
  }

  if (!photoFile) {
    showToast("ارفع صورة السيارة", "error");
    return;
  }

  // حفظ الاسم
  currentName = name;
  localStorage.setItem("name", name);

  const btn = document.getElementById("publish-btn");
  btn.disabled = true;
  btn.textContent = "جاري النشر...";

  try {
    // رفع الصورة
    const storageRef = storage.ref(`cars/${currentUserId}_${Date.now()}.jpg`);
    await storageRef.put(photoFile);
    const photoURL = await storageRef.getDownloadURL();

    // حفظ الرحلة في قاعدة البيانات
    await db.collection("trips").add({
      driverId: currentUserId,
      driverName: name,
      carType: carType,
      whatsapp: whatsapp,
      direction: direction,
      time: time,
      price: Number(price),
      photoURL: photoURL,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      bookings: [] // قائمة الحجوزات
    });

    showToast("تم نشر الرحلة بنجاح ✓");
    document.getElementById("trip-form").reset();
    document.getElementById("photo-preview").innerHTML = "";
    document.getElementById("other-direction-group").style.display = "none";
  } catch (error) {
    console.error(error);
    showToast("حدث خطأ أثناء النشر. تأكد من إعدادات Firebase", "error");
  }

  btn.disabled = false;
  btn.textContent = "نشر الرحلة";
}

// ============================================
// عرض رحلات السائق + الحجوزات
// ============================================
function showMyTrips() {
  showScreen("my-trips-screen");
  loadMyTrips();
}

function showDriverScreen() {
  showScreen("driver-screen");
}

async function loadMyTrips() {
  const list = document.getElementById("my-trips-list");
  list.innerHTML = "<p class='empty'>جاري التحميل...</p>";

  try {
    const snapshot = await db.collection("trips")
      .where("driverId", "==", currentUserId)
      .orderBy("createdAt", "desc")
      .get();

    if (snapshot.empty) {
      list.innerHTML = "<p class='empty'>ما عندك رحلات منشورة بعد</p>";
      return;
    }

    let html = "";
    snapshot.forEach(doc => {
      const trip = doc.data();
      const bookings = trip.bookings || [];

      html += `
        <div class="trip-card">
          <div class="direction">${trip.direction}</div>
          <div class="meta">
            <span>🕐 ${trip.time}</span>
            <span>💰 ${trip.price.toLocaleString()} ل.س</span>
            <span>🚗 ${trip.carType}</span>
          </div>
          ${trip.photoURL ? `<img src="${trip.photoURL}" class="car-img" alt="السيارة">` : ""}
          
          <div class="bookings-list">
            <strong>الحجوزات (${bookings.length}):</strong>
            ${bookings.length === 0 
              ? "<p style='color:#64748b;font-size:13px;margin-top:6px;'>ما في حجوزات بعد</p>"
              : bookings.map(b => `
                  <div class="booking-item">
                    👤 ${b.passengerName}<br>
                    <small style="color:#64748b">${b.bookedAt ? new Date(b.bookedAt.seconds * 1000).toLocaleString("ar") : ""}</small>
                  </div>
                `).join("")
            }
          </div>
        </div>
      `;
    });

    list.innerHTML = html;
  } catch (error) {
    console.error(error);
    list.innerHTML = "<p class='empty'>حدث خطأ في تحميل الرحلات</p>";
  }
}

// ============================================
// تحميل الرحلات للراكب
// ============================================
async function loadTrips() {
  const list = document.getElementById("trips-list");
  list.innerHTML = "<p class='empty'>جاري تحميل الرحلات...</p>";

  try {
    const snapshot = await db.collection("trips")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    if (snapshot.empty) {
      list.innerHTML = "<p class='empty'>ما في رحلات متاحة حالياً</p>";
      return;
    }

    let html = "";
    snapshot.forEach(doc => {
      const trip = doc.data();
      const tripId = doc.id;

      // هل الراكب الحالي حجز هالرحلة؟
      const alreadyBooked = (trip.bookings || []).some(b => b.passengerId === currentUserId);

      html += `
        <div class="trip-card">
          <div class="direction">${trip.direction}</div>
          <div class="driver-info">
            ${trip.photoURL ? `<img src="${trip.photoURL}" class="car-img" alt="السيارة">` : ""}
            <div>
              <div><strong>${trip.driverName}</strong></div>
              <div style="font-size:13px;color:#94a3b8">${trip.carType}</div>
            </div>
          </div>
          <div class="meta">
            <span>🕐 ${trip.time}</span>
            <span class="price">${trip.price.toLocaleString()} ل.س</span>
          </div>

          ${alreadyBooked 
            ? `<a href="https://wa.me/963${trip.whatsapp.replace(/^0/, '')}" target="_blank" class="btn-whatsapp">
                 تواصل عبر واتساب
               </a>
               <p style="text-align:center;font-size:12px;color:#34d399;margin-top:6px;">✓ أنت حجزت هذه الرحلة</p>`
            : `<button class="btn-book" onclick="bookTrip('${tripId}', '${trip.driverName}', '${trip.whatsapp}')">
                 حجز الرحلة
               </button>`
          }
        </div>
      `;
    });

    list.innerHTML = html;
  } catch (error) {
    console.error(error);
    list.innerHTML = "<p class='empty'>حدث خطأ. تأكد من إعدادات Firebase</p>";
  }
}

// ============================================
// حجز رحلة
// ============================================
async function bookTrip(tripId, driverName, whatsapp) {
  if (!currentName) {
    showToast("يجب إدخال اسمك أولاً", "error");
    return;
  }

  try {
    const tripRef = db.collection("trips").doc(tripId);
    
    await tripRef.update({
      bookings: firebase.firestore.FieldValue.arrayUnion({
        passengerId: currentUserId,
        passengerName: currentName,
        bookedAt: new Date()
      })
    });

    showToast("تم الحجز بنجاح ✓");
    
    // إعادة تحميل القائمة
    loadTrips();
  } catch (error) {
    console.error(error);
    showToast("حدث خطأ أثناء الحجز", "error");
  }
}

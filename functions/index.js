/**
 * Firebase Cloud Functions cho tự động đối soát thanh toán qua Casso
 * 
 * Chức năng:
 * 1. Nhận webhook từ Casso khi có tiền vào
 * 2. Parse nội dung chuyển khoản để lấy thông tin phòng và tháng
 * 3. Tìm hóa đơn tương ứng
 * 4. Tự động cập nhật trạng thái hóa đơn
 * 5. Tạo phiếu thu tự động
 * 6. Gửi thông báo cho khách hàng
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ============================================
// WEBHOOK NHẬN TỪ CASSO
// ============================================

/**
 * Webhook endpoint nhận thông báo từ Casso khi có giao dịch mới
 * URL: https://YOUR-PROJECT.cloudfunctions.net/cassoWebhook
 * Method: POST
 */
exports.cassoWebhook = functions.https.onRequest(async (req, res) => {
  // Chỉ nhận POST request
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  try {
    console.log("📨 Received webhook from Casso:", JSON.stringify(req.body, null, 2));

  // Luôn return 200 OK ngay để Casso biết đã nhận được webhook
  res.status(200).send("OK");
  // Diagnostic marker to confirm deployed handler revision
  console.log("🔁 Webhook handler (rev): processing incoming data shape...");

    // Casso gửi data trong body
    const webhookData = req.body;

    // Verify webhook (optional - nếu Casso gửi signature)
    // const cassoSecret = functions.config().casso?.secret;
    // if (cassoSecret && !verifyWebhookSignature(req, cassoSecret)) {
    //   console.error("❌ Invalid webhook signature");
    //   return;
    // }

    // Casso webhook structure:
    // {
    //   "error": 0,
    //   "data": [{
    //     "id": 123456,
    //     "tid": "XXXX",
    //     "description": "NGUYEN VAN A PHONG101 T11",
    //     "amount": 1500000,
    //     "cusum_balance": 10000000,
    //     "when": "2025-11-06 15:30:45"
    //   }]
    // }

    if (webhookData.error !== 0 || !webhookData.data) {
      console.log("⚠️ No transaction data in webhook");
      return;
    }

    // Hỗ trợ cả hai dạng: data có thể là mảng hoặc một object
    const data = webhookData.data;

    if (Array.isArray(data)) {
      // Nếu Casso gửi mảng giao dịch, xử lý từng phần tử
      for (const tx of data) {
        processTransaction(tx).catch((error) => {
          console.error("❌ Error processing transaction (array item):", error);
        });
      }
    } else if (data && typeof data === "object") {
      // Nếu là object duy nhất
      processTransaction(data).catch((error) => {
        console.error("❌ Error processing transaction:", error);
      });
    } else {
      console.log("⚠️ Unexpected webhook data shape:", typeof data);
    }
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
  }
});

// ============================================
// HÀM XỬ LÝ GIAO DỊCH
// ============================================

/**
 * Xử lý một giao dịch từ Casso
 */
async function processTransaction(transaction) {
  console.log("🔄 Processing transaction:", transaction);

  const {id, description, amount, when} = transaction;

  // Parse nội dung chuyển khoản để lấy thông tin
  const paymentInfo = parsePaymentDescription(description);

  if (!paymentInfo) {
    console.log("⚠️ Cannot parse payment description:", description);
    // Tạo phiếu thu chưa duyệt để admin tự kiểm tra
    await createUnverifiedTransaction(transaction, "Không parse được nội dung chuyển khoản");
    return;
  }

  console.log("✅ Parsed payment info:", paymentInfo);

  // Tìm hóa đơn tương ứng (truyền thêm amount để so sánh)
  const bill = await findMatchingBill(paymentInfo, amount);

  if (!bill) {
    console.log("⚠️ No matching bill found for:", paymentInfo, "amount:", amount);
    // Tạo phiếu thu chưa duyệt để admin tự kiểm tra
    await createUnverifiedTransaction(transaction, `Không tìm thấy hóa đơn khớp cho khách hàng: ${paymentInfo.customerName}`);
    return;
  }

  console.log("✅ Found matching bill:", bill.id);

  // Kiểm tra hóa đơn đã thanh toán chưa
  if (bill.status === "paid") {
    console.log("⚠️ Bill already paid:", bill.id);
    return;
  }

  // Kiểm tra số tiền có khớp không (cho phép sai lệch 1000đ)
  if (Math.abs(amount - bill.totalAmount) > 1000) {
    console.log("⚠️ Amount mismatch. Expected:", bill.totalAmount, "Got:", amount);
    // Gửi thông báo cho admin về sự khác biệt
    await notifyAdminAboutMismatch(bill, transaction);
    return;
  }

  // CẬP NHẬT HÓA ĐƠN VÀ TẠO PHIẾU THU
  await updateBillAndCreateTransaction(bill, transaction);
}

/**
 * Parse nội dung chuyển khoản
 * Format: "NGUYEN VAN A CHUYEN KHOAN" hoặc tên khách hàng bất kỳ
 * Trả về tên khách hàng đã chuẩn hóa (không dấu, chữ hoa)
 */
function parsePaymentDescription(description) {
  if (!description) return null;

  // Chuẩn hóa: chữ hoa, bỏ dấu, trim
  const normalized = description
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/Đ/g, "D")
      .replace(/đ/g, "d")
      .trim();

  console.log("🔍 Normalized description:", normalized);

  // Bỏ "QR - " hoặc "QR-" ở đầu (ngân hàng tự động thêm vào)
  const cleanedDesc = normalized.replace(/^QR\s*-?\s*/g, "").trim();
  console.log("🧹 After removing QR prefix:", cleanedDesc);

  // Bỏ từ "CHUYEN KHOAN" nếu có
  const customerName = cleanedDesc.replace(/CHUYEN\s*KHOAN/g, "").trim();
  console.log("✨ Final customer name:", customerName);

  if (!customerName) {
    return null;
  }

  return {
    customerName: customerName,
  };
}

/**
 * Tìm hóa đơn khớp với thông tin thanh toán
 * Tìm theo tên khách hàng + số tiền
 */
async function findMatchingBill(paymentInfo, amount) {
  const {customerName} = paymentInfo;

  try {
    // 1. Lấy tất cả hóa đơn chưa thanh toán, đã duyệt
    const billsRef = db.collection("bills");
    const snapshot = await billsRef
        .where("status", "==", "unpaid")
        .where("approved", "==", true)
        .get();

    if (snapshot.empty) {
      console.log("⚠️ No unpaid bills found");
      return null;
    }

    // 2. Lấy danh sách khách hàng
    const customersSnapshot = await db.collection("customers").get();
    const customers = {};
    customersSnapshot.forEach((doc) => {
      const customer = doc.data();
      // Chuẩn hóa tên khách hàng (bỏ dấu, chữ hoa)
      const normalizedName = customer.name
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/Đ/g, "D")
          .replace(/đ/g, "d")
          .trim();
      customers[doc.id] = {
        id: doc.id,
        name: customer.name,
        normalizedName: normalizedName,
      };
    });

    // 3. Tìm hóa đơn khớp với tên khách hàng + số tiền
    for (const billDoc of snapshot.docs) {
      const bill = billDoc.data();
      const customer = customers[bill.customerId];

      if (!customer) continue;

      console.log("🔍 Checking bill:", {
        billId: billDoc.id,
        customerId: bill.customerId,
        customerNormalizedName: customer.normalizedName,
        searchName: customerName,
        billAmount: bill.totalAmount,
        transactionAmount: amount,
      });

      // So sánh tên (không dấu) và số tiền (cho phép sai lệch 1000đ)
      if (
        customer.normalizedName === customerName &&
        Math.abs(amount - bill.totalAmount) <= 1000
      ) {
        console.log("✅ Found matching bill:", billDoc.id);
        return {id: billDoc.id, ...bill};
      }
    }

    console.log("⚠️ No matching bill found for:", customerName, amount);
    return null;
  } catch (error) {
    console.error("❌ Error finding bill:", error);
    return null;
  }
}

/**
 * Cập nhật hóa đơn và tạo phiếu thu
 */
async function updateBillAndCreateTransaction(bill, cassoTransaction) {
  try {
    // 1. Cập nhật trạng thái hóa đơn
    await db.collection("bills").doc(bill.id).update({
      status: "paid",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAmount: cassoTransaction.amount,
      paymentMethod: "bank_transfer",
      cassoTransactionId: cassoTransaction.id,
      cassoTransactionDescription: cassoTransaction.description,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log("✅ Updated bill status to paid:", bill.id);

    // 2. Lấy thông tin bổ sung
    const buildingDoc = await db.collection("buildings").doc(bill.buildingId).get();
    const building = buildingDoc.exists ? buildingDoc.data() : null;

    const customerDoc = await db.collection("customers").doc(bill.customerId).get();
    const customer = customerDoc.exists ? customerDoc.data() : null;

    // 3. Tạo phiếu thu tự động
    const transactionItems = await createTransactionItemsFromBill(bill);

    const accountId = building?.accountId || "";
    if (!accountId) {
      console.error("⚠️ Building has no accountId:", bill.buildingId);
    }

    const transactionCode = `PT${new Date().toISOString().replace(/\D/g, "").slice(0, 12)}`;
    const transactionData = {
      type: "income",
      code: transactionCode,
      buildingId: bill.buildingId,
      room: bill.room,
      customerId: bill.customerId,
      billId: bill.id,
      accountId: accountId,
      title: `Thu tiền phòng ${building?.code || ""} - ${bill.room} - Tháng ${bill.period}`,
      payer: customer?.name || "Khách hàng",
      date: new Date().toISOString().split("T")[0],
      items: transactionItems,
      approved: true,
      paymentMethod: "bank_transfer",
      cassoTransactionId: cassoTransaction.id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("transactions").add(transactionData);
    console.log("✅ Created transaction receipt:", transactionCode);

    // 4. Gửi thông báo cho khách hàng
    await notifyCustomerPaymentSuccess(bill, customer, building);

    console.log("🎉 Payment processed successfully for bill:", bill.id);
  } catch (error) {
    console.error("❌ Error updating bill and creating transaction:", error);
    throw error;
  }
}

/**
 * Tạo các items cho phiếu thu từ hóa đơn
 */
async function createTransactionItemsFromBill(bill) {
  const items = [];

  // Lấy danh sách categories để map
  const categoriesSnapshot = await db.collection("transactionCategories").get();
  const categories = {};
  categoriesSnapshot.forEach((doc) => {
    const cat = doc.data();
    categories[cat.name] = doc.id;
  });

  // Chuyển đổi services thành items
  if (bill.services && Array.isArray(bill.services)) {
    for (const service of bill.services) {
      let categoryId = null;

      // Map service type sang category
      if (service.type === "rent") {
        categoryId = categories["Tiền phòng"] || categories["Tiền thuê"] || null;
      } else if (service.type === "electric" || service.serviceName?.includes("Điện")) {
        categoryId = categories["Tiền điện"] || null;
      } else if (service.type === "water_meter" || service.serviceName?.includes("Nước")) {
        categoryId = categories["Tiền nước"] || null;
      } else if (service.serviceName?.includes("Internet") || service.serviceName?.includes("Wifi")) {
        categoryId = categories["Internet"] || null;
      } else if (service.serviceName?.includes("Rác")) {
        categoryId = categories["Phí vệ sinh"] || categories["Rác"] || null;
      }

      items.push({
        description: service.serviceName || "Dịch vụ",
        amount: service.amount || 0,
        categoryId: categoryId,
      });
    }
  }

  return items;
}

/**
 * Gửi thông báo khi thanh toán thành công (Casso auto)
 * Tạo thông báo cho web admin + gửi push notification cho app
 */
async function notifyCustomerPaymentSuccess(bill, customer, building) {
  try {
    const billYear = new Date(bill.billDate).getFullYear();

    // 1. Tạo thông báo cho WEB ADMIN (giống như khi bấm nút thu tiền)
    const adminNotificationData = {
      type: "payment_collected",
      buildingId: bill.buildingId,
      room: bill.room,
      customerId: bill.customerId,
      billId: bill.id,
      title: "Thu tiền thành công",
      message: `Đã thu tiền từ khách hàng ${customer?.name || "Khách hàng"} - Phòng ${building?.code || ""}-${bill.room} - Tháng ${bill.period}-${billYear}. Số tiền: ${formatMoney(bill.totalAmount)}đ`,
      customerMessage: `Đã thu tiền từ khách hàng ${customer?.name || "Khách hàng"}`,
      amount: bill.totalAmount,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("adminNotifications").add(adminNotificationData);
    console.log("✅ Created admin notification for web");

    // 2. Gửi push notification cho APP
    if (customer?.fcmToken) {
      const pushTitle = "✅ Thanh toán thành công";
      const pushMessage = `Cảm ơn bạn đã thanh toán hóa đơn tháng ${bill.period}-${billYear}. Số tiền: ${formatMoney(bill.totalAmount)}đ`;

      const message = {
        notification: {
          title: pushTitle,
          body: pushMessage,
        },
        data: {
          type: "payment_confirmed",
          billId: bill.id,
          buildingCode: building?.code || "",
          room: bill.room,
          amount: String(bill.totalAmount),
        },
        token: customer.fcmToken,
      };

      try {
        await admin.messaging().send(message);
        console.log("✅ Sent push notification to customer:", customer?.name);
      } catch (pushError) {
        console.error("❌ Error sending push notification:", pushError);
      }
    } else {
      console.log("⚠️ Customer has no FCM token, skipping push notification");
    }
  } catch (error) {
    console.error("❌ Error sending notification:", error);
  }
}

/**
 * Thông báo cho admin khi số tiền không khớp
 */
async function notifyAdminAboutMismatch(bill, transaction) {
  try {
    const notificationData = {
      type: "payment_mismatch",
      buildingId: bill.buildingId,
      room: bill.room,
      billId: bill.id,
      title: "⚠️ Số tiền chuyển khoản không khớp",
      message: `Hóa đơn phòng ${bill.room} tháng ${bill.period}: Số tiền nhận ${formatMoney(transaction.amount)} VNĐ, hóa đơn ${formatMoney(bill.totalAmount)} VNĐ`,
      expectedAmount: bill.totalAmount,
      receivedAmount: transaction.amount,
      transactionDescription: transaction.description,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("adminNotifications").add(notificationData);
    console.log("✅ Notified admin about amount mismatch");
  } catch (error) {
    console.error("❌ Error notifying admin:", error);
  }
}

/**
 * Tạo phiếu thu chưa duyệt khi không thể tự động xử lý
 */
async function createUnverifiedTransaction(cassoTransaction, reason) {
  try {
    const transactionCode = `PT${new Date().toISOString().replace(/\D/g, "").slice(0, 12)}`;
    
    const transactionData = {
      type: "income",
      code: transactionCode,
      buildingId: "", // Để trống vì không xác định được
      room: "",
      customerId: "",
      billId: "",
      accountId: "", // Admin sẽ phải chọn sổ quỹ
      title: `Thu tiền chuyển khoản - Cần kiểm tra`,
      payer: cassoTransaction.description || "Không xác định",
      date: new Date().toISOString().split("T")[0],
      items: [{
        description: `Chuyển khoản từ Casso - ${reason}`,
        amount: cassoTransaction.amount || 0,
        categoryId: null, // Admin sẽ phải chọn hạng mục
      }],
      totalAmount: cassoTransaction.amount || 0,
      approved: false, // CHƯA DUYỆT - quan trọng nhất
      paymentMethod: "bank_transfer",
      cassoTransactionId: cassoTransaction.id,
      cassoTransactionDescription: cassoTransaction.description,
      note: `Tự động tạo từ Casso - ${reason}. Nội dung gốc: "${cassoTransaction.description}"`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("transactions").add(transactionData);
    console.log("✅ Created unverified transaction:", transactionCode, "Reason:", reason);

    // Tạo thông báo cho admin
    const notificationData = {
      type: "unverified_payment",
      title: "💰 Thu tiền cần kiểm tra",
      message: `Nhận chuyển khoản ${formatMoney(cassoTransaction.amount)} VNĐ - ${reason}. Vui lòng kiểm tra và duyệt phiếu thu.`,
      transactionCode: transactionCode,
      cassoTransactionId: cassoTransaction.id,
      cassoDescription: cassoTransaction.description,
      amount: cassoTransaction.amount,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("adminNotifications").add(notificationData);
    console.log("✅ Created admin notification for unverified transaction");

  } catch (error) {
    console.error("❌ Error creating unverified transaction:", error);
  }
}

/**
 * Format tiền tệ
 */
function formatMoney(amount) {
  if (!amount) return "0";
  return Math.round(amount).toLocaleString("vi-VN");
}

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const logger = require("firebase-functions/logger");

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
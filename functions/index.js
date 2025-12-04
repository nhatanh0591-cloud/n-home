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
  console.log("🔁 Webhook handler (rev-v3-optimized): NEW LOGIC - filter by amount+month first!");

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

  const {id, description, amount, when, transactionDateTime} = transaction;
  const transactionTime = when || transactionDateTime; // Support both formats
  
  console.log("🕐 Raw transactionTime:", transactionTime);

  // 🔥 PHÂN BIỆT GIAO DỊCH THU/CHI THEO SỐ TIỀN
  if (amount > 0) {
    // 💰 GIAO DỊCH THU (tiền vào) - Logic cũ
    console.log("💰 Processing INCOME transaction");
    await processIncomeTransaction(transaction);
  } else if (amount < 0) {
    // 💸 GIAO DỊCH CHI (tiền ra) - Logic mới
    console.log("💸 Processing EXPENSE transaction");
    await processExpenseTransaction(transaction);
  } else {
    console.log("⚠️ Transaction amount is 0, skipping");
  }
}

/**
 * Xử lý giao dịch THU (logic cũ)
 */
async function processIncomeTransaction(transaction) {
  const {id, description, amount, when, transactionDateTime} = transaction;
  
  // Chuẩn hóa nội dung giao dịch để so khớp
  const normalizedDescription = description
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/Đ/g, "D")
      .replace(/đ/g, "d");
  
  console.log("🔍 Normalized description:", normalizedDescription);

  // Tìm hóa đơn theo logic đơn giản: chỉ theo số tiền, không cần tháng/năm
  const bill = await findMatchingBillByAmount(normalizedDescription, amount);

  if (!bill) {
    console.log("⚠️ No matching bill found for:", normalizedDescription, "amount:", amount);
    // Tạo phiếu thu chưa duyệt để admin tự kiểm tra
    await createUnverifiedTransaction(transaction, "Không tìm thấy hóa đơn khớp");
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
 * 🔥 XỬ LÝ GIAO DỊCH CHI (tiền ra) - TẠO PHIẾU CHI DRAFT
 */
async function processExpenseTransaction(transaction) {
  const {id, description, when, transactionDateTime} = transaction;
  const amount = Math.abs(transaction.amount); // Chuyển thành số dương
  const transactionTime = when || transactionDateTime;
  
  console.log("💸 Creating expense transaction draft for amount:", amount);
  
  // 🔥 CẮT BỎ PHẦN ĐUÔI TỪ DẦU "-" TRỞ ĐI (Ma giao dich/ Trace)
  const cleanDescription = description.split(' - ')[0].trim();
  console.log("🧹 Original description:", description);
  console.log("🧹 Cleaned description:", cleanDescription);
  
  // Chuẩn hóa nội dung giao dịch
  const normalizedDescription = cleanDescription
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/Đ/g, "D")
      .replace(/đ/g, "d");

  try {
    // Tạo mã phiếu chi tự động
    const transactionCode = `PC${new Date().toISOString().replace(/\D/g, "").slice(0, 12)}`;
    
    // Parse ngày từ Casso (format: "2025-11-06 15:30:45")
    let transactionDate;
    if (transactionTime) {
      const dateMatch = transactionTime.match(/^(\d{4}-\d{2}-\d{2})/);
      transactionDate = dateMatch ? dateMatch[1] : new Date().toISOString().split("T")[0];
    } else {
      transactionDate = new Date().toISOString().split("T")[0];
    }

    // Tạo phiếu chi DRAFT (chưa duyệt)
    const expenseData = {
      type: "expense",
      code: transactionCode,
      buildingId: "", // Admin sẽ chọn sau
      room: "",
      customerId: "",
      accountId: "", // Admin sẽ chọn sổ quỹ sau
      title: cleanDescription, // 🔥 CHỈ LẤY PHẦN TRƯỚC DẤU "-"
      payer: cleanDescription, // Nội dung đã làm sạch
      date: transactionDate,
      amount: amount,
      items: [{
        description: cleanDescription, // 🔥 CHỈ LẤY PHẦN TRƯỚC DẤU "-"
        amount: amount,
        categoryId: "" // Admin sẽ chọn hạng mục sau
      }],
      approved: false, // 🔥 CHƯA DUYỆT - Để admin kiểm tra và sửa
      cassoTransactionId: id,
      cassoData: {
        originalDescription: description,
        cleanedDescription: cleanDescription,
        transactionTime: transactionTime,
        processedAt: new Date().toISOString()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Lưu vào Firestore
    const docRef = await db.collection("transactions").add(expenseData);
    console.log("✅ Created expense draft transaction:", docRef.id);

    // Gửi thông báo cho admin
    await notifyAdminAboutExpenseDraft(expenseData, docRef.id);

  } catch (error) {
    console.error("❌ Error creating expense transaction:", error);
    throw error;
  }
}

// Hàm parsePaymentDescription đã được thay thế bằng logic mới trong findMatchingBillOptimized

/**
 * Tìm hóa đơn khớp theo số tiền đơn giản: không cần tháng/năm
 */
async function findMatchingBillByAmount(normalizedDescription, amount) {
  try {
    console.log("🔍 Searching bills with amount:", amount);
    
    // 1. Lọc hóa đơn chỉ theo số tiền + trạng thái
    const billsRef = db.collection("bills");
    const snapshot = await billsRef
        .where("totalAmount", "==", amount)
        .where("status", "==", "unpaid")
        .where("approved", "==", true)
        .get();

    if (snapshot.empty) {
      console.log("⚠️ No bills found matching amount");
      return null;
    }

    console.log("📋 Found", snapshot.docs.length, "bill(s) matching amount");

    // 2. Với mỗi hóa đơn, lấy tên khách hàng và so khớp
    for (const billDoc of snapshot.docs) {
      const bill = billDoc.data();
      
      // Ưu tiên dùng customerName nếu có (từ hóa đơn mới)
      let customerNormalizedName = null;
      
      if (bill.customerName) {
        // Hóa đơn mới đã có customerName
        customerNormalizedName = bill.customerName
            .toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/Đ/g, "D")
            .replace(/đ/g, "d")
            .trim();
      } else {
        // Hóa đơn cũ, phải lấy từ collection customers  
        const customerDoc = await db.collection("customers").doc(bill.customerId).get();
        if (customerDoc.exists) {
          const customer = customerDoc.data();
          customerNormalizedName = customer.name
              .toUpperCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/Đ/g, "D")
              .replace(/đ/g, "d")
              .trim();
        }
      }

      if (!customerNormalizedName) {
        console.log("⚠️ No customer name found for bill:", billDoc.id);
        continue;
      }

      console.log("🔍 Checking bill:", {
        billId: billDoc.id,
        customerName: customerNormalizedName,
        description: normalizedDescription.substring(0, 50) + "..."
      });

      // 3. Kiểm tra nội dung giao dịch có chứa tên khách hàng không
      if (normalizedDescription.includes(customerNormalizedName)) {
        console.log("✅ Found matching bill:", billDoc.id, "- Customer:", customerNormalizedName);
        return {id: billDoc.id, ...bill};
      }
    }

    console.log("⚠️ No bills found with matching customer name in description");
    return null;
  } catch (error) {
    console.error("❌ Error finding optimized bill:", error);
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

  // Lấy danh sách categories để tìm "Tiền hóa đơn"
  const categoriesSnapshot = await db.collection("transactionCategories").get();
  let billCategoryId = null;
  
  categoriesSnapshot.forEach((doc) => {
    const cat = doc.data();
    if (cat.name === "Tiền hóa đơn") {
      billCategoryId = doc.id;
    }
  });

  // TẠO 1 ITEM DUY NHẤT CHO TOÀN BỘ HÓA ĐƠN
  items.push({
    description: "Tiền hóa đơn",
    amount: bill.totalAmount || 0,
    categoryId: billCategoryId,
  });

  console.log("✅ Created transaction item for bill:", items);
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
 * 🔥 THÔNG BÁO CHO ADMIN VỀ PHIẾU CHI DRAFT MỚI
 */
async function notifyAdminAboutExpenseDraft(expenseData, transactionId) {
  try {
    const notificationData = {
      type: "expense_draft_created",
      transactionId: transactionId,
      title: "💸 Phiếu chi draft từ Casso",
      message: `Tạo phiếu chi chưa duyệt: ${formatMoney(expenseData.amount)} - ${expenseData.title}`,
      amount: expenseData.amount,
      description: expenseData.payer,
      cassoTransactionId: expenseData.cassoTransactionId,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        transactionId: transactionId,
        amount: expenseData.amount,
        description: expenseData.payer
      }
    };

    await db.collection("adminNotifications").add(notificationData);
    console.log("✅ Notified admin about new expense draft:", transactionId);
  } catch (error) {
    console.error("❌ Error notifying admin about expense draft:", error);
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
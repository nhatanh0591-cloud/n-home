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
 * Chuẩn hóa văn bản tiếng Việt để so khớp: bỏ dấu, viết hoa, cắt khoảng trắng thừa
 */
function normalizeText(str) {
  return (str || "")
      .toUpperCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/Đ/g, "D")
      .replace(/đ/g, "d")
      .trim();
}

/**
 * Xử lý giao dịch THU - chấp nhận cả thanh toán một phần, cộng dồn dần vào hóa đơn
 * cho tới khi đủ (không còn bắt buộc số tiền chuyển vào phải bằng đúng tổng hóa đơn)
 */
async function processIncomeTransaction(transaction) {
  const {description, amount} = transaction;

  // Chuẩn hóa nội dung giao dịch để so khớp
  const normalizedDescription = normalizeText(description);

  console.log("🔍 Normalized description:", normalizedDescription);

  // Tìm hóa đơn theo tên khách hàng trong nội dung chuyển khoản (không lọc theo số tiền,
  // vì khách có thể thanh toán một phần rồi thanh toán tiếp phần còn lại sau)
  const {bill, ambiguous} = await findMatchingBillByCustomer(normalizedDescription);

  if (ambiguous) {
    console.log("⚠️ Ambiguous match - khách có nhiều hóa đơn chưa thanh toán, không tự xác định được");
    await createUnverifiedTransaction(transaction, "Khách có nhiều hóa đơn chưa thanh toán, không tự xác định được hóa đơn nào");
    return;
  }

  if (!bill) {
    console.log("⚠️ No matching bill found for:", normalizedDescription, "amount:", amount);
    // Tạo phiếu thu chưa duyệt để admin tự kiểm tra
    await createUnverifiedTransaction(transaction, "Không tìm thấy hóa đơn khớp");
    return;
  }

  console.log("✅ Found matching bill:", bill.id);

  // Phòng hờ trường hợp đua hiếm gặp: hóa đơn vừa được thanh toán xong ở nơi khác
  if (bill.status === "paid") {
    console.log("⚠️ Bill already paid:", bill.id);
    await createUnverifiedTransaction(transaction, "Hóa đơn khớp tên khách đã ở trạng thái đã thanh toán");
    return;
  }

  // Kiểm tra số tiền chuyển vào có vượt quá số còn phải thu không (cho phép sai lệch 1000đ)
  const currentPaidAmount = bill.paidAmount || 0;
  const remainingAmount = bill.totalAmount - currentPaidAmount;
  if (amount - remainingAmount > 1000) {
    console.log("⚠️ Amount exceeds remaining balance. Remaining:", remainingAmount, "Got:", amount);
    await notifyAdminAboutMismatch(bill, transaction, remainingAmount);
    await createUnverifiedTransaction(transaction, "Số tiền chuyển vượt quá số còn phải thu của hóa đơn");
    return;
  }

  // CẬP NHẬT HÓA ĐƠN (cộng dồn số đã thu) VÀ TẠO PHIẾU THU đúng số tiền lần này
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
  const normalizedDescription = normalizeText(cleanDescription);

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

/**
 * Tìm hóa đơn khớp theo tên khách hàng trong nội dung chuyển khoản.
 * Không lọc theo số tiền nữa (khách có thể thanh toán nhiều lần cho tới khi đủ).
 * Trả về { bill, ambiguous }: ambiguous = true nếu khách có từ 2 hóa đơn chưa thanh toán
 * trở lên cùng khớp một lúc - trường hợp này KHÔNG tự xác định, để admin xử lý tay.
 */
async function findMatchingBillByCustomer(normalizedDescription) {
  try {
    // 1. Lấy tất cả hóa đơn chưa thanh toán + đã duyệt
    const billsRef = db.collection("bills");
    const snapshot = await billsRef
        .where("status", "==", "unpaid")
        .where("approved", "==", true)
        .get();

    if (snapshot.empty) {
      console.log("⚠️ No unpaid bills found");
      return {bill: null, ambiguous: false};
    }

    console.log("📋 Checking", snapshot.docs.length, "unpaid bill(s) for customer name match");

    // 2. Với mỗi hóa đơn, lấy tên khách hàng và so khớp với nội dung chuyển khoản
    const matchedBills = [];
    for (const billDoc of snapshot.docs) {
      const bill = billDoc.data();

      // Ưu tiên dùng customerName nếu có (từ hóa đơn mới)
      let customerNormalizedName = null;

      if (bill.customerName) {
        customerNormalizedName = normalizeText(bill.customerName);
      } else {
        // Hóa đơn cũ, phải lấy từ collection customers
        const customerDoc = await db.collection("customers").doc(bill.customerId).get();
        if (customerDoc.exists) {
          customerNormalizedName = normalizeText(customerDoc.data().name);
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
        matchedBills.push({id: billDoc.id, ...bill});
      }
    }

    if (matchedBills.length === 0) {
      console.log("⚠️ No bills found with matching customer name in description");
      return {bill: null, ambiguous: false};
    }

    if (matchedBills.length > 1) {
      console.log("⚠️ Ambiguous - multiple unpaid bills matched same customer name:", matchedBills.map((b) => b.id));
      return {bill: null, ambiguous: true};
    }

    console.log("✅ Found matching bill:", matchedBills[0].id);
    return {bill: matchedBills[0], ambiguous: false};
  } catch (error) {
    console.error("❌ Error finding matching bill:", error);
    return {bill: null, ambiguous: false};
  }
}

/**
 * Cập nhật hóa đơn (cộng dồn số tiền đã thu) và tạo phiếu thu đúng số tiền của lần chuyển khoản này
 */
async function updateBillAndCreateTransaction(bill, cassoTransaction) {
  try {
    const paymentAmount = cassoTransaction.amount;
    const previousPaidAmount = bill.paidAmount || 0;
    const newPaidAmount = previousPaidAmount + paymentAmount;
    const isFullyPaid = newPaidAmount >= bill.totalAmount;

    // 1. Cập nhật hóa đơn: cộng dồn paidAmount, chỉ chuyển "paid" khi đã thu đủ
    await db.collection("bills").doc(bill.id).update({
      status: isFullyPaid ? "paid" : "unpaid",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
      paidAmount: newPaidAmount,
      paymentMethod: "bank_transfer",
      cassoTransactionId: cassoTransaction.id,
      cassoTransactionDescription: cassoTransaction.description,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Updated bill ${bill.id}: paid ${newPaidAmount}/${bill.totalAmount}, status=${isFullyPaid ? "paid" : "unpaid"}`);

    // 2. Lấy thông tin bổ sung
    const buildingDoc = await db.collection("buildings").doc(bill.buildingId).get();
    const building = buildingDoc.exists ? buildingDoc.data() : null;

    const customerDoc = await db.collection("customers").doc(bill.customerId).get();
    const customer = customerDoc.exists ? customerDoc.data() : null;

    // 3. Tạo phiếu thu tự động - CHỈ đúng số tiền của lần chuyển khoản này, không phải cả hóa đơn
    const transactionItems = await createTransactionItemsFromBill(bill, paymentAmount);

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
      title: `Thu tiền phòng ${building?.code || ""} - ${bill.room} - Tháng ${bill.period}${isFullyPaid ? "" : " (thanh toán một phần)"}`,
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
    console.log("✅ Created transaction receipt:", transactionCode, "amount:", paymentAmount);

    // 4. Gửi thông báo cho khách hàng / admin
    await notifyCustomerPaymentSuccess(bill, customer, building, paymentAmount, newPaidAmount, isFullyPaid);

    console.log("🎉 Payment processed successfully for bill:", bill.id);
  } catch (error) {
    console.error("❌ Error updating bill and creating transaction:", error);
    throw error;
  }
}

/**
 * Tạo các items cho phiếu thu - dùng đúng số tiền thực nhận của lần thanh toán này
 * (mặc định lấy tổng hóa đơn nếu không truyền amount, để tương thích ngược)
 */
async function createTransactionItemsFromBill(bill, amount) {
  // Lấy danh sách categories để tìm "Tiền hóa đơn"
  const categoriesSnapshot = await db.collection("transactionCategories").get();
  let billCategoryId = null;

  categoriesSnapshot.forEach((doc) => {
    const cat = doc.data();
    if (cat.name === "Tiền hóa đơn") {
      billCategoryId = doc.id;
    }
  });

  // Tạo 1 item duy nhất cho số tiền của lần thanh toán này
  const items = [{
    description: "Tiền hóa đơn",
    amount: amount != null ? amount : (bill.totalAmount || 0),
    categoryId: billCategoryId,
  }];

  return items;
}

/**
 * Gửi thông báo khi thanh toán thành công qua Casso - hỗ trợ cả thanh toán một phần
 * Tạo thông báo cho web admin + gửi push notification cho app
 */
async function notifyCustomerPaymentSuccess(bill, customer, building, paymentAmount, totalPaidAmount, isFullyPaid) {
  try {
    const billYear = new Date(bill.billDate).getFullYear();
    const remainingAfter = Math.max(bill.totalAmount - totalPaidAmount, 0);

    // 1. Tạo thông báo cho WEB ADMIN (giống như khi bấm nút thu tiền)
    const adminMessage = isFullyPaid
        ? `Đã thu tiền từ khách hàng ${customer?.name || "Khách hàng"} - Phòng ${building?.code || ""}-${bill.room} - Tháng ${bill.period}-${billYear}. Số tiền: ${formatMoney(bill.totalAmount)}đ`
        : `Khách hàng ${customer?.name || "Khách hàng"} thanh toán một phần - Phòng ${building?.code || ""}-${bill.room} - Tháng ${bill.period}-${billYear}. Đã đóng lần này: ${formatMoney(paymentAmount)}đ, còn thiếu: ${formatMoney(remainingAfter)}đ`;

    const adminNotificationData = {
      type: "payment_collected",
      buildingId: bill.buildingId,
      room: bill.room,
      customerId: bill.customerId,
      billId: bill.id,
      title: isFullyPaid ? "Thu tiền thành công" : "Thu tiền một phần",
      message: adminMessage,
      customerMessage: `Đã thu tiền từ khách hàng ${customer?.name || "Khách hàng"}`,
      amount: paymentAmount,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("adminNotifications").add(adminNotificationData);
    console.log("✅ Created admin notification for web");

    // 2. Gửi push notification cho APP
    if (customer?.fcmToken) {
      const pushTitle = isFullyPaid ? "✅ Thanh toán thành công" : "✅ Đã ghi nhận thanh toán một phần";
      const pushMessage = isFullyPaid
          ? `Cảm ơn bạn đã thanh toán hóa đơn tháng ${bill.period}-${billYear}. Số tiền: ${formatMoney(bill.totalAmount)}đ`
          : `Đã ghi nhận ${formatMoney(paymentAmount)}đ cho hóa đơn tháng ${bill.period}-${billYear}. Còn thiếu: ${formatMoney(remainingAfter)}đ`;

      const message = {
        notification: {
          title: pushTitle,
          body: pushMessage,
        },
        data: {
          type: isFullyPaid ? "payment_confirmed" : "payment_partial",
          billId: bill.id,
          buildingCode: building?.code || "",
          room: bill.room,
          amount: String(paymentAmount),
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
 * Thông báo cho admin khi số tiền chuyển vào vượt quá số còn phải thu của hóa đơn
 */
async function notifyAdminAboutMismatch(bill, transaction, remainingAmount) {
  try {
    const notificationData = {
      type: "payment_mismatch",
      buildingId: bill.buildingId,
      room: bill.room,
      billId: bill.id,
      title: "⚠️ Số tiền chuyển khoản vượt quá số còn phải thu",
      message: `Hóa đơn phòng ${bill.room} tháng ${bill.period}: Số tiền nhận ${formatMoney(transaction.amount)} VNĐ, còn phải thu ${formatMoney(remainingAmount)} VNĐ`,
      expectedAmount: remainingAmount,
      receivedAmount: transaction.amount,
      transactionDescription: transaction.description,
      isRead: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("adminNotifications").add(notificationData);
    console.log("✅ Notified admin about amount exceeding remaining balance");
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

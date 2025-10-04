const { appendRows } = require('../src/clients/sheets');

(async () => {
  try {
    const headers = [["customer_id","email","name","phone","city","region","country","zip","first_seen","last_seen"]];
    await appendRows("Customer_Dim", headers);
    console.log("✅ Customer_Dim initialized (headers appended if needed)");
  } catch (e) {
    console.error("Init failed:", e.message);
    process.exit(1);
  }
})();

/* =========================================
   MILK MANAGER - APP.JS
   Morning and Evening entries separately
   Displayed together in one customer row
========================================= */

const STORAGE_KEY = "milkManager_v1";

const $ = (id) => document.getElementById(id);

const today = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const money = (amount) =>
    "₨" + Number(amount || 0).toLocaleString("en-PK", {
        maximumFractionDigits: 2
    });

const number = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[char]));

// -----------------------------------------
// LOAD AND SAVE DATA
// -----------------------------------------

function loadData() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

        if (!saved) {
            return {
                customers: [],
                entries: [],
                payments: []
            };
        }

        const data = {
            customers: Array.isArray(saved.customers) ? saved.customers : [],
            entries: Array.isArray(saved.entries) ? saved.entries : [],
            payments: Array.isArray(saved.payments) ? saved.payments : []
        };

        // Convert old separate morning/evening records
        // into one record for each customer and date.
        const grouped = {};

        data.entries.forEach(entry => {
            const customerId = String(
                entry.customerId ?? entry.customer_id ?? ""
            );

            const date = entry.date || today();
            const key = `${customerId}_${date}`;

            if (!grouped[key]) {
                grouped[key] = {
                    id: entry.id || uid(),
                    customerId,
                    date,
                    rate: number(entry.rate),
                    morning: 0,
                    evening: 0,
                    notes: entry.notes || ""
                };
            }

            const session = String(entry.session || "").toLowerCase();

            if (session === "morning") {
                grouped[key].morning = number(entry.quantity);
            } else if (session === "evening") {
                grouped[key].evening = number(entry.quantity);
            } else {
                grouped[key].morning = number(
                    entry.morning ?? entry.morningMilk
                );
                grouped[key].evening = number(
                    entry.evening ?? entry.eveningMilk
                );
            }

            if (entry.morning !== undefined) {
                grouped[key].morning = number(entry.morning);
            }

            if (entry.evening !== undefined) {
                grouped[key].evening = number(entry.evening);
            }

            if (entry.rate !== undefined) {
                grouped[key].rate = number(entry.rate);
            }
        });

        data.entries = Object.values(grouped);

        return data;

    } catch (error) {
        console.error("Data loading error:", error);

        return {
            customers: [],
            entries: [],
            payments: []
        };
    }
}

let state = loadData();

function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// -----------------------------------------
// GENERAL HELPERS
// -----------------------------------------

function customerById(id) {
    return state.customers.find(
        customer => String(customer.id) === String(id)
    );
}

function getCustomerName(id) {
    return customerById(id)?.name || "Unknown customer";
}

function getEntry(customerId, date) {
    return state.entries.find(entry =>
        String(entry.customerId) === String(customerId) &&
        entry.date === date
    );
}

function entryTotal(entry) {
    return number(entry.morning) + number(entry.evening);
}

function entryRate(entry) {
    return number(entry.rate ?? customerById(entry.customerId)?.rate);
}

function entryValue(entry) {
    return entryTotal(entry) * entryRate(entry);
}

function showToast(message) {
    const toast = $("toast");

    if (!toast) {
        alert(message);
        return;
    }

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

function openModal(title, eyebrow, fields, submitText = "Save record") {
    $("modalTitle").textContent = title;
    $("modalEyebrow").textContent = eyebrow;

    $("modalFields").innerHTML = fields;

    $("saveModal").textContent = submitText;

    $("modalBackdrop").classList.add("show");
}

function closeModal() {
    $("modalBackdrop").classList.remove("show");
    $("modalForm").onsubmit = null;
    $("modalFields").innerHTML = "";
}

// -----------------------------------------
// NAVIGATION
// -----------------------------------------

function showPage(page) {
    document.querySelectorAll(".page").forEach(section => {
        section.classList.remove("active");
    });

    document.querySelectorAll(".nav-link").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.page === page
        );
    });

    const target = $(`page-${page}`);

    if (target) {
        target.classList.add("active");
    }

    const names = {
        dashboard: "Dashboard",
        customers: "Customers",
        entries: "Milk entries",
        payments: "Payments",
        reports: "Reports"
    };

    $("breadcrumbPage").textContent = names[page] || "Dashboard";

    $("sidebar")?.classList.remove("open");

    if (page === "reports") {
        // Do not calculate until Generate is clicked.
        reportGenerated = false;
        clearReport();
    }

    renderAll();
}

document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
        showPage(button.dataset.page);
    });
});

document.querySelectorAll("[data-page-link]").forEach(button => {
    button.addEventListener("click", () => {
        showPage(button.dataset.pageLink);
    });
});

$("mobileMenu")?.addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
});

// -----------------------------------------
// CUSTOMER MANAGEMENT
// -----------------------------------------

function openCustomerForm(customer = null) {
    const isEdit = Boolean(customer);

   const fields = `
    <div class="field full">
        <label>Customer Name</label>
        <input name="name" required
            value="${escapeHTML(customer?.name || "")}"
            placeholder="Enter customer name">
    </div>

    <div class="field full">
        <label>Phone Number</label>
        <input name="phone"
            value="${escapeHTML(customer?.phone || "")}"
            placeholder="03XXXXXXXXX">
    </div>

    <div class="field full">
        <label>Address</label>
        <input name="address"
            value="${escapeHTML(customer?.address || "")}"
            placeholder="Customer address">
    </div>

    <div class="field full">
        <label>Milk Rate Per Litre (Rs.)</label>
        <input name="rate"
            type="number"
            min="0"
            step="0.01"
            required
            value="${number(customer?.rate)}"
            placeholder="Enter milk rate">
    </div>
`;

    openModal(
        isEdit ? "Edit customer" : "Add customer",
        "CUSTOMER DETAILS",
        fields,
        isEdit ? "Update customer" : "Save customer"
    );

    $("modalForm").onsubmit = event => {
        event.preventDefault();

        const form = new FormData(event.target);

        const details = {
            name: form.get("name").trim(),
            phone: form.get("phone").trim(),
            address: form.get("address").trim(),
            rate: number(form.get("rate")),
            active: customer?.active !== false
        };

        if (isEdit) {
            Object.assign(customer, details);
        } else {
            state.customers.push({
                id: uid(),
                ...details
            });
        }

        saveData();
        closeModal();
        renderAll();
        showToast(isEdit ? "Customer updated" : "Customer added");
    };
}

$("addCustomerBtn")?.addEventListener("click", () => {
    openCustomerForm();
});

function renderCustomers() {
    const search = ($("customerSearch")?.value || "").toLowerCase();

    const customers = state.customers.filter(customer =>
        `${customer.name} ${customer.phone || ""}`
            .toLowerCase()
            .includes(search)
    );

    $("customerNavCount").textContent = state.customers.length;
    $("customerCountLabel").textContent =
        `${customers.length} customers`;

    $("customersTable").innerHTML = customers.length
        ? customers.map(customer => `
            <tr>
                <td><strong>${escapeHTML(customer.name)}</strong></td>
                <td>${escapeHTML(customer.phone || "—")}</td>
                <td>${escapeHTML(customer.address || "—")}</td>
                <td>${money(customer.rate)}</td>
                <td>
                    <span class="status-badge">
                        ${customer.active === false ? "Inactive" : "Active"}
                    </span>
                </td>
                <td>
                    <button class="text-button"
                        data-edit-customer="${customer.id}">Edit</button>
                    <button class="text-button"
                        data-delete-customer="${customer.id}">Delete</button>
                </td>
            </tr>
        `).join("")
        : `<tr><td colspan="6">No customers found.</td></tr>`;
}

$("customerSearch")?.addEventListener("input", renderCustomers);

// -----------------------------------------
// MILK ENTRY - MORNING / EVENING SEPARATE
// -----------------------------------------

function openEntryForm(entry = null, selectedSession = "morning") {
    if (!state.customers.length) {
        showToast("Please add a customer first.");
        showPage("customers");
        return;
    }

    const currentSession = selectedSession;
    const currentCustomer = entry?.customerId || "";
    const currentDate = entry?.date || today();

    const customerOptions = state.customers
        .filter(customer => customer.active !== false)
        .map(customer => `
            <option value="${customer.id}"
                ${String(customer.id) === String(currentCustomer) ? "selected" : ""}>
                ${escapeHTML(customer.name)}
            </option>
        `).join("");

    const quantity = entry
        ? number(entry[currentSession])
        : "";

   const fields = `
    <div class="field full">
        <label>Customer</label>
        <select name="customerId" id="entryCustomer" required>
            <option value="">Select customer</option>
            ${customerOptions}
        </select>
    </div>

    <div class="field full">
        <label>Date</label>
        <input name="date" type="date"
            value="${currentDate}" required>
    </div>

    <div class="field full">
        <label>Collection Time</label>
        <select name="session" id="entrySession">
            <option value="morning"
                ${currentSession === "morning" ? "selected" : ""}>
                ☀ Morning
            </option>

            <option value="evening"
                ${currentSession === "evening" ? "selected" : ""}>
                ☾ Evening
            </option>
        </select>
    </div>

    <div class="field full">
        <label>Milk Quantity (Litres)</label>
        <input name="quantity"
            type="number"
            min="0"
            step="0.01"
            required
            value="${quantity}"
            placeholder="Enter milk quantity">
    </div>

    <p class="field-hint full">
        Only the selected session will be saved.
        Morning and evening entries are separate.
    </p>
`;
    openModal(
        entry ? "Edit milk entry" : "Record milk",
        currentSession === "morning" ? "☀ MORNING COLLECTION" : "☾ EVENING COLLECTION",
        fields,
        entry ? "Update entry" : "Save entry"
    );

    $("modalForm").onsubmit = event => {
        event.preventDefault();

        const form = new FormData(event.target);

        const customerId = form.get("customerId");
        const date = form.get("date");
        const session = form.get("session");
        const quantity = number(form.get("quantity"));

        if (!customerId || !date || quantity < 0) {
            showToast("Please enter valid details.");
            return;
        }

        let record = getEntry(customerId, date);

        if (!record) {
            record = {
                id: uid(),
                customerId,
                date,
                rate: number(customerById(customerId)?.rate),
                morning: 0,
                evening: 0
            };

            state.entries.push(record);
        }

        // Save only the selected session.
        // Morning entry does not require evening quantity.
        record[session] = quantity;

        // Keep the rate that was active when the entry was made.
        if (!record.rate) {
            record.rate = number(customerById(customerId)?.rate);
        }

        saveData();
        closeModal();
        renderAll();

        showToast(
            session === "morning"
                ? "Morning milk saved successfully"
                : "Evening milk saved successfully"
        );
    };

    $("entrySession").addEventListener("change", event => {
        $("modalEyebrow").textContent =
            event.target.value === "morning"
                ? "☀ MORNING COLLECTION"
                : "☾ EVENING COLLECTION";

        $("modalTitle").textContent =
            event.target.value === "morning"
                ? "Record morning milk"
                : "Record evening milk";

        $("modalForm").querySelector('[name="quantity"]').placeholder =
            `Enter ${event.target.value} milk`;
    });
}

document.querySelectorAll("[data-open-entry]").forEach(button => {
    button.addEventListener("click", () => openEntryForm());
});

function renderEntries() {
    const search = ($("entrySearch")?.value || "").toLowerCase();
    const dateFilter = $("entryDateFilter")?.value || "";

    const entries = state.entries
        .filter(entry => {
            const name = getCustomerName(entry.customerId).toLowerCase();

            return name.includes(search) &&
                (!dateFilter || entry.date === dateFilter);
        })
        .sort((a, b) => b.date.localeCompare(a.date));

    const html = entries.length
        ? entries.map(entry => `
            <tr>
                <td><strong>${escapeHTML(getCustomerName(entry.customerId))}</strong></td>
                <td>${money(entryRate(entry))}</td>
                <td>${number(entry.morning).toFixed(2)} L</td>
                <td>${number(entry.evening).toFixed(2)} L</td>
                <td>${escapeHTML(entry.date)}</td>
                <td>
                    <button class="text-button"
                        data-edit-session="${entry.id}"
                        data-session="morning">Edit AM</button>
                    <button class="text-button"
                        data-edit-session="${entry.id}"
                        data-session="evening">Edit PM</button>
                    <button class="text-button"
                        data-delete-entry="${entry.id}">Delete</button>
                </td>
            </tr>
        `).join("")
        : `<tr><td colspan="6">No milk entries found.</td></tr>`;

    $("entriesTable").innerHTML = html;

    $("recentEntries").innerHTML = state.entries
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 5)
        .map(entry => `
            <tr>
                <td>${escapeHTML(getCustomerName(entry.customerId))}</td>
                <td>${money(entryRate(entry))}</td>
                <td>${number(entry.morning).toFixed(2)} L</td>
                <td>${number(entry.evening).toFixed(2)} L</td>
                <td>${escapeHTML(entry.date)}</td>
                <td>
                    <button class="text-button"
                        data-edit-session="${entry.id}"
                        data-session="morning">Edit</button>
                </td>
            </tr>
        `).join("") || `<tr><td colspan="6">No records yet.</td></tr>`;
}

$("entrySearch")?.addEventListener("input", renderEntries);
$("entryDateFilter")?.addEventListener("change", renderEntries);

// -----------------------------------------
// PAYMENTS
// -----------------------------------------

function openPaymentForm() {
    if (!state.customers.length) {
        showToast("Please add a customer first.");
        showPage("customers");
        return;
    }

    const options = state.customers.map(customer => `
        <option value="${customer.id}">
            ${escapeHTML(customer.name)}
        </option>
    `).join("");

   const fields = `
    <div class="field full">
        <label>Customer</label>
        <select name="customerId" required>
            <option value="">Select customer</option>
            ${options}
        </select>
    </div>

    <div class="field full">
        <label>Payment Date</label>
        <input name="date" type="date"
            value="${today()}" required>
    </div>

    <div class="field full">
        <label>Amount Paid (Rs.)</label>
        <input name="amount"
            type="number"
            min="1"
            step="0.01"
            placeholder="Enter payment amount"
            required>
    </div>

    <div class="field full">
        <label>Payment Method</label>
        <select name="method">
            <option value="Cash">Cash</option>
            <option value="Bank transfer">Bank transfer</option>
            <option value="JazzCash">JazzCash</option>
            <option value="Easypaisa">Easypaisa</option>
            <option value="Other">Other</option>
        </select>
    </div>

    <div class="field full">
        <label>Notes</label>
        <textarea name="notes"
            rows="3"
            placeholder="Optional payment notes"></textarea>
    </div>
`;

    openModal("Record payment", "PAYMENT DETAILS", fields);

    $("modalForm").onsubmit = event => {
        event.preventDefault();

        const form = new FormData(event.target);

        state.payments.push({
            id: uid(),
            customerId: form.get("customerId"),
            date: form.get("date"),
            amount: number(form.get("amount")),
            method: form.get("method"),
            notes: form.get("notes")
        });

        saveData();
        closeModal();
        renderAll();
        showToast("Payment saved successfully");
    };
}

$("addPaymentBtn")?.addEventListener("click", openPaymentForm);

function renderPayments() {
    $("paymentMilkValue").textContent = "Use Reports";

    const paid = state.payments.reduce(
        (sum, payment) => sum + number(payment.amount), 0
    );

    $("paymentPaid").textContent = money(paid);
    $("paymentDue").textContent = "Use Reports";

    const payments = state.payments
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date));

    $("paymentsTable").innerHTML = payments.length
        ? payments.map(payment => `
            <tr>
                <td>${escapeHTML(getCustomerName(payment.customerId))}</td>
                <td>${escapeHTML(payment.date)}</td>
                <td>${escapeHTML(payment.method || "Cash")}</td>
                <td>${escapeHTML(payment.notes || "—")}</td>
                <td><strong>${money(payment.amount)}</strong></td>
                <td>
                    <button class="text-button"
                        data-delete-payment="${payment.id}">Delete</button>
                </td>
            </tr>
        `).join("")
        : `<tr><td colspan="6">No payments recorded yet.</td></tr>`;
}

// -----------------------------------------
// REPORTS
// -----------------------------------------

let reportGenerated = false;

function clearReport() {
    $("reportMilk").textContent = "—";
    $("reportAmount").textContent = "—";
    $("reportPaid").textContent = "—";
    $("reportBalance").textContent = "—";
    $("reportTable").innerHTML =
        `<tr><td colspan="6">Select a date range and press Generate.</td></tr>`;
}

function setReportDates(preset) {
    const end = new Date();
    const start = new Date();

    if (preset === "10") {
        start.setDate(end.getDate() - 9);
    } else if (preset === "30") {
        start.setDate(end.getDate() - 29);
    } else if (preset === "month") {
        start.setDate(1);
    }

    const format = date => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const d = String(date.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
    };

    if (preset !== "custom") {
        $("reportFrom").value = format(start);
        $("reportTo").value = format(end);
    }

    document.querySelectorAll("[data-preset]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.preset === preset
        );
    });

    reportGenerated = false;
    clearReport();
}

document.querySelectorAll("[data-preset]").forEach(button => {
    button.addEventListener("click", () => {
        setReportDates(button.dataset.preset);
    });
});

$("reportFrom")?.addEventListener("change", () => {
    reportGenerated = false;
    clearReport();
});

$("reportTo")?.addEventListener("change", () => {
    reportGenerated = false;
    clearReport();
});

function generateReport() {
    const from = $("reportFrom").value;
    const to = $("reportTo").value;

    if (!from || !to || from > to) {
        showToast("Please select a valid date range.");
        return;
    }

    const entries = state.entries.filter(entry =>
        entry.date >= from && entry.date <= to
    );

    const payments = state.payments.filter(payment =>
        payment.date >= from && payment.date <= to
    );

    const totalMilk = entries.reduce(
        (sum, entry) => sum + entryTotal(entry), 0
    );

    const totalValue = entries.reduce(
        (sum, entry) => sum + entryValue(entry), 0
    );

    const totalPaid = payments.reduce(
        (sum, payment) => sum + number(payment.amount), 0
    );

    $("reportMilk").textContent = `${totalMilk.toFixed(2)} L`;
    $("reportAmount").textContent = money(totalValue);
    $("reportPaid").textContent = money(totalPaid);
    $("reportBalance").textContent = money(totalValue - totalPaid);
    $("reportPeriodLabel").textContent = `${from} to ${to}`;

    $("reportTable").innerHTML = state.customers.map(customer => {
        const customerEntries = entries.filter(
            entry => String(entry.customerId) === String(customer.id)
        );

        const customerPayments = payments.filter(
            payment => String(payment.customerId) === String(customer.id)
        );

        const milk = customerEntries.reduce(
            (sum, entry) => sum + entryTotal(entry), 0
        );

        const value = customerEntries.reduce(
            (sum, entry) => sum + entryValue(entry), 0
        );

        const paidInPeriod = customerPayments.reduce(
            (sum, payment) => sum + number(payment.amount), 0
        );

        const allMilkValue = state.entries
            .filter(entry => String(entry.customerId) === String(customer.id))
            .reduce((sum, entry) => sum + entryValue(entry), 0);

        const allPaid = state.payments
            .filter(payment => String(payment.customerId) === String(customer.id))
            .reduce((sum, payment) => sum + number(payment.amount), 0);

        return `
            <tr>
                <td><strong>${escapeHTML(customer.name)}</strong></td>
                <td>${milk.toFixed(2)} L</td>
                <td>${money(value)}</td>
                <td>${money(paidInPeriod)}</td>
                <td>${money(value - paidInPeriod)}</td>
                <td>${money(allMilkValue - allPaid)}</td>
            </tr>
        `;
    }).join("") || `<tr><td colspan="6">No customers found.</td></tr>`;

    reportGenerated = true;
    showToast("Report generated successfully");
}

$("generateReport")?.addEventListener("click", generateReport);

$("printReport")?.addEventListener("click", () => {
    if (!reportGenerated) {
        showToast("Please generate the report first.");
        return;
    }

    window.print();
});

// -----------------------------------------
// DASHBOARD
// -----------------------------------------

function renderDashboard() {
    const date = today();

    const todayEntries = state.entries.filter(
        entry => entry.date === date
    );

    const morningEntries = todayEntries.filter(
        entry => number(entry.morning) > 0
    );

    const eveningEntries = todayEntries.filter(
        entry => number(entry.evening) > 0
    );

    $("statTodayMilk").textContent = todayEntries.length;
    $("statTodayEntries").textContent =
        `${todayEntries.length} customer records`;

    $("statTodayAmount").textContent = "On demand";
    $("statCustomers").textContent =
        state.customers.filter(customer => customer.active !== false).length;

    $("statOutstanding").textContent = "See reports";

    $("dashboardDate").textContent = date;

    $("morningCount").textContent =
        `${morningEntries.length} customer entries`;

    $("eveningCount").textContent =
        `${eveningEntries.length} customer entries`;

    $("morningMilk").textContent =
        `${morningEntries.length} customers`;

    $("eveningMilk").textContent =
        `${eveningEntries.length} customers`;

    $("morningAmount").textContent = "Quantity saved only";
    $("eveningAmount").textContent = "Quantity saved only";

    $("morningTrack").style.width =
        `${morningEntries.length ? 100 : 0}%`;

    $("eveningTrack").style.width =
        `${eveningEntries.length ? 100 : 0}%`;

    $("collectionTotal").textContent = "Calculate in Reports";
}

// -----------------------------------------
// EXPORT BACKUP
// -----------------------------------------

$("exportBackup")?.addEventListener("click", () => {
    const backup = JSON.stringify(state, null, 2);

    const blob = new Blob([backup], {
        type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `milk-manager-backup-${today()}.json`;
    link.click();

    URL.revokeObjectURL(url);

    showToast("Backup downloaded");
});

// -----------------------------------------
// MODAL EVENTS
// -----------------------------------------

$("closeModal")?.addEventListener("click", closeModal);
$("cancelModal")?.addEventListener("click", closeModal);

$("modalBackdrop")?.addEventListener("click", event => {
    if (event.target === $("modalBackdrop")) {
        closeModal();
    }
});

// -----------------------------------------
// TABLE ACTIONS
// -----------------------------------------

// -----------------------------------------
// TABLE ACTIONS
// -----------------------------------------

document.addEventListener("click", event => {

    // EDIT CUSTOMER
    const editCustomer = event.target.closest("[data-edit-customer]");

    if (editCustomer) {
        const customer = customerById(
            editCustomer.dataset.editCustomer
        );

        if (customer) openCustomerForm(customer);
        return;
    }


    // DELETE CUSTOMER
    const deleteCustomer = event.target.closest("[data-delete-customer]");

    if (deleteCustomer) {
        const id = deleteCustomer.dataset.deleteCustomer;
        const customer = customerById(id);

        if (!customer) return;

        const hasEntries = state.entries.some(
            entry => String(entry.customerId) === String(id)
        );

        const hasPayments = state.payments.some(
            payment => String(payment.customerId) === String(id)
        );

        let message = `Delete ${customer.name}?`;

        if (hasEntries || hasPayments) {
            message +=
                "\n\nAll milk records and payment history of this customer will also be deleted.";
        }

        if (!confirm(message)) return;

        state.customers = state.customers.filter(
            item => String(item.id) !== String(id)
        );

        state.entries = state.entries.filter(
            item => String(item.customerId) !== String(id)
        );

        state.payments = state.payments.filter(
            item => String(item.customerId) !== String(id)
        );

        saveData();
        renderAll();
        showToast("Customer deleted successfully");
        return;
    }


    // EDIT MILK ENTRY
    const editSession = event.target.closest("[data-edit-session]");

    if (editSession) {
        const entry = state.entries.find(
            item => String(item.id) === String(editSession.dataset.editSession)
        );

        if (entry) {
            openEntryForm(
                entry,
                editSession.dataset.session || "morning"
            );
        }

        return;
    }


    // DELETE MILK ENTRY
    const deleteEntry = event.target.closest("[data-delete-entry]");

    if (deleteEntry) {
        const id = deleteEntry.dataset.deleteEntry;

        if (!confirm("Delete this complete daily milk record?")) return;

        state.entries = state.entries.filter(
            item => String(item.id) !== String(id)
        );

        saveData();
        renderAll();
        showToast("Milk entry deleted successfully");
        return;
    }


    // DELETE PAYMENT
    const deletePayment = event.target.closest("[data-delete-payment]");

    if (deletePayment) {
        const id = deletePayment.dataset.deletePayment;

        const payment = state.payments.find(
            item => String(item.id) === String(id)
        );

        if (!payment) {
            showToast("Payment record not found");
            return;
        }

        if (!confirm(
            `Delete this payment of ${money(payment.amount)}?`
        )) return;

        state.payments = state.payments.filter(
            item => String(item.id) !== String(id)
        );

        saveData();
        renderAll();
        showToast("Payment deleted successfully");
        return;
    }

});

// -----------------------------------------
// RENDER EVERYTHING
// -----------------------------------------

function renderAll() {
    renderCustomers();
    renderEntries();
    renderPayments();
    renderDashboard();

    if (!reportGenerated) {
        clearReport();
    }
}

// -----------------------------------------
// INITIAL SETUP
// -----------------------------------------

$("todayLabel").textContent = new Date().toLocaleDateString(
    "en-PK",
    {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
    }
);

$("entryDateFilter").value = today();

setReportDates("10");
renderAll();
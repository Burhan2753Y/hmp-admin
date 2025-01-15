const express = require("express");
const http = require("http");
const db = require("./db.js")
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bodyParser = require('body-parser');
const path = require("path")
const pdf = require("./pdf-generator.js");

const app = express()
const server = http.createServer(app)

// Configuring
//CONFIGURING SERVER
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: "burhan",
    saveUninitialized: true,
    resave: false,
    cookie: { secure: false, maxAge: 600000 } //SET TO 10 MIN
}));


// Set public folder for static files
app.use(express.static(__dirname + '/public'));
// Set EJS as templating engine
app.set('views', path.join(__dirname, 'views')); // Directory for EJS templates
app.set('view engine', 'ejs');

//MiddleWare
// MIDDLEWARE
const requireAuth = (req, res, next) => {
    // console.log(req.session.userId)
    if (req.session.userId !== undefined) {
        next(); // User is authenticated, continue to next middleware
    } else {
        // console.log("middleware redirected")
        res.redirect('/'); // User is not authenticated, redirect to login page
    }
}

//Root page login form
app.get("/", (req, res) => {
    if (req.session.error == undefined) {
        req.session.error = "";
    }
    res.render("login", { error: req.session.error })
})

//Handle Login
app.post("/login", async (req, res) => {
    const userId = req.body.username;
    const password = req.body.password;

    if (await db.authenticateUser(parseInt(userId), password)) {
        // console.log("User Authenticated")
        req.session.userId = userId;
        req.session.error = "";
        res.redirect("/dashboard");
    }
    else {
        req.session.error = "Pls enter valid credentials"
        res.redirect("/")
    }
})

//Dashboard
app.get("/dashboard", requireAuth, async (req, res) => {
    const total_income = await db.getIncomeSum();
    const total_expense = await db.getExpenseSum();
    const year = "1446H";
    res.render("dashboard", { total_income: total_income, total_expense: total_expense, year: year })
})

//Receipt List
app.get("/receipts", requireAuth, async (req, res) => {
    const data = await db.getAllReceipt();
    for (var i = 0; i < data.length; i++) {
        data[i].name = await db.getMemberNameByIts(data[i].its_no);
        data[i].type = await db.getFundType(data[i].category_id)
    }
    res.render("receiptList", { data: data })
})

//Receipt Form
app.get("/generateReceipt", requireAuth, async (req, res) => {
    const receipt_no = await db.getLastReceiptNumber()
    res.render("receiptForm", { receipt_no: receipt_no + 1 })
})

//Receipt Form Submissions
app.post("/generateReceipt", requireAuth, async (req, res) => {
    //User Inputs
    const its_no = req.body.its_no
    const name = await db.getMemberNameByIts(its_no);
    const fund_type = req.body.fund_type
    const date = req.body.date
    const amount = req.body.amount
    const payment_method = req.body.payment_method
    const remarks = req.body.remarks

    //Code Generated
    const words = `(${pdf.RsinWords(amount)})`
    const receipt_no = await db.getLastReceiptNumber() + 1;

    const data = {
        its_no: its_no,
        category_id: fund_type,
        fund_type: await db.getFundType(fund_type),
        date: date,
        receipt_no: receipt_no,
        name: name,
        amount: amount,
        words: words,
        payment_method: payment_method,
        particular: remarks
    }
    await pdf.generate_receipt_pdf(data)
    await db.insertIncome(data)
    res.render("download", { fileUrl: `/download/receipt?filePath=Receipt-${receipt_no}.pdf`, redirectUrl: "/generateReceipt" })
})

app.get("/download/receipt", requireAuth, (req, res) => {
    filePath = req.query.file;
    if (!filePath) {
        return res.status(400).send('File parameter is required');
    }
    res.download(`receipts/${filePath}`, (err) => {
        if (err) {
            console.error(err);
            res.status(err.status || 500).send('File not found or server error.');
        }
    });
})
//Add Zakereen Member Form  --To do
app.get("/addMember", requireAuth, async (req, res) => {
    res.render("memberForm", {})
})

//Add Zakereen Member Form Submission  --To do
app.post("/addMember", requireAuth, async (req, res) => {
    //User Inputs
    const its_no = req.body.its_no
    const name = req.body.name
    const fund_type = req.body.fund_type
    const date = req.body.date
    const amount = req.body.amount
    const payment_method = req.body.payment_method
    const remarks = req.body.remarks

    //Code Generated
    const words = `(${pdf.RsinWords(amount)})`
    const receipt_no = await db.getLastReceiptNumber() + 1;

    const data = {
        its_no: its_no,
        category_id: fund_type,
        fund_type: await db.getFundType(fund_type),
        date: date,
        receipt_no: receipt_no,
        name: name,
        amount: amount,
        words: words,
        payment_method: payment_method,
        particular: remarks
    }
    await pdf.generate_receipt_pdf(data)
    await db.insertIncome(data)
    res.download(`receipts/Receipt-${receipt_no}.pdf`)
})

//For query and gui features
app.get("/suggestion", requireAuth, async (req, res) => {
    const name = req.query.name;
    const its_no = req.query.its_no;
    var results;
    if (name != undefined) { results = await db.getUserData(name, 1) }
    else { results = await db.getUserData(its_no, 0) }
    var response = results.flatMap(Object.values);
    // Split into even and odd index arrays
    const its_no_array = response.filter((_, index) => index % 2 === 0);
    const names_array = response.filter((_, index) => index % 2 !== 0);
    if (name != undefined) { res.json({ data: names_array }) }
    else { res.json({ data: its_no_array }) }

})
app.get("/getItsByName", requireAuth, async (req, res) => {
    const full_name = req.query.full_name;
    const its_no = await db.getItsByMemberName(full_name);
    res.json({ its_no: its_no })
})
app.get("/getNameByIts", requireAuth, async (req, res) => {
    const its_no = req.query.its_no;
    const full_name = await db.getMemberNameByIts(its_no);
    res.json({ full_name: full_name })
})

// API for other Applications
app.post("/authenticateMembers", async (req, res) => {
    const userId = req.body.username;
    const password = req.body.password;

    const valid_member = await db.authenticateMembers(parseInt(userId), password)
    if (valid_member) {
        const data = { status: valid_member }
        res.json(data)
    } else {
        const data = { status: false }
        res.json(data)
    }
})



server.listen(8000, () => {
    console.log("Server Running")
})

import express from "express";
import nodemailer from "nodemailer";
import { sendPoshResultMail } from "../services/mailer.js";


const router = express.Router();

router.post("/submit", async (req, res) => {
  try {
    const { name, email, score, total } = req.body;

    if (!name || !email || score === undefined || !total) {
      return res.status(400).json({ error: "Invalid POSH payload" });
    }

    console.log("📝 POSH Quiz Submitted:", {
      name,
      email,
      score,
      total,
    });

    // 🔧 TEMP: test email (replace later)
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.TEST_MAIL_USER,
        pass: process.env.TEST_MAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"POSH Training" <${process.env.TEST_MAIL_USER}>`,
      to: process.env.TEST_MAIL_RECEIVER,
      subject: "POSH Quiz Result (Test)",
      text: `
Name: ${name}
Email: ${email}
Score: ${score}/${total}
      `,
    });

    res.json({ success: true, message: "POSH submission successful" });
  } catch (err) {
    console.error("❌ POSH ROUTE ERROR:", err);
    res.status(500).json({ error: "POSH submission failed" });
  }
});

export default router;

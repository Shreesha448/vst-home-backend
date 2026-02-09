import nodemailer from "nodemailer";

/**
 * Create reusable mail transporter
 * Uses ENV variables (safe for prod)
 */
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.MAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/**
 * Send POSH quiz result email
 */
export async function sendPoshResultMail({ name, email, score, total }) {
  const mailOptions = {
    from: `"POSH Training" <${process.env.MAIL_USER}>`,
    to: process.env.MAIL_RECEIVER, // HR / test inbox
    subject: "POSH Quiz Submission",
    text: `
POSH Training Quiz Completed

Name   : ${name}
Email  : ${email}
Score  : ${score} / ${total}

Submitted at: ${new Date().toLocaleString()}
    `,
  };

  return transporter.sendMail(mailOptions);
}

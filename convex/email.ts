"use node";
import { action } from "./_generated/server";
import { v } from "convex/values";
import nodemailer from "nodemailer";

export const send = action({
  args: {
    to: v.string(),
    cc: v.optional(v.string()),
    subject: v.string(),
    body: v.string(),
    companyName: v.string(),
    domain: v.string(),
    founderName: v.string(),
  },
  handler: async (ctx, args) => {
    const { to, cc, subject, body, companyName, domain, founderName } = args;

    if (!process.env.SMTP_HOST) {
      throw new Error("SMTP_HOST is not defined");
    }

    const port = Number(process.env.SMTP_PORT) || 587;
    const isSecure = port === 465;

    console.log(`Sending email with: host=${process.env.SMTP_HOST}, port=${port}, secure=${isSecure}, user=${process.env.SMTP_USER}`);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: port,
      secure: isSecure, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    try {
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Founder Outreach" <hello@example.com>',
        to,
        ...(cc && { cc }), // Only include cc if it's provided
        subject,
        html: body, // Assuming the body is HTML
      });

      console.log("Message sent: %s", info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error("Failed to send email");
    }
  },
});

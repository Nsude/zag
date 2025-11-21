import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { markCompanyAsContacted } from '@/app/lib/db';

export async function POST(request: Request) {
  const { to, subject, body, companyName, domain, founderName } = await request.json();

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.log("Mock Sending Email:", { to, subject, body });
    // Mark as contacted even if mocked, for testing flow
    markCompanyAsContacted({
        domain,
        companyName,
        founderName,
        email: to,
        sentAt: new Date().toISOString()
    });
    return NextResponse.json({ success: true, message: 'Email mocked (configure SMTP to send real)' });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text: body,
    });

    markCompanyAsContacted({
        domain,
        companyName,
        founderName,
        email: to,
        sentAt: new Date().toISOString()
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}

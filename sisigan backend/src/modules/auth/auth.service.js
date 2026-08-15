// src/modules/auth/auth.service.js

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../../config/db');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// Setup email transporter (configure with your email service)
// This is a basic example - adjust based on your email provider
const emailTransporter = nodemailer.createTransport({
  service: 'gmail', // or your email provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Generate a random 6-digit numeric code
function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send email with reset code
async function sendResetEmail(email, code) {
  try {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Harvey's Sisigan - Password Reset Code",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2 style="color: #8B4513;">Harvey's Special Crispy Sisig</h2>
          <p>Password Reset Request</p>
          <p>Your verification code is:</p>
          <h1 style="color: #D2691E; letter-spacing: 5px; font-weight: bold;">${code}</h1>
          <p>This code will expire in 30 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="font-size: 12px; color: #666;">Harvey's Special Crispy Sisig - Point of Sale System</p>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send reset email');
  }
}

// UPDATED LOGIN FUNCTION — now blocks disabled users and disabled branches
async function login(email, password, metadata = {}) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      email: true,
      password: true,
      role: true,
      isActive: true, // NEW
      branch: { select: { id: true, name: true, city: true, isActive: true } }, // NEW: isActive
    },
  });

  if (!user) {
    throw new Error('Invalid email or password.');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    throw new Error('Invalid email or password.');
  }

  // NEW — block disabled user accounts
  if (!user.isActive) {
    throw new Error('This account has been disabled. Please contact your administrator.');
  }

  // NEW — block login when the user's branch is disabled.
  // OWNER accounts are exempted here since owners oversee all branches
  // rather than being tied to one. Remove the role check if you want
  // owners blocked too.
  if (user.role !== 'OWNER' && user.branch && !user.branch.isActive) {
    throw new Error('This branch has been disabled. Please contact your administrator.');
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, branchId: user.branch?.id },
    process.env.JWT_SECRET || 'your_secret_key_here'
  );

  // Log the login attempt
  if (metadata?.ipAddress) {
    try {
      await prisma.authLog.create({
        data: {
          userId: user.id,
          action: 'LOGIN',
          role:      user.role, 
          branchId:  user.branch?.id, 
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    } catch (_) {
      // Silently fail if logging fails
    }
  }

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branch: user.branch,
    },
  };
}

// EXISTING LOGOUT FUNCTION (keep as-is)
async function logout(user, metadata = {}) {
  if (metadata?.ipAddress) {
    try {
      await prisma.authLog.create({
        data: {
          userId: user.id,
          action: 'LOGOUT',
          role:      user.role, 
          branchId:  user.branch?.id, 
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
        },
      });
    } catch (_) {
      // Silently fail if logging fails
    }
  }
  return { message: 'Logged out successfully.' };
}

// NEW - Request password reset
async function forgotPassword(email) {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    // For security, don't reveal if email exists
    // Always return success message
    return { message: 'If email exists, a verification code will be sent.' };
  }

  // Generate reset code
  const resetCode = generateResetCode();
  const codeExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  // Store reset code in database (create a new table or store in user table)
  // Using prisma.passwordReset table (you need to create this in schema)
  const passwordReset = await prisma.passwordReset.create({
    data: {
      userId: user.id,
      code: resetCode,
      expiresAt: codeExpiry,
      used: false,
    },
  });

  // Send email with reset code
  await sendResetEmail(email, resetCode);

  return { message: 'Verification code sent to your email.' };
}

// NEW - Verify reset code
async function verifyResetCode(email, code) {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error('Invalid email address.');
  }

  // Find valid reset code
  const resetRecord = await prisma.passwordReset.findFirst({
    where: {
      userId: user.id,
      code: code,
      used: false,
      expiresAt: {
        gt: new Date(), // Code must not be expired
      },
    },
  });

  if (!resetRecord) {
    throw new Error('Invalid or expired verification code.');
  }

  return { message: 'Code verified successfully.' };
}

// NEW - Reset password
async function resetPassword(email, code, newPassword) {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error('Invalid email address.');
  }

  // Verify code exists and is valid
  const resetRecord = await prisma.passwordReset.findFirst({
    where: {
      userId: user.id,
      code: code,
      used: false,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  if (!resetRecord) {
    throw new Error('Invalid or expired verification code.');
  }

  // Hash the new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update user password
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  // Mark reset code as used
  await prisma.passwordReset.update({
    where: { id: resetRecord.id },
    data: { used: true },
  });

  return { message: 'Password reset successfully.' };
}

module.exports = {
  login,
  logout,
  forgotPassword,
  verifyResetCode,
  resetPassword,
};
import { z } from 'zod';

export const StudentLoginSchema = z.object({
  rollNo: z.string().min(1, 'Roll number is required'),
  password: z.string().min(1, 'Password is required')
});
export type StudentLoginInput = z.infer<typeof StudentLoginSchema>;

export const AdminLoginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
});
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;

export const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(4, 'New password must be at least 4 characters')
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export type UserRole = 'student' | 'admin';

export interface AuthUser {
  id: string;
  name: string;
  rollNo?: string;
  username?: string;
  mustChangePassword?: boolean;
}

export interface AuthMeResponse {
  role: UserRole;
  user: AuthUser;
}

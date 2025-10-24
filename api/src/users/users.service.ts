import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.findUnique({
        where: { email: email.toLowerCase() }
      })
    );
  }

  async getOrCreateInvitedUser(email: string, displayName: string): Promise<User> {
    const normalizedEmail = email.toLowerCase();
    const existing = await this.findByEmail(normalizedEmail);
    if (existing) {
      return existing;
    }

    return this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.create({
        data: {
          email: normalizedEmail,
          displayName,
          status: 'INVITED'
        }
      })
    );
  }

  async assertUserExists(userId: string): Promise<User> {
    const user = await this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.findUnique({ where: { id: userId } })
    );
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateUserStatus(userId: string, status: Prisma.UserUpdateInput['status']): Promise<User> {
    return this.prisma.runWithClaims({ roles: ['system'] }, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: { status }
      })
    );
  }
}

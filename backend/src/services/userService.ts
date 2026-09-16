import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { ErrorCodes } from '../constants/errorCodes';
import { Messages } from '../constants/messages';
import { Role } from '../models/role';
import { User } from '../models/user';
import { AuthUser, JwtPayload } from '../types/auth';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';
import { signCarbonToken } from '../utils/jwt';

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  region: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ProfileInput {
  username?: string;
  avatar?: string;
  region?: string;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Role) private readonly roleRepo: Repository<Role>
  ) {}

  serialize(user: User): AuthUser {
    return {
      id: Number(user.id),
      email: user.email,
      username: user.username,
      region: user.region,
      roles: user.roles?.map((role) => role.name) || []
    };
  }

  async register(input: RegisterInput) {
    logTemplate('info', 'USER_REGISTER_START', { email: input.email });
    const existing = await this.userRepo.findOne({ where: [{ email: input.email }, { username: input.username }] });
    if (existing) {
      logTemplate('warn', 'USER_REGISTER_FAILED', { email: input.email, reason: 'email or username duplicate' });
      throw new AppError(ErrorCodes.USER_EMAIL_DUPLICATE, `User[email=${input.email}] register failed: email duplicate`, HttpStatus.CONFLICT);
    }
    const memberRole = await this.roleRepo.findOne({ where: { name: 'member' } });
    const user = this.userRepo.create({
      username: input.username,
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 10),
      avatar: '',
      region: input.region || process.env.DEFAULT_REGION || 'Shanghai',
      roles: memberRole ? [memberRole] : []
    });
    const saved = await this.userRepo.save(user);
    logTemplate('info', 'USER_REGISTER_SUCCESS', { id: saved.id, region: saved.region });
    return { message: Messages.USER_CREATED, user: this.serialize(saved) };
  }

  async login(input: LoginInput) {
    logTemplate('info', 'USER_LOGIN_START', { email: input.email });
    const user = await this.userRepo.findOne({ where: { email: input.email } });
    if (!user) {
      logTemplate('warn', 'USER_LOGIN_FAILED', { email: input.email, reason: 'email not found' });
      throw new AppError(ErrorCodes.USER_NOT_FOUND, `User[email=${input.email}] login failed: email not found`, HttpStatus.NOT_FOUND);
    }
    const passwordOk = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordOk) {
      logTemplate('warn', 'USER_LOGIN_FAILED', { email: input.email, reason: 'password invalid' });
      throw new AppError(ErrorCodes.USER_PASSWORD_INVALID, `User[email=${input.email}] login failed: password invalid`, HttpStatus.UNAUTHORIZED);
    }
    const payload: JwtPayload = { sub: Number(user.id), email: user.email, username: user.username, region: user.region, roles: user.roles.map((r) => r.name) };
    const token = signCarbonToken(payload);
    logTemplate('info', 'USER_LOGIN_SUCCESS', { id: user.id, roles: payload.roles.join(',') });
    return { message: Messages.USER_LOGIN_OK, token, user: this.serialize(user) };
  }

  async findById(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, `User[id=${id}] read failed: id not found`, HttpStatus.NOT_FOUND);
    }
    return user;
  }

  async updateProfile(userId: number, input: ProfileInput) {
    logTemplate('info', 'USER_PROFILE_UPDATE_START', { id: userId, field: Object.keys(input).join(',') || 'none' });
    const user = await this.findById(userId);
    user.username = input.username ?? user.username;
    user.avatar = input.avatar ?? user.avatar;
    user.region = input.region ?? user.region;
    try {
      const saved = await this.userRepo.save(user);
      logTemplate('info', 'USER_PROFILE_UPDATE_SUCCESS', { id: userId, region: saved.region });
      return { message: Messages.USER_PROFILE_UPDATED, user: this.serialize(saved) };
    } catch (error) {
      logTemplate('error', 'USER_PROFILE_UPDATE_FAILED', { id: userId, field: 'profile', reason: String(error) });
      throw new AppError(ErrorCodes.DATABASE_FAILED, `User[id=${userId}] update failed: profile ${String(error)}`);
    }
  }
}


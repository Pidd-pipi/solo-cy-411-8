import { Body, Controller, Get, HttpStatus, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ErrorCodes } from '../constants/errorCodes';
import { AppError } from '../utils/AppError';
import { logTemplate } from '../utils/logger';
import { RequireAuth } from '../middlewares/auth';
import { LoginInput, ProfileInput, RegisterInput, UserService } from '../services/userService';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
  async register(@Body() body: RegisterInput) {
    try {
      return await this.userService.register(body);
    } catch (error: any) {
      logTemplate('error', 'USER_REGISTER_FAILED', { email: body.email, reason: error.message });
      throw new AppError(error.code || ErrorCodes.VALIDATION_FAILED, `User[email=${body.email}] controller register failed: ${error.message}`, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Post('login')
  async login(@Body() body: LoginInput) {
    try {
      return await this.userService.login(body);
    } catch (error: any) {
      logTemplate('error', 'USER_LOGIN_FAILED', { email: body.email, reason: error.message });
      throw new AppError(error.code || ErrorCodes.AUTH_TOKEN_INVALID, `User[email=${body.email}] controller login failed: ${error.message}`, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Get('me')
  @UseGuards(RequireAuth)
  async me(@Req() request: Request) {
    const user = await this.userService.findById(request.user!.id);
    return { user: this.userService.serialize(user) };
  }

  @Patch('me')
  @UseGuards(RequireAuth)
  async updateProfile(@Req() request: Request, @Body() body: ProfileInput) {
    request.auditEntity = 'User';
    request.auditAction = 'User profile update';
    try {
      return await this.userService.updateProfile(request.user!.id, body);
    } catch (error: any) {
      throw new AppError(error.code || ErrorCodes.DATABASE_FAILED, `User[id=${request.user!.id}] controller update failed: profile ${error.message}`, error.status || HttpStatus.BAD_REQUEST);
    }
  }
}


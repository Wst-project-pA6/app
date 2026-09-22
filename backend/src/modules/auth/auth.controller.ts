import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { AuthService, RegisteredUser, TokenPair } from './auth.service';
import { LoginRateLimiter } from './login-rate-limiter';
import { AuthOperationRateLimiter } from './auth-operation-rate-limiter';
import { LoginDto } from './dto/login.dto';
import { RefreshRequest } from './dto/refresh.dto';
import { LogoutRequest } from './dto/logout.dto';
import { ChangePasswordRequest } from './dto/change-password.dto';
import { RegisterRequest } from './dto/register.dto';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedPrincipal } from './authenticated-principal';
import { Public } from '../../common/auth/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly loginRateLimiter: LoginRateLimiter,
    private readonly authOperationRateLimiter: AuthOperationRateLimiter,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenPair> {
    const result = this.loginRateLimiter.consume(dto.email, request.ip ?? '');
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        ErrorCode.RATE_LIMITED,
        'Too many login attempts',
      );
    }

    return this.authService.login(dto);
  }

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RegisteredUser> {
    const result = this.authOperationRateLimiter.consumeRegister(request.ip ?? '');
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many registration attempts');
    }
    return this.authService.register(dto);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenPair> {
    const result = this.authOperationRateLimiter.consumeRefresh(request.ip ?? '');
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many refresh attempts');
    }
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthenticatedPrincipal, @Body() dto: LogoutRequest): Promise<void> {
    await this.authService.logout(user.id, dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedPrincipal,
    @Body() dto: ChangePasswordRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const result = this.authOperationRateLimiter.consumeChangePassword(user.id, request.ip ?? '');
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many password change attempts');
    }
    await this.authService.changePassword(user.id, dto);
  }

  @Get('me')
  getCurrentUser(@CurrentUser() user: AuthenticatedPrincipal): AuthenticatedPrincipal {
    return user;
  }
}

import { Controller, Post, Get, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, SsoLoginDto, PinLoginDto, ForgotPasswordDto } from './dto/auth.dto';

@ApiTags('Authentication & Identity Federation')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Authenticate user with corporate email & password' })
  @ApiResponse({ status: 200, description: 'Authentication successful with JWT & user session profile' })
  @ApiResponse({ status: 401, description: 'Invalid corporate credentials' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('sso')
  @ApiOperation({ summary: 'Authenticate via Enterprise SSO (Microsoft Azure AD, Google Workspace, Okta SAML)' })
  ssoLogin(@Body() dto: SsoLoginDto) {
    return this.authService.ssoLogin(dto);
  }

  @Post('pin-login')
  @ApiOperation({ summary: 'Shopfloor quick sign-in using operator PIN or workstation badge' })
  pinLogin(@Body() dto: PinLoginDto) {
    return this.authService.pinLogin(dto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset verification email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user session' })
  getCurrentSession(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-id') userId: string,
  ) {
    return this.authService.getCurrentSession(
      tenantId || 'default-tenant-skilglobal',
      userId || 'user-admin-01',
    );
  }
}

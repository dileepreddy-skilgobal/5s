import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { SessionService } from '../../core/auth/session.service';
import { JwtStrategy } from '../../core/auth/jwt.strategy';
import { getJwtSecret } from '../../core/auth/jwt.config';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({ secret: getJwtSecret() }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MfaService, SessionService, JwtStrategy],
  exports: [AuthService, MfaService, SessionService],
})
export class AuthModule {}

import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { CurrentUserId, TenantId } from '../../core/auth/current-user.decorator';
import { Roles } from '../../core/guards/roles.decorator';
import { RoleGroups } from '../../core/guards/role-groups';
import { RequiresFeature } from '../../core/subscription/subscription.guard';
import { API_KEY_ROLES, ApiKeysService } from '../../core/integrations/api-keys.service';
import { EVENT_NAMES, WebhooksService } from '../../core/integrations/webhooks.service';

export class CreateApiKeyDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsIn(API_KEY_ROLES) roleCode: string;
  @IsBoolean() readOnly: boolean;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class CreateWebhookDto {
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['https', 'http'] }) @MaxLength(500) url: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) events: string[];
}

export class UpdateWebhookDto {
  @IsOptional() @IsUrl({ require_tld: false, require_protocol: true, protocols: ['https', 'http'] }) @MaxLength(500) url?: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) events?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('api/v1/api-keys')
@Roles(...RoleGroups.ORG_ADMINS)
@RequiresFeature('API_ACCESS')
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Get()
  @ApiOperation({ summary: 'API keys of this organization (the secret is never returned again)' })
  list(@TenantId() tenantId: string) {
    return this.keys.list(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create an API key; the key is returned once. Send it as the X-API-Key header.' })
  create(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Body() dto: CreateApiKeyDto) {
    return this.keys.create(tenantId, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key immediately' })
  revoke(@TenantId() tenantId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.keys.revoke(tenantId, id);
  }
}

@ApiTags('Integrations')
@ApiBearerAuth()
@Controller('api/v1/webhooks')
@Roles(...RoleGroups.ORG_ADMINS)
@RequiresFeature('WEBHOOKS')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @Get('events')
  @ApiOperation({ summary: 'Event names that can be subscribed to ("*" = all)' })
  events() {
    return { events: EVENT_NAMES };
  }

  @Get()
  @ApiOperation({ summary: 'Webhook endpoints' })
  list(@TenantId() tenantId: string) {
    return this.webhooks.list(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Register an endpoint (https). Returns the signing secret once.' })
  create(@TenantId() tenantId: string, @CurrentUserId() userId: string, @Body() dto: CreateWebhookDto) {
    return this.webhooks.create(tenantId, userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change URL, events or enable / disable' })
  update(@TenantId() tenantId: string, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateWebhookDto) {
    return this.webhooks.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an endpoint and its delivery history' })
  remove(@TenantId() tenantId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.webhooks.remove(tenantId, id);
  }

  @Post(':id/rotate-secret')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Issue a new signing secret (returned once)' })
  rotate(@TenantId() tenantId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.webhooks.rotateSecret(tenantId, id);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a signed "ping" event now and report the result' })
  test(@TenantId() tenantId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.webhooks.test(tenantId, id);
  }

  @Get(':id/deliveries')
  @ApiOperation({ summary: 'Last 50 deliveries with status and response code' })
  deliveries(@TenantId() tenantId: string, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.webhooks.deliveries(tenantId, id);
  }

  @Post('deliveries/:deliveryId/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed delivery' })
  retry(@TenantId() tenantId: string, @Param('deliveryId', new ParseUUIDPipe()) deliveryId: string) {
    return this.webhooks.retry(tenantId, deliveryId);
  }
}

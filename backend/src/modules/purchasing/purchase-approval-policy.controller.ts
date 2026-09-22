import { Body, Controller, Get, Put } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  PurchaseApprovalPolicyResponse,
  PurchaseApprovalPolicyUpdateDto,
} from './dto/purchase-approval-policy.dto';
import { PurchaseApprovalPolicyService } from './purchase-approval-policy.service';

@Controller('config/purchase-approval-policy')
export class PurchaseApprovalPolicyController {
  constructor(private readonly service: PurchaseApprovalPolicyService) {}

  @Get()
  @Permissions('config.read', 'purchasing.read')
  getPolicy(): Promise<PurchaseApprovalPolicyResponse> {
    return this.service.getPolicy();
  }

  @Put()
  @Permissions('config.manage')
  replacePolicy(
    @Body() dto: PurchaseApprovalPolicyUpdateDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<PurchaseApprovalPolicyResponse> {
    return this.service.replacePolicy(dto, actor);
  }
}

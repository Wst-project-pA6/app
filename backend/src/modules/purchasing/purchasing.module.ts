import { Module } from '@nestjs/common';
import { AuditModule } from '../../common/audit/audit.module';
import { AccessModule } from '../access/access.module';
import { InventoryModule } from '../inventory/inventory.module';
import { GoodsReceiptsService } from './goods-receipts.service';
import { PurchaseApprovalPolicyController } from './purchase-approval-policy.controller';
import { PurchaseApprovalPolicyRepository } from './purchase-approval-policy.repository';
import { PurchaseApprovalPolicyService } from './purchase-approval-policy.service';
import { PurchaseApprovalsService } from './purchase-approvals.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersRepository } from './purchase-orders.repository';
import { PurchaseOrdersService } from './purchase-orders.service';
import { VendorsController } from './vendors.controller';
import { VendorsRepository } from './vendors.repository';
import { VendorsService } from './vendors.service';

@Module({
  imports: [AccessModule, AuditModule, InventoryModule],
  controllers: [
    PurchaseApprovalPolicyController,
    VendorsController,
    PurchaseOrdersController,
  ],
  providers: [
    PurchaseApprovalPolicyRepository,
    PurchaseApprovalPolicyService,
    VendorsRepository,
    VendorsService,
    PurchaseOrdersRepository,
    PurchaseOrdersService,
    PurchaseApprovalsService,
    GoodsReceiptsService,
  ],
  exports: [
    PurchaseApprovalPolicyRepository,
    PurchaseApprovalPolicyService,
    VendorsRepository,
    VendorsService,
    PurchaseOrdersRepository,
    PurchaseOrdersService,
    PurchaseApprovalsService,
    GoodsReceiptsService,
  ],
})
export class PurchasingModule {}

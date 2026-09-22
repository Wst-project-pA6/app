import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  CreateServiceReminderDto,
  CreateVehicleDto,
  ServiceHistoryQuery,
  ServiceReminderListQuery,
  UpdateServiceReminderDto,
  UpdateVehicleDto,
  VehicleListQuery,
} from './dto/vehicle.dto';
import { VehiclesService } from './vehicles.service';

@Controller()
export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}

  @Get('vehicles')
  @Permissions('vehicles.read')
  list(
    @Query() query: VehicleListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.list(query, actor);
  }

  @Post('vehicles')
  @Permissions('vehicles.write')
  create(
    @Body() dto: CreateVehicleDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.create(dto, actor);
  }

  @Get('vehicles/:vehicleId')
  @Permissions('vehicles.read')
  get(
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.get(vehicleId, actor);
  }

  @Patch('vehicles/:vehicleId')
  @Permissions('vehicles.write')
  update(
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Body() dto: UpdateVehicleDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(vehicleId, dto, actor);
  }

  @Get('vehicles/:vehicleId/service-history')
  @Permissions('vehicles.read')
  listHistory(
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Query() query: ServiceHistoryQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.listHistory(vehicleId, query, actor);
  }

  @Get('vehicles/:vehicleId/reminders')
  @Permissions('vehicles.read')
  listReminders(
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Query() query: ServiceReminderListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.listReminders(vehicleId, query, actor);
  }

  @Post('vehicles/:vehicleId/reminders')
  @Permissions('vehicles.write')
  createReminder(
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Body() dto: CreateServiceReminderDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.createReminder(vehicleId, dto, actor);
  }

  @Patch('service-reminders/:reminderId')
  @Permissions('vehicles.write')
  updateReminder(
    @Param('reminderId', new ParseUUIDPipe()) reminderId: string,
    @Body() dto: UpdateServiceReminderDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.updateReminder(reminderId, dto, actor);
  }
}

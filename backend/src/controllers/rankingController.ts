import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RequireAuth } from '../middlewares/auth';
import { RankingService } from '../services/rankingService';
import { logTemplate } from '../utils/logger';

@Controller('ranking')
@UseGuards(RequireAuth)
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get()
  list(@Query('region') region?: string, @Query('start') start?: string, @Query('end') end?: string) {
    logTemplate('info', 'ACTIVITY_LIST_START');
    return this.rankingService.list(region, start, end);
  }
}

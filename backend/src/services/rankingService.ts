import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Activity } from '../models/activity';
import { User } from '../models/user';
import { logTemplate } from '../utils/logger';

@Injectable()
export class RankingService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Activity) private readonly activityRepo: Repository<Activity>
  ) {}

  async list(region?: string, start?: string, end?: string) {
    logTemplate('info', 'ACTIVITY_LIST_START');
    const users = await this.userRepo.find({ where: region ? { region } : {}, order: { username: 'ASC' } });
    const result = await Promise.all(
      users.map(async (user) => {
        const rows = await this.activityRepo.find({
          where: {
            userId: Number(user.id),
            ...(start && end ? { recordDate: Between(start, end) } : {})
          }
        });
        const total = rows.reduce((sum, row) => sum + Number(row.carbonValue), 0);
        return { userId: Number(user.id), username: user.username, region: user.region, avatar: user.avatar, totalCarbon: Number(total.toFixed(2)) };
      })
    );
    return result.sort((a, b) => a.totalCarbon - b.totalCarbon).map((item, index) => ({ ...item, rank: index + 1 }));
  }
}

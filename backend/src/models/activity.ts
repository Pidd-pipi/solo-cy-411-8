import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ActivityCategory } from '../constants/activity';
import { CarbonFactor } from './carbonFactor';
import { User } from './user';

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: number;

  @Column({ name: 'factor_id', type: 'bigint', nullable: true })
  factorId!: number | null;

  // 固化的因子版本快照：发布新版本或停用旧版本都不回写这些列，
  // 因此既有活动的 carbon_value 永远保持创建/修改当时的结果。
  @Column({ name: 'factor_version', type: 'int', nullable: true })
  factorVersion!: number | null;

  @Column({ name: 'factor_value_snapshot', type: 'decimal', precision: 12, scale: 4, nullable: true })
  factorValueSnapshot!: string | null;

  @Column({ name: 'factor_effective_date', type: 'date', nullable: true })
  factorEffectiveDate!: string | null;

  @Column({ type: 'enum', enum: ActivityCategory })
  category!: ActivityCategory;

  @Column({ name: 'sub_type', length: 64 })
  subType!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: string;

  @Column({ length: 32 })
  unit!: string;

  @Column({ name: 'carbon_value', type: 'decimal', precision: 12, scale: 2 })
  carbonValue!: string;

  @Column({ name: 'record_date', type: 'date' })
  recordDate!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note!: string | null;

  @ManyToOne(() => User, (user) => user.activities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => CarbonFactor, (factor) => factor.activities, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'factor_id' })
  factor!: CarbonFactor | null;
}

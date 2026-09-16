import { Column, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ActivityCategory } from '../constants/activity';
import { Activity } from './activity';

@Entity('carbon_factors')
export class CarbonFactor {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: number;

  @Column({ type: 'enum', enum: ActivityCategory })
  category!: ActivityCategory;

  @Column({ name: 'sub_type', length: 64 })
  subType!: string;

  @Column({ name: 'factor_value', type: 'decimal', precision: 12, scale: 4 })
  factorValue!: string;

  @Column({ length: 32 })
  unit!: string;

  @Column({ length: 64 })
  region!: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  @OneToMany(() => Activity, (activity) => activity.factor)
  activities!: Activity[];
}

